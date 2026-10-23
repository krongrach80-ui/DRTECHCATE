import crypto from 'crypto';
import { AppError } from '../../middleware/errorHandler';
import { IKioskRepository, defaultKioskRepository, PairingRecord, KioskDeviceRecord, MissionRunRecord, MissionStepRecord } from './repository';
import { getEnv } from '../../config/env';
import { defaultCourseRepository } from '../courses/repository';
import { defaultPatientRepository } from '../patients/repository';
import { defaultDirectoryRepository } from '../directory/repository';
import { dispatchHospitalEvent } from '../events/routes';
import { KioskMissionStepInput, KioskFinishMissionInput } from './schema';

export class KioskService {
  private readonly IP_MAX_ATTEMPTS = 5;
  private readonly IP_LOCK_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  private readonly CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
  private readonly CODE_MAX_ATTEMPTS = 3;
  private readonly GLOBAL_MAX_ATTEMPTS = 50; // Max 50 failed attempts globally in 15 min

  constructor(
    private repo: IKioskRepository = defaultKioskRepository,
    private secretOverride?: string
  ) {}

  public setRepository(repo: IKioskRepository): void {
    this.repo = repo;
  }

  private getHmacSecret(): string {
    if (this.secretOverride) return this.secretOverride;
    try {
      return getEnv().KIOSK_PAIRING_SECRET;
    } catch {
      return 'kiosk-pairing-hmac-secret-min-16-chars-for-dev';
    }
  }

  /**
   * Generates a 6-character pairing code using crypto.randomInt (Requirement 2)
   */
  public generateCodeRandomInt(): string {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[crypto.randomInt(0, chars.length)];
    }
    return code;
  }

  /**
   * Computes HMAC-SHA256 of the pairing code using the env secret (Requirement 2)
   */
  public computeHmacSha256(code: string): string {
    const secret = this.getHmacSecret();
    return crypto
      .createHmac('sha256', secret)
      .update(code.trim().toUpperCase())
      .digest('hex');
  }

  /**
   * Constant-time comparison between submitted code and stored HMAC-SHA256 digest
   */
  public verifyCodeConstantTime(inputCode: string, storedHmacHex: string): boolean {
    const secret = this.getHmacSecret();
    const inputHmacBuffer = crypto
      .createHmac('sha256', secret)
      .update(inputCode.trim().toUpperCase())
      .digest();

    let storedHmacBuffer: Buffer;
    try {
      storedHmacBuffer = Buffer.from(storedHmacHex, 'hex');
    } catch {
      return false;
    }

    if (inputHmacBuffer.length !== storedHmacBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(inputHmacBuffer, storedHmacBuffer);
  }

  /**
   * Admin-only: Generate a single-use pairing code valid for exactly 10 minutes.
   * 1. Uses crypto.randomInt to generate random code
   * 2. Stores ONLY the HMAC-SHA256 in DB, never plain text
   * 3. Resets failure count and unlocks code in DB if generating new code for kiosk
   */
  async generatePairingCode(kioskId: string): Promise<{ code: string; expiresInSeconds: number }> {
    // 1. Generate code using crypto.randomInt
    const plainCode = this.generateCodeRandomInt();

    // 2. Compute HMAC-SHA256 with env secret
    const codeHmac = this.computeHmacSha256(plainCode);

    const expiresAt = new Date(Date.now() + this.CODE_EXPIRY_MS);

    const record: PairingRecord = {
      kioskId,
      codeHash: codeHmac,
      expiresAt,
      failedAttempts: 0,
      isUsed: false,
      isLocked: false,
      createdAt: new Date(),
    };

    // Stored in database
    await this.repo.savePairingRecord(record);

    return {
      code: plainCode,
      expiresInSeconds: 600, // 10 minutes
    };
  }

  /**
   * Kiosk device pairing redemption:
   * Enforces DB-backed limits:
   * 1. Global /api/kiosk/pair rate limit (DB-persisted)
   * 2. Per-IP brute-force limit (DB-persisted, max 5 fails / 15 min -> 429)
   * 3. Per-code/kiosk brute-force limit (DB-persisted, max 3 fails -> 403 lock)
   * 4. 10-minute expiry
   * 5. Single-use enforcement
   * 6. Constant-time HMAC-SHA256 verification
   */
  async pairDevice(
    kioskId: string,
    inputCode: string,
    clientIp: string
  ): Promise<{ deviceToken: string; kiosk: { id: string; name: string; location?: string | null } }> {
    // 1. Check Global rate limit from DB
    const globalFailures = await this.repo.getGlobalFailureCount(this.IP_LOCK_WINDOW_MS);
    if (globalFailures >= this.GLOBAL_MAX_ATTEMPTS) {
      throw new AppError(
        'Global pairing endpoint is temporarily throttled due to excessive failed attempts. Please try again later.',
        429,
        'GLOBAL_PAIRING_RATE_LIMIT'
      );
    }

    // 2. Check IP rate limit from DB
    const ipFailures = await this.repo.getIpFailureCount(clientIp, this.IP_LOCK_WINDOW_MS);
    if (ipFailures >= this.IP_MAX_ATTEMPTS) {
      throw new AppError(
        'Too many failed pairing attempts from this IP. Please try again in 15 minutes.',
        429,
        'TOO_MANY_FAILED_ATTEMPTS'
      );
    }

    // 3. Lookup pairing record from DB
    const record = await this.repo.getPairingRecord(kioskId);
    if (!record) {
      await this.repo.recordIpFailure(clientIp);
      await this.repo.recordGlobalFailure();
      throw new AppError('Invalid or nonexistent pairing target', 400, 'INVALID_PAIRING_CODE');
    }

    // 4. Check if locked due to per-code brute force (> 3 attempts) in DB
    if (record.isLocked || record.failedAttempts >= this.CODE_MAX_ATTEMPTS) {
      await this.repo.recordIpFailure(clientIp);
      await this.repo.recordGlobalFailure();
      throw new AppError(
        'Pairing code has been locked due to excessive failed attempts',
        403,
        'PAIRING_CODE_LOCKED'
      );
    }

    // 5. Check if already used (Single-use invariant)
    if (record.isUsed) {
      await this.repo.recordIpFailure(clientIp);
      await this.repo.recordGlobalFailure();
      throw new AppError('Pairing code has already been used', 400, 'PAIRING_CODE_ALREADY_USED');
    }

    // 6. Check if expired (10-minute expiry)
    if (Date.now() > record.expiresAt.getTime()) {
      await this.repo.recordIpFailure(clientIp);
      await this.repo.recordGlobalFailure();
      throw new AppError('Pairing code has expired (10-minute limit exceeded)', 400, 'PAIRING_CODE_EXPIRED');
    }

    // 7. Verify submitted code using CONSTANT-TIME HMAC-SHA256 comparison
    const isMatch = this.verifyCodeConstantTime(inputCode, record.codeHash);

    if (!isMatch) {
      const attempts = await this.repo.recordKioskCodeFailure(kioskId);
      await this.repo.recordIpFailure(clientIp);
      await this.repo.recordGlobalFailure();

      if (attempts >= this.CODE_MAX_ATTEMPTS) {
        throw new AppError(
          'Pairing code has been locked due to excessive failed attempts',
          403,
          'PAIRING_CODE_LOCKED'
        );
      }

      throw new AppError('Invalid pairing code', 400, 'INVALID_PAIRING_CODE');
    }

    // 8. Successful match: generate high-entropy device token (32 bytes)
    const deviceToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(deviceToken).digest('hex');

    // Mark as used in database
    await this.repo.markPairingUsed(kioskId, tokenHash);

    // Fetch kiosk info for response
    const kiosk = await this.repo.getKioskById(kioskId);

    return {
      deviceToken,
      kiosk: {
        id: kioskId,
        name: kiosk?.name || 'Kiosk Device',
        location: kiosk?.location,
      },
    };
  }

  async listDevices(): Promise<Array<{ id: string; name: string; location: string | null; is_active: boolean; paired_at: string | null }>> {
    const list = await this.repo.listDevices();
    return list.map((k) => ({
      id: k.id,
      name: k.name,
      location: k.location,
      is_active: k.is_active,
      paired_at: k.paired_at,
    }));
  }

  async createDevice(name: string, location?: string | null): Promise<{ id: string; name: string; location: string | null; is_active: boolean }> {
    const k = await this.repo.createDevice(name, location);
    return {
      id: k.id,
      name: k.name,
      location: k.location,
      is_active: k.is_active,
    };
  }

  async listStaffCalls(): Promise<Array<{ id: string; kiosk_id: string; reason: string; created_at: string; handled_by: string | null; handled_at: string | null }>> {
    return this.repo.listStaffCalls();
  }

  async handleStaffCall(id: string, staffId: string): Promise<boolean> {
    return this.repo.handleStaffCall(id, staffId);
  }

  async getKioskSession(token: string) {
    return this.repo.getKioskSession(token);
  }

  // =========================================================================
  // DAILY MISSION METHODS (Master Prompt v3 Section 9 & 14)
  // =========================================================================
  async getPlan(patientId: string, kioskId?: string): Promise<{
    courseId: string;
    patientId: string;
    patientFirstName: string;
    avatarUrl: string | null;
    doctorNotes: string | null;
    exercises: Array<{
      id: string;
      title: string;
      description: string | null;
      image_path: string | null;
      target_sets: number;
      target_reps: number;
      target_duration_seconds?: number;
    }>;
    includeMinigame: boolean;
    minigameTitle?: string;
    minigameQuestion?: {
      id: string;
      prompt: string;
      choices: string[];
      answer: string;
    } | null;
  } | null> {
    const patient = await defaultPatientRepository.getPatientById(patientId);
    if (!patient) return null;

    const todayStr = new Date().toISOString().split('T')[0];
    const todayCourses = await defaultCourseRepository.getTodayAppointments(todayStr, kioskId || null);
    const course = todayCourses.find((c) => c.patient_id === patientId);

    if (!course) {
      return null;
    }

    const exercises = await Promise.all(
      (course.items || []).map(async (it, idx) => {
        let title = it.exercise?.title;
        let description: string | null = null;
        let imagePath: string | null = null;
        if (!title && it.exercise_id) {
          const ex = await defaultDirectoryRepository.getExerciseById(it.exercise_id);
          if (ex) {
            title = ex.title;
            description = ex.description || null;
            imagePath = ex.image_path || null;
          }
        }
        return {
          id: it.exercise_id || `ex-${idx}`,
          title: title || `ท่ากายภาพที่ ${idx + 1}`,
          description,
          image_path: imagePath,
          target_sets: it.sets || 3,
          target_reps: it.reps || 10,
          target_duration_seconds: 30,
        };
      })
    );

    let minigameQuestion = null;
    let minigameTitle = 'มินิเกมฝึกความจำและประสาทสัมผัส';
    if (course.include_minigame) {
      const minigames = await defaultDirectoryRepository.listMinigames();
      if (minigames.length > 0) {
        const game = minigames[0];
        minigameTitle = game.title;
        const questions = await defaultDirectoryRepository.listQuestionsByMinigame(game.id);
        if (questions.length > 0) {
          const q = questions[0];
          minigameQuestion = {
            id: q.id,
            prompt: q.prompt,
            choices: q.choices,
            answer: q.answer,
          };
        }
      }

      if (!minigameQuestion) {
        minigameQuestion = {
          id: 'default-q-1',
          prompt: 'ภาพใดต่อไปนี้คือท่าบริหารกล้ามเนื้อที่เพิ่งฝึกไป?',
          choices: ['ยืดเหยียดต้นขา', 'กระดกข้อเท้า', 'หมุนหัวไหล่', 'ยกแขนเหนือศีรษะ'],
          answer: 'ยืดเหยียดต้นขา',
        };
      }
    }

    return {
      courseId: course.id,
      patientId: patient.id,
      patientFirstName: patient.first_name,
      avatarUrl: null,
      doctorNotes: course.goals || course.progression_criteria || null,
      exercises,
      includeMinigame: !!course.include_minigame,
      minigameTitle,
      minigameQuestion,
    };
  }

  async verifyKioskDevice(deviceIdOrToken: string): Promise<KioskDeviceRecord | null> {
    const byId = await this.repo.getKioskById(deviceIdOrToken);
    if (byId) return byId;

    const tokenHash = crypto.createHash('sha256').update(deviceIdOrToken).digest('hex');
    const byHash = await this.repo.getKioskByTokenHash(tokenHash);
    if (byHash) return byHash;

    return this.repo.getKioskByTokenHash(deviceIdOrToken);
  }

  async recordStep(patientId: string, input: KioskMissionStepInput): Promise<{ step: MissionStepRecord; run: MissionRunRecord }> {
    const todayStr = new Date().toISOString().split('T')[0];
    const run = await this.repo.getOrCreateMissionRun(patientId, input.course_id, todayStr);
    const step = await this.repo.recordMissionStep(run.id, input.step_type, input.ref_id, input.score);

    // Notify listeners via SSE (PT & Admin dashboard realtime queue status)
    dispatchHospitalEvent({
      event: 'kiosk_mission_step',
      patientId,
      data: {
        runId: run.id,
        courseId: input.course_id,
        patientId,
        stepType: input.step_type,
        refId: input.ref_id,
        status: 'in_progress',
        completedAt: step.completed_at,
      },
    });

    return { step, run };
  }

  async finishMission(patientId: string, input: KioskFinishMissionInput): Promise<{ run: MissionRunRecord | null }> {
    const todayStr = new Date().toISOString().split('T')[0];
    const run = await this.repo.completeMissionRun(
      patientId,
      input.course_id,
      todayStr
    );

    // Notify listeners via SSE (Patient finished treatment)
    dispatchHospitalEvent({
      event: 'kiosk_mission_completed',
      patientId,
      data: {
        courseId: input.course_id,
        patientId,
        status: 'completed',
        finishedAt: run?.finished_at,
      },
    });

    return { run };
  }
}

