/**
 * apps/api/src/modules/smart-onboarding/vault.service.ts
 * Isolated Patient-Centric Vault Architecture & Storage Service
 * Conforms to Master Prompt v4 Section 1 (Isolated Patient Vault)
 *
 * Folder Structure:
 * public/uploads/patients/{patient_id}/
 * ├── profile_face.jpg              (<= 800x800px, JPEG 80%)
 * ├── patient_record.json           (Comprehensive metadata)
 * ├── login_history/                (Latest 10 snapshots rolling retention)
 * └── enrollment_frames/            (10 enrollment frames)
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
      logger.info(`[STORAGE] Created directory: ${vaultDir}`);
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
   * Saves profile_face.jpg and patient_record.json
   */
  public savePatientRecord(patientId: string, record: PatientRecordFile, profileImageBuffer?: Buffer): void {
    const vaultDir = this.ensurePatientVault(patientId);

    // 1. Save profile_face.jpg if provided
    if (profileImageBuffer && profileImageBuffer.length > 0) {
      const profilePath = path.join(vaultDir, 'profile_face.jpg');
      fs.writeFileSync(profilePath, profileImageBuffer);
    }

    // 2. Save patient_record.json
    const recordPath = path.join(vaultDir, 'patient_record.json');
    fs.writeFileSync(recordPath, JSON.stringify(record, null, 2), 'utf-8');

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

    // 10-Snapshot Rolling Retention Policy (Master Prompt v4 Section 1.2)
    // If files in login_history exceed 10, delete oldest!
    this.enforceLoginHistoryRetention(loginHistDir, 10);

    return `/uploads/patients/${patientId}/login_history/${filename}`;
  }

  private enforceLoginHistoryRetention(loginHistDir: string, maxFiles = 10): void {
    try {
      const files = fs
        .readdirSync(loginHistDir)
        .filter((f) => f.startsWith('login_') && f.endsWith('.jpg'))
        .map((f) => ({
          name: f,
          fullPath: path.join(loginHistDir, f),
          time: fs.statSync(path.join(loginHistDir, f)).mtimeMs,
        }));

      if (files.length > maxFiles) {
        // Sort oldest first
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
