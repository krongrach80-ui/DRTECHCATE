/**
 * apps/api/src/modules/smart-onboarding/service.ts
 * Smart Onboarding, Biometric Auth & Dual-Sync Core Service
 * Master Prompt v4: Sovereign Isolated Medical-Grade Architecture
 */

import fs from 'fs';
import path from 'path';
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
  include_minigame: boolean;
}

export class SmartOnboardingService {
  private vaultService: PatientVaultService;
  private exercisesFile: string;
  private modpacksFile: string;

  constructor(vaultService: PatientVaultService = defaultPatientVaultService) {
    this.vaultService = vaultService;
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.exercisesFile = path.join(dataDir, 'exercises.json');
    this.modpacksFile = path.join(dataDir, 'modpacks.json');
    this.seedDefaultDataIfEmpty();
  }

  private seedDefaultDataIfEmpty(): void {
    if (!fs.existsSync(this.exercisesFile)) {
      const defaultExercises: ExerciseItem[] = [
        {
          id: 'ex-01',
          name: 'ท่ายกแขนไปข้างหน้า (Shoulder Flexion)',
          target_joint: 'ข้อไหล่',
          target_angle: 90,
          safety_warnings: 'ไม่ควรยกเกินจุดที่รู้สึกเจ็บ',
          demo_url: '/uploads/exercises/shoulder_flexion.jpg',
          default_sets: 3,
          default_reps: 10,
        },
        {
          id: 'ex-02',
          name: 'ท่ากางแขนออกด้านข้าง (Shoulder Abduction)',
          target_joint: 'ข้อไหล่',
          target_angle: 90,
          safety_warnings: 'ระวังอย่ายกไหล่เกร็งชิดหู',
          demo_url: '/uploads/exercises/shoulder_abduction.jpg',
          default_sets: 3,
          default_reps: 10,
        },
        {
          id: 'ex-03',
          name: 'ท่ายืดเหยียดข้อเข่า (Knee Extension)',
          target_joint: 'ข้อเข่า',
          target_angle: 180,
          safety_warnings: 'เหยียดช้าๆ ค้างไว้ 3 วินาที',
          demo_url: '/uploads/exercises/knee_extension.jpg',
          default_sets: 3,
          default_reps: 12,
        },
        {
          id: 'ex-04',
          name: 'ท่ากระดกข้อเท้า (Ankle Dorsiflexion)',
          target_joint: 'ข้อเท้า',
          target_angle: 45,
          safety_warnings: 'ฝึกบนเก้าอี้ที่มั่นคง',
          demo_url: '/uploads/exercises/ankle_dorsi.jpg',
          default_sets: 3,
          default_reps: 15,
        },
      ];
      fs.writeFileSync(this.exercisesFile, JSON.stringify(defaultExercises, null, 2), 'utf-8');
    }

    if (!fs.existsSync(this.modpacksFile)) {
      const defaultModpacks: ModpackItem[] = [
        {
          id: 'mod-shoulder',
          name: 'คอร์สฟื้นฟูไหล่ติด (Frozen Shoulder Pack)',
          description: 'เพิ่มองศาการเคลื่อนไหวข้อไหล่และกล้ามเนื้อสะบัก',
          target_condition: 'ข้อไหล่ติด / เอ็นข้อไหล่อักเสบ',
          include_minigame: true,
          exercises: [
            {
              exercise_id: 'ex-01',
              name: 'ท่ายกแขนไปข้างหน้า (Shoulder Flexion)',
              target_joint: 'ข้อไหล่',
              sets: 3,
              reps: 10,
              demo_url: '/uploads/exercises/shoulder_flexion.jpg',
            },
            {
              exercise_id: 'ex-02',
              name: 'ท่ากางแขนออกด้านข้าง (Shoulder Abduction)',
              target_joint: 'ข้อไหล่',
              sets: 3,
              reps: 10,
              demo_url: '/uploads/exercises/shoulder_abduction.jpg',
            },
          ],
        },
        {
          id: 'mod-knee',
          name: 'คอร์สข้อเข่าเสื่อม (Knee Osteoarthritis Pack)',
          description: 'สร้างความแข็งแรงกล้ามเนื้อต้นขาด้านหน้าและรอบข้อเข่า',
          target_condition: 'ข้อเข่าเสื่อม / ฟื้นฟูหลังผ่าตัดเข่า',
          include_minigame: false,
          exercises: [
            {
              exercise_id: 'ex-03',
              name: 'ท่ายืดเหยียดข้อเข่า (Knee Extension)',
              target_joint: 'ข้อเข่า',
              sets: 3,
              reps: 12,
              demo_url: '/uploads/exercises/knee_extension.jpg',
            },
            {
              exercise_id: 'ex-04',
              name: 'ท่ากระดกข้อเท้า (Ankle Dorsiflexion)',
              target_joint: 'ข้อเท้า',
              sets: 3,
              reps: 15,
              demo_url: '/uploads/exercises/ankle_dorsi.jpg',
            },
          ],
        },
        {
          id: 'mod-stroke',
          name: 'คอร์สฟื้นฟูสโตรก/สมอง (Stroke Neuro-Rehab Pack)',
          description: 'กระตุ้นสมองและกล้ามเนื้อแขนขาประสานสัมพันธ์',
          target_condition: 'ผู้ป่วยโรคหลอดเลือดสมอง / อัมพฤกษ์ครึ่งซีก',
          include_minigame: true,
          exercises: [
            {
              exercise_id: 'ex-01',
              name: 'ท่ายกแขนไปข้างหน้า (Shoulder Flexion)',
              target_joint: 'ข้อไหล่',
              sets: 2,
              reps: 8,
              demo_url: '/uploads/exercises/shoulder_flexion.jpg',
            },
            {
              exercise_id: 'ex-03',
              name: 'ท่ายืดเหยียดข้อเข่า (Knee Extension)',
              target_joint: 'ข้อเข่า',
              sets: 2,
              reps: 8,
              demo_url: '/uploads/exercises/knee_extension.jpg',
            },
          ],
        },
      ];
      fs.writeFileSync(this.modpacksFile, JSON.stringify(defaultModpacks, null, 2), 'utf-8');
    }
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

    // Generate unique patient_id e.g. P-6022
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
  public saveSchedule(patientId: string, schedule: any): PatientRecordFile {
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
  public saveRehabScore(patientId: string, score: RehabScoreEntry): PatientRecordFile {
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
   * 9. Exercise Library & Modpack CRUD
   */
  public getExercises(): ExerciseItem[] {
    try {
      if (fs.existsSync(this.exercisesFile)) {
        return JSON.parse(fs.readFileSync(this.exercisesFile, 'utf-8'));
      }
    } catch {
      // Fallback
    }
    return [];
  }

  public saveExercise(item: ExerciseItem): ExerciseItem {
    const exerciseItem: ExerciseItem = {
      ...item,
      id: item.id || `ex-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    };
    const list = this.getExercises();
    const existingIdx = list.findIndex((x) => x.id === exerciseItem.id);
    if (existingIdx >= 0) {
      list[existingIdx] = exerciseItem;
    } else {
      list.push(exerciseItem);
    }
    fs.writeFileSync(this.exercisesFile, JSON.stringify(list, null, 2), 'utf-8');
    return exerciseItem;
  }

  public getModpacks(): ModpackItem[] {
    try {
      if (fs.existsSync(this.modpacksFile)) {
        return JSON.parse(fs.readFileSync(this.modpacksFile, 'utf-8'));
      }
    } catch {
      // Fallback
    }
    return [];
  }

  public saveModpack(modpack: ModpackItem): ModpackItem {
    const modpackItem: ModpackItem = {
      ...modpack,
      id: modpack.id || `mp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    };
    const list = this.getModpacks();
    const existingIdx = list.findIndex((m) => m.id === modpackItem.id);
    if (existingIdx >= 0) {
      list[existingIdx] = modpackItem;
    } else {
      list.push(modpackItem);
    }
    fs.writeFileSync(this.modpacksFile, JSON.stringify(list, null, 2), 'utf-8');
    return modpackItem;
  }
}

export const defaultSmartOnboardingService = new SmartOnboardingService();
