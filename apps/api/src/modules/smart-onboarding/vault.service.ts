/**
 * apps/api/src/modules/smart-onboarding/vault.service.ts
 * Master Prompt v6: Sovereign Isolated Medical-Grade Architecture
 * Strict Patient-Centric Dossier Vault & 10-Snapshot Retention Policy
 *
 * Folder Structure:
 * public/uploads/patients/{patient_id}/
 * ├── profile_face.jpg              (Primary reference face photo <= 800x800px)
 * ├── patient_record.json           (Full dossier & EHR Single Source of Truth)
 * ├── login_history/                (Strict 10-snapshot rolling retention limit)
 * └── enrollment_frames/            (10 biometric enrollment frames)
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../../middleware/logger';
import { PatientRecordFile } from '../../../../../packages/smart-biometric-core/src/index.js';

export class PatientVaultService {
  private baseUploadDir: string;

  constructor(customUploadDir?: string) {
    this.baseUploadDir =
      customUploadDir || path.resolve(process.cwd(), 'public', 'uploads', 'patients');
  }

  public getPatientVaultDir(patientId: string): string {
    return path.join(this.baseUploadDir, patientId);
  }

  public ensurePatientVault(patientId: string): string {
    const vaultDir = this.getPatientVaultDir(patientId);
    if (!fs.existsSync(vaultDir)) {
      fs.mkdirSync(vaultDir, { recursive: true });
      console.log(`[STORAGE] Created directory: /public/uploads/patients/${patientId}/`);
      logger.info(`[STORAGE] Created directory: /public/uploads/patients/${patientId}/`);
    }

    const loginHistDir = path.join(vaultDir, 'login_history');
    if (!fs.existsSync(loginHistDir)) {
      fs.mkdirSync(loginHistDir, { recursive: true });
    }

    const enrollFramesDir = path.join(vaultDir, 'enrollment_frames');
    if (!fs.existsSync(enrollFramesDir)) {
      fs.mkdirSync(enrollFramesDir, { recursive: true });
    }

    return vaultDir;
  }

  /**
   * Saves profile_face.jpg and patient_record.json with full schema normalization
   */
  public savePatientRecord(patientId: string, record: PatientRecordFile, profileImageBuffer?: Buffer): void {
    const vaultDir = this.ensurePatientVault(patientId);

    // 1. Save profile_face.jpg if provided (Never delete or overwrite with degraded quality)
    if (profileImageBuffer && profileImageBuffer.length > 0) {
      const profilePath = path.join(vaultDir, 'profile_face.jpg');
      fs.writeFileSync(profilePath, profileImageBuffer);
    }

    // 2. Normalize and harmonize record for Single Source of Truth
    const normalizedRecord: any = {
      ...record,
      patient_id: patientId,
      hn: record.hn || patientId,
      first_name: record.first_name || '',
      last_name: record.last_name || '',
      age: Number(record.age) || 0,
      gender: record.gender || 'unspecified',
      contact: (record as any).contact || record.phone || '',
      phone: record.phone || (record as any).contact || '',
      registration_status: record.registration_status || 'active',
      registered_via: record.registered_via || 'smart_onboarding',
      biometrics: {
        face_vector: record.biometrics?.face_vector || [],
        registered_face_url: `/uploads/patients/${patientId}/profile_face.jpg`,
        confidence_score: record.biometrics?.confidence_score ?? 0.95,
        model_version: record.biometrics?.model_version || 'w600k_r50',
        enrolled_at: record.biometrics?.enrolled_at || new Date().toISOString(),
      },
      daily_checklists: record.daily_checklists || {},
      rehab_scores: record.rehab_scores || [],
      clinical: {
        diagnosis: record.clinical?.diagnosis || (record as any).diagnosis || record.initial_symptoms || '',
        treatment_plan: record.clinical?.treatment_plan || (record as any).treatment_plan || '',
        progress_notes: record.clinical?.progress_notes || (record as any).progress_notes || [],
      },
      created_at: record.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Harmonize therapy schedule if present (Both camelCase & snake_case support)
    if (record.schedule) {
      const s: any = record.schedule;
      normalizedRecord.schedule = {
        ...s,
        startDate: s.startDate || s.start_date || new Date().toISOString().slice(0, 10),
        start_date: s.start_date || s.startDate || new Date().toISOString().slice(0, 10),
        endDate: s.endDate || s.end_date || new Date().toISOString().slice(0, 10),
        end_date: s.end_date || s.endDate || new Date().toISOString().slice(0, 10),
        daysOfWeek: s.daysOfWeek || s.days_of_week || ['Mon', 'Wed', 'Fri'],
        days_of_week: s.days_of_week || s.daysOfWeek || ['Mon', 'Wed', 'Fri'],
        timeSlot: s.timeSlot || s.time_slot || '09:00 - 10:00',
        time_slot: s.time_slot || s.timeSlot || '09:00 - 10:00',
        kioskId: s.kioskId || s.assigned_kiosk_id || 'kiosk-01',
        assigned_kiosk_id: s.assigned_kiosk_id || s.kioskId || 'kiosk-01',
        include_minigame: Boolean(s.include_minigame),
        assigned_exercises: s.assigned_exercises || s.prescribed_exercises || [],
        prescribed_exercises: s.prescribed_exercises || s.assigned_exercises || [],
      };
    }

    // Write patient_record.json
    const recordPath = path.join(vaultDir, 'patient_record.json');
    fs.writeFileSync(recordPath, JSON.stringify(normalizedRecord, null, 2), 'utf-8');

    console.log(`[STORAGE] Saved profile_face.jpg and patient_record.json for ${patientId} successfully.`);
    logger.info(`[STORAGE] Saved profile_face.jpg and patient_record.json for ${patientId} successfully.`);
  }

  /**
   * Initializes or updates a patient vault
   */
  public initPatientVault(patientId: string, record: PatientRecordFile, profileImageBuffer?: Buffer): void {
    this.savePatientRecord(patientId, record, profileImageBuffer);
  }

  /**
   * Reads patient_record.json from disk
   */
  public getPatientRecord(patientId: string): PatientRecordFile | null {
    const recordPath = path.join(this.getPatientVaultDir(patientId), 'patient_record.json');
    if (!fs.existsSync(recordPath)) {
      return null;
    }
    try {
      const content = fs.readFileSync(recordPath, 'utf-8');
      return JSON.parse(content) as PatientRecordFile;
    } catch (err) {
      logger.error({ err, patientId }, 'Failed to read patient_record.json');
      return null;
    }
  }

  /**
   * Lists all patient records across all vaults
   */
  public listAllPatientRecords(): PatientRecordFile[] {
    if (!fs.existsSync(this.baseUploadDir)) {
      return [];
    }

    const entries = fs.readdirSync(this.baseUploadDir, { withFileTypes: true });
    const records: PatientRecordFile[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const record = this.getPatientRecord(entry.name);
        if (record) {
          records.push(record);
        }
      }
    }

    return records;
  }

  /**
   * Saves snapshot to login_history/ and enforces strict 10-snapshot rolling retention
   */
  public recordLoginSnapshot(patientId: string, imageBuffer: Buffer): string {
    const vaultDir = this.ensurePatientVault(patientId);
    const loginHistDir = path.join(vaultDir, 'login_history');

    // Format: login_YYYYMMDD_HHMMSS.jpg
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const tsStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(
      now.getHours()
    )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    let filename = `login_${tsStr}.jpg`;
    let counter = 1;
    while (fs.existsSync(path.join(loginHistDir, filename))) {
      filename = `login_${tsStr}_${counter}.jpg`;
      counter++;
    }
    const filePath = path.join(loginHistDir, filename);

    fs.writeFileSync(filePath, imageBuffer);

    // 10-Snapshot Rolling Retention Policy (Master Prompt v6 Section 2)
    // If files in login_history exceed 10, delete oldest!
    this.enforceLoginHistoryRetention(loginHistDir, 10);

    console.log(`[STORAGE] Saved login snapshot and enforced 10-file retention limit for ${patientId}.`);
    logger.info(`[STORAGE] Saved login snapshot and enforced 10-file retention limit for ${patientId}.`);

    return `/uploads/patients/${patientId}/login_history/${filename}`;
  }

  private enforceLoginHistoryRetention(loginHistDir: string, maxFiles = 10): void {
    try {
      const files = fs
        .readdirSync(loginHistDir)
        .filter((f) => f.endsWith('.jpg') || f.endsWith('.jpeg'))
        .map((f) => ({
          name: f,
          fullPath: path.join(loginHistDir, f),
          time: fs.statSync(path.join(loginHistDir, f)).mtimeMs,
        }));

      if (files.length > maxFiles) {
        // Sort oldest first (smallest mtime)
        files.sort((a, b) => a.time - b.time);
        const filesToDeleteCount = files.length - maxFiles;
        for (let i = 0; i < filesToDeleteCount; i++) {
          try {
            fs.unlinkSync(files[i].fullPath);
            logger.info(`[STORAGE] Retention policy: deleted old login snapshot ${files[i].name}`);
          } catch {
            // Ignore individual deletion error
          }
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to enforce login history retention');
    }
  }

  /**
   * Comprehensive Dossier Fetching (Master Prompt v6 Section 3)
   * Fetches complete patient dossier including profile, face photo, login history, schedule & rehab scores
   */
  public getPatientDossier(patientId: string): {
    record: PatientRecordFile;
    profile_face_url: string;
    login_snapshots: string[];
    schedule: any;
    rehab_scores: any[];
  } | null {
    const record = this.getPatientRecord(patientId);
    if (!record) return null;

    const vaultDir = this.getPatientVaultDir(patientId);
    const loginHistDir = path.join(vaultDir, 'login_history');
    let snapshots: string[] = [];

    if (fs.existsSync(loginHistDir)) {
      snapshots = fs
        .readdirSync(loginHistDir)
        .filter((f) => f.endsWith('.jpg') || f.endsWith('.jpeg'))
        .map((f) => ({
          name: f,
          url: `/uploads/patients/${patientId}/login_history/${f}`,
          time: fs.statSync(path.join(loginHistDir, f)).mtimeMs,
        }))
        .sort((a, b) => b.time - a.time) // Newest first
        .slice(0, 10)
        .map((s) => s.url);
    }

    return {
      record,
      profile_face_url: `/uploads/patients/${patientId}/profile_face.jpg`,
      login_snapshots: snapshots,
      schedule: record.schedule || null,
      rehab_scores: record.rehab_scores || [],
    };
  }

  /**
   * Lists all patient dossiers for dynamic schedule and clinical overview
   */
  public listAllDossiers(): Array<{
    patient_id: string;
    first_name: string;
    last_name: string;
    hn: string;
    profile_face_url: string;
    schedule: any;
    rehab_scores: any[];
    clinical?: any;
  }> {
    const records = this.listAllPatientRecords();
    return records.map((r) => ({
      patient_id: r.patient_id,
      first_name: r.first_name,
      last_name: r.last_name,
      hn: r.hn,
      profile_face_url: r.biometrics?.registered_face_url || `/uploads/patients/${r.patient_id}/profile_face.jpg`,
      schedule: r.schedule || null,
      rehab_scores: r.rehab_scores || [],
      clinical: r.clinical,
    }));
  }

  /**
   * Permanent Delete Persistence Fix (Master Prompt v4 Section 5):
   * Recursively deletes public/uploads/patients/{patient_id}/ from disk
   */
  public deletePatientVault(patientId: string): boolean {
    const vaultDir = this.getPatientVaultDir(patientId);
    if (fs.existsSync(vaultDir)) {
      try {
        fs.rmSync(vaultDir, { recursive: true, force: true });
        logger.info(`[STORAGE] Permanently deleted patient vault directory: ${vaultDir}`);
        return true;
      } catch (err) {
        logger.error({ err, vaultDir }, 'Failed to delete patient vault directory');
        return false;
      }
    }
    return false;
  }
}

export const defaultPatientVaultService = new PatientVaultService();
