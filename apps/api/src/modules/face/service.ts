/**
 * apps/api/src/modules/face/service.ts
 * Core Face Biometric Enrollment & Verification Service
 * Strictly adheres to Master Prompt v3 Spec 7.3, 7.4 & Defense-in-Depth Invariants
 */

import { AppError } from '../../middleware/errorHandler';
import { getEnv } from '../../config/env';
import { logger } from '../../middleware/logger';
import { UserSession } from '../../middleware/authenticate';
import { AuditService, defaultAuditService } from '../audit/service';
import { dispatchHospitalEvent } from '../events/routes';
import {
  FaceEnrollInput,
  KioskFaceEnrollInput,
  FaceEnrollmentFrame,
} from './schema';
import {
  IFaceEnrollmentRepository,
  defaultFaceEnrollmentRepository,
} from './repository';
import { IPatientRepository, defaultPatientRepository } from '../patients/repository';

export function l2NormalizeVector(vec: number[]): number[] {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) {
    sumSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(sumSq);
  if (norm === 0) return vec.map(() => 0);
  return vec.map((v) => v / norm);
}

export function computeCosineSimilarity(v1: number[], v2: number[]): number {
  if (v1.length !== v2.length) return 0;
  let dot = 0;
  for (let i = 0; i < v1.length; i++) {
    dot += v1[i] * v2[i];
  }
  return dot;
}

export class FaceEnrollmentService {
  constructor(
    private faceRepo: IFaceEnrollmentRepository = defaultFaceEnrollmentRepository,
    private patientRepo: IPatientRepository = defaultPatientRepository,
    private auditService: AuditService = defaultAuditService
  ) {}

  public setRepository(repo: IFaceEnrollmentRepository): void {
    this.faceRepo = repo;
  }

  public setPatientRepository(repo: IPatientRepository): void {
    this.patientRepo = repo;
  }

  // =========================================================================
  // 1. STAFF-DRIVEN ENROLLMENT (POST /api/face/enroll)
  // =========================================================================
  async enrollStaff(
    input: FaceEnrollInput,
    actor: UserSession,
    ipAddress?: string
  ): Promise<{
    enrollment_id: string;
    patient_id: string;
    registration_status: string;
    message: string;
  }> {
    // PT can enroll ONLY patients under their active care or active transfer
    if (actor.role === 'pt') {
      const hasAccess = await this.faceRepo.isPatientAccessibleByPt(input.patient_id, actor.id);
      if (!hasAccess) {
        throw new AppError(
          'Forbidden: You do not have permission to enroll biometrics for this patient',
          403,
          'FORBIDDEN'
        );
      }
    }

    return this.executeEnrollmentCore({
      patientId: input.patient_id,
      staffId: actor.id,
      modelVersion: input.model_version || 'adaface-ir50-v1',
      frames: input.frames,
      consentId: input.consent_id,
      ticketId: input.ticket_id,
      actorType: 'staff',
      actorId: actor.id,
      ipAddress,
    });
  }

  // =========================================================================
  // 2. KIOSK-DRIVEN ENROLLMENT (POST /api/kiosk/enroll)
  // =========================================================================
  async enrollKiosk(
    input: KioskFaceEnrollInput,
    kioskDeviceId: string,
    ipAddress?: string
  ): Promise<{
    enrollment_id: string;
    patient_id: string;
    registration_status: string;
    message: string;
  }> {
    const env = getEnv();

    // Check enrollment ticket requirement unless ALLOW_KIOSK_SELF_ENROLL is true
    if (!input.ticket_id && !env.ALLOW_KIOSK_SELF_ENROLL) {
      throw new AppError(
        'Enrollment ticket is required for kiosk biometric enrollment. Please contact reception.',
        400,
        'ENROLLMENT_TICKET_REQUIRED'
      );
    }

    return this.executeEnrollmentCore({
      patientId: input.patient_id,
      staffId: kioskDeviceId,
      modelVersion: input.model_version || 'adaface-ir50-v1',
      frames: input.frames,
      ticketId: input.ticket_id,
      actorType: 'kiosk',
      actorId: kioskDeviceId,
      ipAddress,
    });
  }

  // =========================================================================
  // 3. CORE ENROLLMENT WORKFLOW (Spec 7.3)
  // =========================================================================
  private async executeEnrollmentCore(params: {
    patientId: string;
    staffId: string;
    modelVersion: string;
    frames: FaceEnrollmentFrame[];
    consentId?: string;
    ticketId?: string;
    actorType: 'staff' | 'kiosk';
    actorId: string;
    ipAddress?: string;
  }): Promise<{
    enrollment_id: string;
    patient_id: string;
    registration_status: string;
    message: string;
  }> {
    let T_CONSISTENCY: number | undefined;
    let T_DUPLICATE: number | undefined;
    try {
      const env = getEnv();
      T_CONSISTENCY = env.FACE_T_ENROLL_CONSISTENCY;
      T_DUPLICATE = env.FACE_T_DUPLICATE;
    } catch {
      // Missing required thresholds in env
    }

    // Fail-Closed: Thresholds must be configured
    if (!T_CONSISTENCY || !T_DUPLICATE) {
      throw new AppError(
        'Biometric enrollment rejected: Calibration thresholds are not configured',
        500,
        'FACE_THRESHOLDS_MISSING'
      );
    }

    // 1. Consent Verification (Spec 7.3.1 - Mandatory active consent before processing)
    const consent = await this.faceRepo.getActiveConsent(params.patientId, params.consentId);
    if (!consent) {
      throw new AppError(
        'Biometric processing rejected: Active patient consent required before enrollment (Spec 7.3.1)',
        400,
        'CONSENT_REQUIRED'
      );
    }

    // 2. Ticket Verification (if ticket_id provided)
    if (params.ticketId) {
      const ticket = await this.faceRepo.getEnrollmentTicket(params.ticketId);
      if (!ticket) {
        throw new AppError('Enrollment ticket not found', 404, 'TICKET_NOT_FOUND');
      }
      if (ticket.patient_id !== params.patientId) {
        throw new AppError('Enrollment ticket does not match patient ID', 400, 'INVALID_TICKET');
      }
      if (ticket.used_at) {
        throw new AppError('Enrollment ticket has already been used', 400, 'TICKET_ALREADY_USED');
      }
      if (new Date() > new Date(ticket.expires_at)) {
        throw new AppError('Enrollment ticket has expired (10-minute limit)', 400, 'TICKET_EXPIRED');
      }
    }

    // 3. Frame Pose Distribution Check (Spec 7.3.3: 4 front, 2 left, 2 right, 2 nod)
    const frontFrames = params.frames.filter((f) => f.pose === 'front');
    const leftFrames = params.frames.filter((f) => f.pose === 'left');
    const rightFrames = params.frames.filter((f) => f.pose === 'right');
    const nodFrames = params.frames.filter((f) => f.pose === 'nod');

    if (
      frontFrames.length !== 4 ||
      leftFrames.length !== 2 ||
      rightFrames.length !== 2 ||
      nodFrames.length !== 2
    ) {
      throw new AppError(
        `Invalid pose distribution: Requires exactly 4 front, 2 left, 2 right, 2 nod (received ${frontFrames.length} front, ${leftFrames.length} left, ${rightFrames.length} right, ${nodFrames.length} nod)`,
        400,
        'INVALID_POSE_FRAMES'
      );
    }

    // 4. L2 Normalize all embeddings
    const normalizedFrames = params.frames.map((f) => ({
      pose: f.pose,
      embedding: l2NormalizeVector(f.embedding),
      image_base64: f.image_base64 || f.jpeg_base64,
    }));

    const normalizedFront = normalizedFrames.filter((f) => f.pose === 'front');

    // 5. Intra-Session Consistency Check on Front Frames (Spec 7.3.4: All 6 pairs >= FACE_T_ENROLL_CONSISTENCY)
    for (let i = 0; i < normalizedFront.length; i++) {
      for (let j = i + 1; j < normalizedFront.length; j++) {
        const sim = computeCosineSimilarity(
          normalizedFront[i].embedding,
          normalizedFront[j].embedding
        );
        try {
          const env = getEnv();
          if (env.LOG_FACE_SCORES) {
            logger.debug(
              { sim, threshold: T_CONSISTENCY, pair: [i, j] },
              'Intra-session front pair similarity'
            );
          }
        } catch {
          // Ignore env read failure
        }
        if (sim < T_CONSISTENCY) {
          throw new AppError(
            'Face enrollment consistency check failed: Front face frames are inconsistent',
            400,
            'ENROLL_INCONSISTENT_FRAMES'
          );
        }
      }
    }

    // 6. Cross-Patient Duplicate Face Detection (Spec 7.3.3 / Item C3)
    const avgFront = new Array(512).fill(0);
    for (const f of normalizedFront) {
      for (let d = 0; d < 512; d++) {
        avgFront[d] += f.embedding[d];
      }
    }
    const normAvgFront = l2NormalizeVector(avgFront.map((v) => v / normalizedFront.length));

    const duplicateCandidate = await this.faceRepo.findDuplicateFaceCandidate(
      normAvgFront,
      params.patientId,
      T_DUPLICATE
    );

    if (duplicateCandidate) {
      try {
        const env = getEnv();
        if (env.LOG_FACE_SCORES) {
          logger.debug(
            {
              score: duplicateCandidate.score,
              threshold: T_DUPLICATE,
              matchedPatientId: duplicateCandidate.patient_id,
            },
            'Duplicate face candidate detected with score'
          );
        }
      } catch {
        // Ignore env read failure
      }

      // Record security audit log (Rule 2.10 & 11: Do not leak raw biometric scores or thresholds)
      await this.auditService.write({
        actor_type: params.actorType,
        actor_id: params.actorId,
        action: 'DUPLICATE_FACE_DETECTED',
        entity: 'patients',
        entity_id: params.patientId,
        ip: params.ipAddress,
        metadata: {
          patient_id: params.patientId,
          matched_patient_id: duplicateCandidate.patient_id,
        },
      });

      // Dispatch real-time alert via SSE (Rule 2.10 & 11: Do not leak raw biometric scores)
      dispatchHospitalEvent({
        event: 'duplicate_face_detected',
        patientId: params.patientId,
        data: {
          patientId: params.patientId,
          matchedPatientId: duplicateCandidate.patient_id,
        },
      });

      throw new AppError(
        'Duplicate face template detected: duplicate of another registered patient. Enrollment rejected for security and privacy protection.',
        409,
        'DUPLICATE_FACE_DETECTED'
      );
    }

    // 7. Atomic Database Transaction via RPC `enroll_face_atomic`
    const enrollmentId = await this.faceRepo.callEnrollFaceAtomic({
      patientId: params.patientId,
      staffId: params.staffId,
      modelVersion: params.modelVersion,
      poses: normalizedFrames.map((f) => f.pose),
      embeddings: normalizedFrames.map((f) => f.embedding),
      consentId: consent.id,
      ticketId: params.ticketId || null,
    });

    // 8. Image Upload to Private Storage (biometric-data/{patient_id}/{enrollmentId}/frame_01..10.jpg)
    // with Compensation (rollback database enrollment and delete uploaded files) on failure
    const uploadedFilePaths: string[] = [];
    const imageFramesToUpload: Array<{ frameIndex: number; buffer: Buffer }> = [];
    normalizedFrames.forEach((frame, idx) => {
      if (frame.image_base64) {
        try {
          const rawBase64 = frame.image_base64.replace(/^data:image\/\w+;base64,/, '');
          const buffer = Buffer.from(rawBase64, 'base64');
          if (buffer.length > 0 && buffer.length <= 1500000) {
            imageFramesToUpload.push({ frameIndex: idx, buffer });
          }
        } catch {
          // Ignore invalid image base64, proceed with vectors
        }
      }
    });

    if (imageFramesToUpload.length > 0) {
      try {
        const paths = await this.faceRepo.uploadBiometricImages(
          params.patientId,
          enrollmentId,
          imageFramesToUpload
        );
        uploadedFilePaths.push(...paths);
      } catch (uploadErr) {
        // =====================================================================
        // CRITICAL COMPENSATION: Rollback DB enrollment and delete uploaded files if storage fails!
        // =====================================================================
        if (uploadedFilePaths.length > 0) {
          await this.faceRepo.deleteBiometricFiles(uploadedFilePaths);
        }
        await this.faceRepo.rollbackEnrollment(enrollmentId, params.patientId);
        logger.error(
          { uploadErr, enrollmentId, patientId: params.patientId },
          'Rolling back face enrollment and uploaded images due to storage failure'
        );
        throw uploadErr;
      }
    }

    // 9. Memory Wipe: Clear vector references immediately
    normalizedFrames.forEach((f) => {
      f.embedding.fill(0);
    });

    // 10. Audit Log & Real-Time Event Dispatch
    await this.auditService.write({
      actor_type: params.actorType,
      actor_id: params.actorId,
      action: 'FACE_ENROLL_SUCCESS',
      entity: 'patients',
      entity_id: params.patientId,
      ip: params.ipAddress,
      metadata: {
        patient_id: params.patientId,
        enrollment_id: enrollmentId,
        model_version: params.modelVersion,
        frames_count: normalizedFrames.length,
        ticket_id: params.ticketId || null,
        consent_id: consent.id,
      },
    });

    dispatchHospitalEvent({
      event: 'enrollment_done',
      patientId: params.patientId,
      data: {
        patientId: params.patientId,
        enrollmentId,
        modelVersion: params.modelVersion,
      },
    });

    return {
      enrollment_id: enrollmentId,
      patient_id: params.patientId,
      registration_status: 'active',
      message: 'Face biometric template enrolled successfully.',
    };
  }

  // =========================================================================
  // 4. PDPA BIOMETRIC DELETION (DELETE /api/face/:patientId)
  // =========================================================================
  async deleteBiometrics(
    patientId: string,
    actor: UserSession,
    ipAddress?: string
  ): Promise<void> {
    const patient = await this.patientRepo.getPatientById(patientId);
    if (!patient) {
      throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND');
    }

    if (actor.role === 'pt') {
      const hasAccess = await this.faceRepo.isPatientAccessibleByPt(patientId, actor.id);
      if (!hasAccess) {
        throw new AppError(
          'Forbidden: You do not have permission to delete biometrics for this patient',
          403,
          'FORBIDDEN'
        );
      }
    }

    await this.faceRepo.deleteBiometrics(patientId);

    await this.auditService.write({
      actor_type: 'staff',
      actor_id: actor.id,
      action: 'patient.delete_biometrics',
      entity: 'patients',
      entity_id: patientId,
      ip: ipAddress,
      metadata: {
        hn: patient.hn,
        reason: 'PDPA right to erasure request',
      },
    });
  }
}

export const defaultFaceEnrollmentService = new FaceEnrollmentService();
