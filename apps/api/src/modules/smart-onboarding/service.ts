/**
 * apps/api/src/modules/smart-onboarding/service.ts
 * Smart Onboarding, Biometric Auth & Dual-Sync Core Service
 * Master Prompt v4: Sovereign Isolated Medical-Grade Architecture
 */

import { logger } from '../../middleware/logger';
import { dispatchHospitalEvent } from '../events/routes';
import {
  PatientRecordFile,
  RehabScoreEntry,
  computeAverageVector,
  evaluateBiometricMatch,
  PrescribedExercise,
} from '../../../../../packages/smart-biometric-core/src/index.js';
import { PatientVaultService, defaultPatientVaultService } from './vault.service';
import { getAdminClient } from '../../lib/supabase/adminClient';
import { IDirectoryRepository, defaultDirectoryRepository } from '../directory/repository';
import { IPatientRepository, defaultPatientRepository } from '../patients/repository';
import { ICourseRepository, defaultCourseRepository } from '../courses/repository';
import { IRecordsRepository, defaultRecordsRepository } from '../records/repository';

export interface ExerciseItem {
  id: string;
  name: string;
  target_joint: string;
  target_angle?: number;
  safety_warnings?: string;
  demo_url?: string;
  default_sets: number;
  default_reps: number;
}

export interface ModpackItem {
  id: string;
  name: string;
  description?: string;
  target_condition: string;
  exercises: PrescribedExercise[];
  items?: any[];
  include_minigame: boolean;
}

export class SmartOnboardingService {
  private vaultService: PatientVaultService;
  private directoryRepo: IDirectoryRepository;
  private patientRepo: IPatientRepository;
  private courseRepo: ICourseRepository;
  private recordsRepo: IRecordsRepository;

  constructor(
    vaultService: PatientVaultService = defaultPatientVaultService,
    directoryRepo: IDirectoryRepository = defaultDirectoryRepository,
    patientRepo: IPatientRepository = defaultPatientRepository,
    courseRepo: ICourseRepository = defaultCourseRepository,
    recordsRepo: IRecordsRepository = defaultRecordsRepository
  ) {
    this.vaultService = vaultService;
    this.directoryRepo = directoryRepo;
    this.patientRepo = patientRepo;
    this.courseRepo = courseRepo;
    this.recordsRepo = recordsRepo;
  }

  /**
   * 1. Auto-Presence & 5s Cooldown Face Scan Login (Master Prompt v4 Section 2 Step 1)
   */
  public async scanLogin(
    probeVector: number[],
    snapshotBase64?: string
  ): Promise<{
    matched: boolean;
    patient?: PatientRecordFile;
    similarity?: number;
    distance?: number;
    similarityPercentage?: number;
    message?: string;
  }> {
    const records = this.vaultService.listAllPatientRecords();
    let bestMatch: {
      record: PatientRecordFile;
      similarity: number;
      distance: number;
      percent: number;
    } | null = null;

    for (const record of records) {
      if (record.biometrics && record.biometrics.face_vector) {
        const result = evaluateBiometricMatch(probeVector, record.biometrics.face_vector);
        if (result.isMatch) {
          if (!bestMatch || result.cosineSimilarity > bestMatch.similarity) {
            bestMatch = {
              record,
              similarity: result.cosineSimilarity,
              distance: result.euclideanDistance,
              percent: result.similarityPercentage,
            };
          }
        }
      }
    }

    if (bestMatch) {
      const patient = bestMatch.record;
      logger.info(
        `[FACE-AUTH] Calculated Distance: ${bestMatch.distance} | Similarity: ${bestMatch.percent}% | Matched Patient: ${patient.first_name} (${patient.patient_id})`
      );

      // Record snapshot to login_history/
      if (snapshotBase64) {
        try {
          const rawBase64 = snapshotBase64.replace(/^data:image\/\w+;base64,/, '');
          const buf = Buffer.from(rawBase64, 'base64');
          this.vaultService.recordLoginSnapshot(patient.patient_id, buf);
        } catch (err) {
          logger.warn({ err }, 'Failed to save login snapshot');
        }
      }

      return {
        matched: true,
        patient,
        similarity: bestMatch.similarity,
        distance: bestMatch.distance,
        similarityPercentage: bestMatch.percent,
      };
    }

    // No match found
    return {
      matched: false,
      message: 'ไม่พบบัญชีในระบบ กรุณาติดต่อแอดมิน หรือกดปุ่ม "ยังไม่มีบัญชี (สมัครใหม่ด้วยใบหน้า)"',
    };
  }

  /**
   * 2. Instant Face-First Account Creation (Master Prompt v4 Section 2 Step 2.1 & 2.2)
   */
  public async createPendingAccount(payload: {
    frames: Array<{ pose: string; embedding: number[]; jpeg_base64?: string }>;
    model_version?: string;
  }): Promise<{
    patient_id: string;
    hn: string;
    registration_status: string;
    profile_face_url: string;
  }> {
    if (!payload.frames || payload.frames.length < 5) {
      throw new Error('At least 5 frames are required for face template creation');
    }

    // Extract average L2 normalized embedding
    const vectors = payload.frames.map((f) => f.embedding);
    const avgVector = computeAverageVector(vectors);

    // Generate unique patient_id e.g. P-1001
    const randomCode = Math.floor(1000 + Math.random() * 9000);
    const patient_id = `P-${randomCode}`;
    const hn = patient_id;

    // Decode profile image from first frame (compressed JPEG)
    let profileBuffer: Buffer | undefined;
    const firstJpeg = payload.frames.find((f) => f.jpeg_base64)?.jpeg_base64;
    if (firstJpeg) {
      const rawBase64 = firstJpeg.replace(/^data:image\/\w+;base64,/, '');
      profileBuffer = Buffer.from(rawBase64, 'base64');
    } else {
      profileBuffer = Buffer.from('mock-profile-jpeg');
    }

    const now = new Date().toISOString();
    const newRecord: PatientRecordFile = {
      patient_id,
      hn,
      first_name: 'รอลงข้อมูล',
      last_name: '',
      age: 0,
      gender: 'unspecified',
      phone: '',
      initial_symptoms: 'รอการซักประวัติ',
      registration_status: 'face_registered_pending_info',
      registered_via: 'kiosk',
      created_at: now,
      updated_at: now,
      biometrics: {
        face_vector: avgVector,
        registered_face_url: `/uploads/patients/${patient_id}/profile_face.jpg`,
        confidence_score: 0.95,
        model_version: payload.model_version || 'w600k_r50',
        enrolled_at: now,
      },
      schedule: null,
      daily_checklists: {},
      rehab_scores: [],
      clinical: {
        diagnosis: '',
        treatment_plan: '',
        progress_notes: [],
      },
    };

    // Save to Vault on disk
    this.vaultService.savePatientRecord(patient_id, newRecord, profileBuffer);

    // Sync into Supabase PostgreSQL (fail-soft if in offline/test environment)
    try {
      const supabase = getAdminClient();
      await supabase.from('patients').insert({
        hn,
        first_name: 'รอลงข้อมูล',
        last_name: `(${patient_id})`,
        age: 0,
        sex: 'OTHER',
        injury: 'รอลงข้อมูล',
        registration_status: 'awaiting_face',
        registered_via: 'kiosk',
      });
    } catch (dbErr) {
      logger.warn({ dbErr }, 'Supabase database sync bypassed (using file vault)');
    }

    // Real-Time Notification to Admin/PT Dashboard (SSE & Realtime)
    dispatchHospitalEvent({
      event: 'patient_registered',
      patientId: patient_id,
      data: {
        patient_id,
        hn,
        first_name: 'รอลงข้อมูล',
        registration_status: 'face_registered_pending_info',
        photo_url: `/uploads/patients/${patient_id}/profile_face.jpg`,
        created_at: now,
      },
    });

    return {
      patient_id,
      hn,
      registration_status: 'face_registered_pending_info',
      profile_face_url: `/uploads/patients/${patient_id}/profile_face.jpg`,
    };
  }

  /**
   * 3. Complete Patient Personal Info (Dual-Channel: Kiosk or Admin PC)
   */
  public async completePatientInfo(
    patientId: string,
    info: {
      first_name: string;
      last_name: string;
      age: number;
      gender: string;
      phone?: string;
      initial_symptoms?: string;
    }
  ): Promise<PatientRecordFile> {
    const existing = this.vaultService.getPatientRecord(patientId);
    if (!existing) {
      throw new Error(`Patient vault for ${patientId} not found`);
    }

    const updatedRecord: PatientRecordFile = {
      ...existing,
      first_name: info.first_name,
      last_name: info.last_name,
      age: Number(info.age),
      gender: info.gender,
      phone: info.phone || existing.phone,
      initial_symptoms: info.initial_symptoms || existing.initial_symptoms,
      registration_status: 'active',
      updated_at: new Date().toISOString(),
    };

    // Save updated metadata to disk
    this.vaultService.savePatientRecord(patientId, updatedRecord);

    // Update Supabase PostgreSQL
    try {
      const supabase = getAdminClient();
      await supabase
        .from('patients')
        .update({
          first_name: info.first_name,
          last_name: info.last_name,
          age: Number(info.age),
          sex: info.gender === 'male' || info.gender === 'M' ? 'M' : 'F',
          phone: info.phone,
          injury: info.initial_symptoms || 'กายภาพทั่วไป',
          registration_status: 'active',
        })
        .or(`hn.eq.${existing.hn},id.eq.${patientId}`);
    } catch (dbErr) {
      logger.warn({ dbErr }, 'Supabase database update bypassed');
    }

    // Real-Time Notification to Kiosk & Admin: Completed!
    dispatchHospitalEvent({
      event: 'patient_info_completed',
      patientId,
      data: {
        patient_id: patientId,
        first_name: info.first_name,
        last_name: info.last_name,
        status: 'active',
      },
    });

    return updatedRecord;
  }

  /**
   * 4. List Pending Patients for Admin/PT Dashboard
   */
  public listPendingPatients(): PatientRecordFile[] {
    const all = this.vaultService.listAllPatientRecords();
    return all.filter((p) => p.registration_status === 'face_registered_pending_info');
  }

  /**
   * 5. Schedule Management (3-Step Wizard Save)
   */
  public async saveSchedule(patientId: string, schedule: any): Promise<PatientRecordFile> {
    const existing = this.vaultService.getPatientRecord(patientId);
    if (!existing) {
      throw new Error(`Patient vault for ${patientId} not found`);
    }

    const updated: PatientRecordFile = {
      ...existing,
      schedule,
      updated_at: new Date().toISOString(),
    };

    this.vaultService.savePatientRecord(patientId, updated);

    // Save into Supabase courses and course_items tables via courseRepo
    try {
      const dayAliasesMap: Record<string, number> = {
        Sun: 0, อาทิตย์: 0, 'อา.': 0,
        Mon: 1, จันทร์: 1, 'จ.': 1,
        Tue: 2, อังคาร: 2, 'อ.': 2,
        Wed: 3, พุธ: 3, 'พ.': 3,
        Thu: 4, พฤหัสบดี: 4, 'พฤ.': 4,
        Fri: 5, ศุกร์: 5, 'ศ.': 5,
        Sat: 6, เสาร์: 6, 'ส.': 6,
      };
      const days: string[] = schedule.daysOfWeek || schedule.days_of_week || [];
      const weekdays: number[] = days
        .map((d) => (typeof d === 'number' ? d : dayAliasesMap[d]))
        .filter((n) => typeof n === 'number' && !isNaN(n));

      const prescribed = schedule.assigned_exercises || schedule.prescribed_exercises || [];
      const courseItems = prescribed.map((ex: any, idx: number) => ({
        exercise_id: ex.exercise_id || ex.id,
        sets: ex.sets || 3,
        reps: ex.reps || 10,
        position: idx + 1,
      }));

      await this.courseRepo.createCourse(
        {
          patient_id: patientId,
          start_date: schedule.startDate || schedule.start_date || new Date().toISOString().slice(0, 10),
          end_date: schedule.endDate || schedule.end_date || new Date().toISOString().slice(0, 10),
          weekdays: weekdays.length > 0 ? weekdays : [1, 3, 5],
          start_time: schedule.timeSlot || schedule.time_slot || '09:00 - 10:00',
          kiosk_id: schedule.assigned_kiosk_id || schedule.kioskId || 'kiosk-01',
          include_minigame: Boolean(schedule.include_minigame),
        },
        'system',
        courseItems
      );
    } catch (courseErr) {
      logger.warn({ courseErr, patientId }, 'Supabase course save bypassed');
    }

    // Realtime event dispatch
    dispatchHospitalEvent({
      event: 'schedule_updated',
      patientId,
      data: {
        patient_id: patientId,
        schedule,
      },
    });

    return updated;
  }

  /**
   * 6. Dynamic Daily Rehab Plan (Asia/Bangkok timezone)
   */
  public getDailyPlan(
    patientId: string,
    currentDateStr?: string
  ): {
    is_scheduled_today: boolean;
    reason?: string;
    schedule?: any;
    exercises: PrescribedExercise[];
    include_minigame: boolean;
  } {
    const patient = this.vaultService.getPatientRecord(patientId);
    if (!patient || !patient.schedule) {
      return {
        is_scheduled_today: false,
        reason: 'ไม่มีตารางฝึกสำหรับผู้ป่วยรายนี้',
        schedule: null,
        exercises: [],
        include_minigame: false,
      };
    }

    const schedule: any = patient.schedule;
    let now: Date;
    if (currentDateStr) {
      // Decode potential unescaped '+' from query params (Express turns '+' into ' ')
      const sanitized = currentDateStr.includes(' ') ? currentDateStr.replace(' ', '+') : currentDateStr;
      const parsed = new Date(sanitized);
      now = isNaN(parsed.getTime()) ? new Date() : parsed;
    } else {
      now = new Date();
    }

    // Asia/Bangkok timezone calculation
    let bkkIsoDate: string;
    let bkkDayShort: string;
    try {
      bkkIsoDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(now);
      bkkDayShort = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Asia/Bangkok' }).format(now);
    } catch {
      const validDate = isNaN(now.getTime()) ? new Date() : now;
      bkkIsoDate = validDate.toISOString().split('T')[0];
      const daysMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      bkkDayShort = daysMap[validDate.getDay()];
    }

    const startDate = schedule.startDate || schedule.start_date || '1970-01-01';
    const endDate = schedule.endDate || schedule.end_date || '2099-12-31';
    const days: string[] = schedule.daysOfWeek || schedule.days_of_week || [];

    const isWithinDateRange = bkkIsoDate >= startDate && bkkIsoDate <= endDate;

    // Support Thai & English day names
    const dayAliases: Record<string, string[]> = {
      Sun: ['Sun', 'อาทิตย์', 'อา.'],
      Mon: ['Mon', 'จันทร์', 'จ.'],
      Tue: ['Tue', 'อังคาร', 'อ.'],
      Wed: ['Wed', 'พุธ', 'พ.'],
      Thu: ['Thu', 'พฤหัสบดี', 'พฤ.'],
      Fri: ['Fri', 'ศุกร์', 'ศ.'],
      Sat: ['Sat', 'เสาร์', 'ส.'],
    };
    const validAliases = dayAliases[bkkDayShort] || [bkkDayShort];
    const isDayScheduled = days.some((d) => validAliases.includes(d));

    const exercises = schedule.assigned_exercises || schedule.prescribed_exercises || [];
    const includeMinigame = Boolean(schedule.include_minigame);

    if (isWithinDateRange && isDayScheduled) {
      return {
        is_scheduled_today: true,
        schedule,
        exercises,
        include_minigame: includeMinigame,
      };
    }

    return {
      is_scheduled_today: false,
      reason: 'วันนี้เป็นวันพักผ่อนของคุณ หรือไม่มีรายการฝึกกายภาพสำหรับวันนี้',
      schedule,
      exercises: [],
      include_minigame: false,
    };
  }

  /**
   * Comprehensive Dossier Fetching (Master Prompt v6 Section 3)
   */
  public getPatientDossier(patientId: string) {
    return this.vaultService.getPatientDossier(patientId);
  }

  public listAllDossiers() {
    return this.vaultService.listAllDossiers();
  }

  /**
   * 7. Record Rehab Scores & Checklists
   */
  public async saveRehabScore(patientId: string, score: RehabScoreEntry): Promise<PatientRecordFile> {
    const existing = this.vaultService.getPatientRecord(patientId);
    if (!existing) {
      throw new Error(`Patient vault for ${patientId} not found`);
    }

    const updated: PatientRecordFile = {
      ...existing,
      rehab_scores: [...(existing.rehab_scores || []), score],
      updated_at: new Date().toISOString(),
    };

    this.vaultService.savePatientRecord(patientId, updated);

    // Save into Supabase treatment_results table via recordsRepo
    try {
      await this.recordsRepo.createTreatmentResult(
        patientId,
        JSON.stringify(score),
        'system'
      );
    } catch (recErr) {
      logger.warn({ recErr, patientId }, 'Supabase treatment_results save bypassed');
    }

    return updated;
  }

  /**
   * 8. Permanent Deletion (Database row + Folder on disk)
   */
  public async deletePatient(patientId: string): Promise<boolean> {
    const patient = this.vaultService.getPatientRecord(patientId);
    const hn = patient?.hn;

    // 1. Delete from PostgreSQL
    try {
      const supabase = getAdminClient();
      await supabase
        .from('patients')
        .delete()
        .or(`hn.eq.${hn || patientId},id.eq.${patientId}`);
    } catch (err) {
      logger.warn({ err, patientId }, 'Supabase database delete bypassed');
    }

    // 2. Delete patient vault from disk
    const diskDeleted = this.vaultService.deletePatientVault(patientId);

    // 3. Dispatch real-time deletion event
    dispatchHospitalEvent({
      event: 'patient_deleted',
      patientId,
      data: { patient_id: patientId },
    });

    return diskDeleted;
  }

  /**
   * 9. Exercise Library & Modpack CRUD (100% Repository & Supabase)
   */
  public async getExercises(): Promise<ExerciseItem[]> {
    try {
      const list = await this.directoryRepo.listExercises();
      return list.map((ex) => ({
        id: ex.id,
        name: ex.title,
        target_joint: ex.target_joint || '',
        target_angle: 90,
        safety_warnings: ex.warnings || '',
        demo_url: ex.image_path || '',
        default_sets: ex.default_sets || 3,
        default_reps: ex.default_reps || 10,
      }));
    } catch (err) {
      logger.warn({ err }, 'Failed to list exercises from directory repository');
      return [];
    }
  }

  public async saveExercise(item: ExerciseItem): Promise<ExerciseItem> {
    const created = await this.directoryRepo.createExercise(
      {
        title: item.name || (item as any).title,
        target_joint: item.target_joint,
        warnings: item.safety_warnings || (item as any).safety_precaution,
        image_path: item.demo_url,
        default_sets: item.default_sets ?? 3,
        default_reps: item.default_reps ?? 10,
        difficulty: ((item as any).difficulty as 'beginner' | 'intermediate' | 'advanced') || 'beginner',
      },
      'system'
    );

    return {
      id: created.id,
      name: created.title,
      target_joint: created.target_joint || '',
      target_angle: item.target_angle || 90,
      safety_warnings: created.warnings || '',
      demo_url: created.image_path || '',
      default_sets: created.default_sets || 3,
      default_reps: created.default_reps || 10,
    };
  }

  public async getModpacks(): Promise<ModpackItem[]> {
    try {
      const list = await this.directoryRepo.listModpacks();
      return list.map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description || '',
        target_condition: (m as any).target_condition || '',
        exercises: (m.items || []).map((it) => ({
          exercise_id: it.exercise_id,
          name: it.exercise?.title || '',
          target_joint: it.exercise?.target_joint || '',
          sets: it.sets,
          reps: it.reps,
        })),
        items: m.items,
        include_minigame: false,
      }));
    } catch (err) {
      logger.warn({ err }, 'Failed to list modpacks from directory repository');
      return [];
    }
  }

  public async saveModpack(modpack: ModpackItem): Promise<ModpackItem> {
    const rawItems = ((modpack as any).items || modpack.exercises || []);
    const items = rawItems.map((it: any, idx: number) => ({
      exercise_id: it.exercise_id,
      sets: it.sets || 3,
      reps: it.reps || 10,
      position: idx + 1,
    }));

    const created = await this.directoryRepo.createModpack(
      {
        name: modpack.name,
        description: modpack.description || null,
        items,
      },
      'system'
    );

    return {
      id: created.id,
      name: created.name,
      description: created.description || '',
      target_condition: modpack.target_condition || '',
      exercises: (created.items || []).map((it) => ({
        exercise_id: it.exercise_id,
        name: it.exercise?.title || '',
        target_joint: it.exercise?.target_joint || '',
        sets: it.sets,
        reps: it.reps,
      })),
      items: created.items,
      include_minigame: Boolean(modpack.include_minigame),
    };
  }
}

export const defaultSmartOnboardingService = new SmartOnboardingService();
