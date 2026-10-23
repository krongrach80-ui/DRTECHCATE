/**
 * apps/api/src/modules/kiosk/faceAuth.service.ts
 * Kiosk Facial Authentication Service per Master Prompt v3 Section 7.4
 * Separated cleanly from Kiosk Device Pairing per user architectural constraint.
 */

import crypto from 'crypto';
import { AppError } from '../../middleware/errorHandler';
import { getEnv } from '../../config/env';
import { KioskRepository, defaultKioskRepository } from './repository';
import { CourseRepository, defaultCourseRepository } from '../courses/repository';
import { PatientRepository, defaultPatientRepository } from '../patients/repository';
import { dispatchHospitalEvent } from '../events/routes';
import { VerifyFaceInput } from './schema';

export class KioskFaceAuthService {
  private readonly DEFAULT_CHALLENGE_EXPIRE_SECONDS = 60;
  private readonly MAX_FAILED_ATTEMPTS = 3;

  constructor(
    private kioskRepo: KioskRepository = defaultKioskRepository,
    private courseRepo: CourseRepository = defaultCourseRepository,
    private patientRepo: PatientRepository = defaultPatientRepository
  ) {}

  /**
   * 1. POST /api/kiosk/challenge
   * Generates a single-use 32-byte hex nonce and 2 random liveness challenge steps
   * Valid for 60 seconds (or env.FACE_CHALLENGE_EXPIRE_SECONDS).
   */
  async createChallenge(kioskId: string): Promise<{
    nonce: string;
    steps: ('left' | 'right' | 'nod')[];
    expiresInSeconds: number;
  }> {
    const env = getEnv();
    const expireSec = env.FACE_CHALLENGE_EXPIRE_SECONDS || this.DEFAULT_CHALLENGE_EXPIRE_SECONDS;

    // High-entropy 32-byte hex nonce
    const nonce = crypto.randomBytes(32).toString('hex');

    // Random 2 distinct gestures from {left, right, nod}
    const gestures: ('left' | 'right' | 'nod')[] = ['left', 'right', 'nod'];
    const shuffled = [...gestures].sort(() => Math.random() - 0.5);
    const steps = shuffled.slice(0, 2);

    const expiresAt = new Date(Date.now() + expireSec * 1000);

    // Save in repository
    await this.kioskRepo.saveChallenge(nonce, kioskId, steps, expiresAt);

    return {
      nonce,
      steps,
      expiresInSeconds: expireSec,
    };
  }

  /**
   * 2. POST /api/kiosk/verify
   * Evaluates face verification probe with candidate set pruning, dual criteria matching,
   * 3-failed-attempts lockout & staff call creation, and privacy minimization.
   */
  async verifyFace(
    input: VerifyFaceInput,
    _clientIp: string
  ): Promise<{
    sessionToken: string;
    candidate: {
      id: string;
      first_name: string;
      avatar_url: string;
    };
  }> {
    const env = getEnv();
    const T_ACCEPT = env.FACE_T_ACCEPT;
    const T_MARGIN = env.FACE_T_MARGIN;
    const T_REJECT = env.FACE_T_REJECT;

    // 1. Nonce single-use & expiration verification
    const challenge = await this.kioskRepo.getChallenge(input.nonce);
    if (!challenge) {
      throw new AppError('Invalid or nonexistent challenge nonce', 400, 'INVALID_NONCE');
    }

    if (challenge.used_at !== null) {
      throw new AppError('Challenge nonce has already been used (single-use violated)', 400, 'NONCE_ALREADY_USED');
    }

    if (new Date() > challenge.expires_at) {
      throw new AppError('Challenge nonce has expired (60s limit)', 400, 'NONCE_EXPIRED');
    }

    // Immediately mark nonce as used to prevent replay attacks
    await this.kioskRepo.markChallengeUsed(input.nonce);

    // 2. Candidate set pruning (Master prompt Section 7.4 Line 200)
    // Only patients with active courses today matching this kiosk or null + today's check-ins
    const todayStr = new Date().toISOString().split('T')[0];
    const todayCourses = await this.courseRepo.getTodayAppointments(todayStr, input.kiosk_id);
    const checkinPatientIds = await this.patientRepo.getTodayCheckinPatientIds(todayStr);

    const candidateSet = new Set<string>();
    for (const course of todayCourses) {
      candidateSet.add(course.patient_id);
    }
    for (const patientId of checkinPatientIds) {
      candidateSet.add(patientId);
    }

    const candidateIds = Array.from(candidateSet);

    // If candidate set is empty -> Person has no appointment today (DoD 1)
    if (candidateIds.length === 0) {
      await this.handleVerificationFailure(
        input.kiosk_id,
        'No appointment scheduled today and not checked in at reception'
      );
      throw new AppError(
        'No appointment found for today. Please contact reception.',
        401,
        'NO_APPOINTMENT_FOUND'
      );
    }

    // 3. Match probe against candidate templates in database
    const matches = await this.kioskRepo.matchFaceCandidates(input.probe, candidateIds);

    if (!matches || matches.length === 0) {
      await this.handleVerificationFailure(input.kiosk_id, 'No matching face template found in candidate set');
      throw new AppError('Face verification failed: no matching face template found', 401, 'FACE_VERIFY_FAILED');
    }

    const topCandidate = matches[0];

    // 4. Dual Criteria Evaluation (Master Prompt Section 7.4 Line 204)
    // Criterion A: Top candidate score >= FACE_T_ACCEPT
    if (topCandidate.score < T_ACCEPT) {
      const reason =
        topCandidate.score < T_REJECT
          ? 'Score below reject threshold'
          : `Score ${topCandidate.score.toFixed(3)} below acceptance threshold ${T_ACCEPT}`;
      await this.handleVerificationFailure(input.kiosk_id, reason);
      throw new AppError('Face verification failed: score below acceptance threshold', 401, 'FACE_VERIFY_FAILED');
    }

    // Criterion B: Margin requirement when >= 2 candidates (DoD 2)
    // "คนที่ 2 ผ่านเกณฑ์แต่ห่างอันดับ 1 ไม่พอถูกปฏิเสธ"
    if (matches.length >= 2) {
      const runnerUp = matches[1];
      const delta = topCandidate.score - runnerUp.score;
      if (delta < T_MARGIN) {
        await this.handleVerificationFailure(
          input.kiosk_id,
          `Ambiguous match: margin between top 2 candidates (${delta.toFixed(3)}) is less than required ${T_MARGIN}`
        );
        throw new AppError(
          `Face verification ambiguous: top 2 candidates too close (margin ${delta.toFixed(3)} < ${T_MARGIN})`,
          401,
          'FACE_VERIFY_AMBIGUOUS'
        );
      }
    }

    // 5. Verification SUCCESS
    // Reset failure counter on kiosk
    this.kioskRepo.resetFailedFaceAttempts(input.kiosk_id);

    // Issue active 15-minute kiosk session
    const session = await this.kioskRepo.createKioskSession(input.kiosk_id, topCandidate.patient_id);

    // Fetch patient record for privacy-minimized display
    const patient = await this.patientRepo.getPatientById(topCandidate.patient_id);

    // 6. Privacy Minimization (Master Prompt Line 205)
    // Returns ONLY first_name and short-lived avatar URL.
    // FULL NAME, HN, AND AGE ARE NEVER RETURNED BEFORE CONFIRMATION!
    return {
      sessionToken: session.token,
      candidate: {
        id: topCandidate.patient_id,
        first_name: patient?.first_name || 'Patient',
        avatar_url: `/api/patients/${topCandidate.patient_id}/avatar-signed`,
      },
    };
  }

  /**
   * 3. POST /api/kiosk/confirm-identity
   * Patient confirms or denies the identity displayed on kiosk
   */
  async confirmIdentity(
    sessionToken: string,
    confirmed: boolean
  ): Promise<{
    ok: boolean;
    confirmed: boolean;
    patient?: {
      id: string;
      hn: string;
      first_name: string;
      last_name: string;
    };
    message?: string;
  }> {
    if (!confirmed) {
      // Invalidate session immediately and require re-scan
      await this.kioskRepo.invalidateKioskSession(sessionToken);
      return {
        ok: false,
        confirmed: false,
        message: 'Identity rejected by patient. Session terminated, please re-scan.',
      };
    }

    const session = await this.kioskRepo.confirmKioskSession(sessionToken);
    if (!session) {
      throw new AppError('Invalid or expired kiosk session', 401, 'INVALID_SESSION');
    }

    const patient = await this.patientRepo.getPatientById(session.patient_id);
    if (!patient) {
      throw new AppError('Patient profile not found', 404, 'PATIENT_NOT_FOUND');
    }

    return {
      ok: true,
      confirmed: true,
      patient: {
        id: patient.id,
        hn: patient.hn,
        first_name: patient.first_name,
        last_name: patient.last_name,
      },
    };
  }

  /**
   * Triggers staff call manually or after 3 failed verification attempts
   */
  async createStaffCall(kioskId: string, reason: string): Promise<{ id: string; kiosk_id: string; reason: string }> {
    const call = await this.kioskRepo.createStaffCall(kioskId, reason);

    // Dispatch real-time SSE alert to staff and reception
    dispatchHospitalEvent({
      event: 'staff_call',
      data: {
        call_id: call.id,
        kiosk_id: kioskId,
        reason,
        created_at: call.created_at,
      },
    });

    return call;
  }

  /**
   * Helper: Handles failed verification attempt, increments counter,
   * and creates staff_calls record upon reaching 3 failures (DoD 3).
   */
  private async handleVerificationFailure(kioskId: string, reason: string): Promise<void> {
    const failedCount = this.kioskRepo.incrementFailedFaceAttempts(kioskId);

    if (failedCount >= this.MAX_FAILED_ATTEMPTS) {
      const call = await this.kioskRepo.createStaffCall(
        kioskId,
        `Excessive failed face verification (${failedCount} attempts): ${reason}`
      );

      // Dispatch SSE alert
      dispatchHospitalEvent({
        event: 'staff_call',
        data: {
          call_id: call.id,
          kiosk_id: kioskId,
          reason: 'Excessive failed face verification',
          failed_attempts: failedCount,
          created_at: call.created_at,
        },
      });
    }
  }

  getFailedAttempts(kioskId: string): number {
    return this.kioskRepo.getFailedFaceAttempts(kioskId);
  }
}
