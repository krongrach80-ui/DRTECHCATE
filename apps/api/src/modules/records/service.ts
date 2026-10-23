/**
 * apps/api/src/modules/records/service.ts
 * Clinical Records Service (Medical Notes & Treatment Results)
 * Enforces:
 * 1. Role-based isolation: PT sees/appends records ONLY for patients under active care or case transfer
 * 2. Audit logging for both READ and WRITE operations (Section 11 Line 409)
 * 3. Append-only versioning: treatment updates create version N+1 pointing to supersedes_id
 * 4. Immutability: ZERO UPDATE / DELETE operations allowed
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../../middleware/errorHandler';
import { UserSession } from '../../middleware/authenticate';
import { RecordsRepository, defaultRecordsRepository } from './repository';
import { PatientRepository, defaultPatientRepository } from '../patients/repository';
import { AuditService, defaultAuditService } from '../audit/service';
import {
  CreateMedicalNoteInput,
  CreateTreatmentResultInput,
  MedicalNoteRecord,
  TreatmentResultRecord,
} from './schema';

export class RecordsService {
  constructor(
    private recordsRepo: RecordsRepository = defaultRecordsRepository,
    private patientRepo: PatientRepository = defaultPatientRepository,
    private auditService: AuditService = defaultAuditService
  ) {}

  /**
   * Helper: Validates user access to patient.
   * Admins have universal access; PTs have access only to patients under active care or active case transfer.
   */
  private async assertPatientAccess(user: UserSession, patientId: string): Promise<void> {
    const patient = await this.patientRepo.getPatientById(patientId);
    if (!patient) {
      throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND');
    }

    if (user.role === 'admin') {
      return;
    }

    if (user.role === 'pt') {
      const isAccessible = await this.patientRepo.isPatientAccessibleByPt(patientId, user.id);
      if (!isAccessible) {
        throw new AppError(
          'Forbidden: You do not have permission to view or manage clinical records for this patient',
          403,
          'FORBIDDEN'
        );
      }
      return;
    }

    throw new AppError('Forbidden: Insufficient role permissions for clinical records', 403, 'FORBIDDEN');
  }

  // =========================================================================
  // 1. MEDICAL NOTES
  // =========================================================================

  async getNotes(
    patientId: string,
    user: UserSession,
    client?: SupabaseClient
  ): Promise<MedicalNoteRecord[]> {
    await this.assertPatientAccess(user, patientId);

    const notes = await this.recordsRepo.getNotes(patientId, client);

    // Master Prompt v3 Section 11 Line 409: "บันทึก audit เมื่อมีการ อ่าน เวชระเบียนด้วย ไม่ใช่เฉพาะตอนเขียน"
    await this.auditService.write({
      actor_type: 'staff',
      actor_id: user.id,
      action: 'READ_MEDICAL_NOTES',
      entity: 'patients',
      entity_id: patientId,
      metadata: {
        patientId,
        readCount: notes.length,
      },
    });

    return notes;
  }

  async createNote(
    patientId: string,
    input: CreateMedicalNoteInput,
    user: UserSession,
    client?: SupabaseClient
  ): Promise<MedicalNoteRecord> {
    await this.assertPatientAccess(user, patientId);

    const note = await this.recordsRepo.createNote(patientId, user.id, input.body, client);

    await this.auditService.write({
      actor_type: 'staff',
      actor_id: user.id,
      action: 'CREATE_MEDICAL_NOTE',
      entity: 'medical_notes',
      entity_id: note.id,
      metadata: {
        patientId,
        noteId: note.id,
        authorId: user.id,
      },
    });

    return note;
  }

  // =========================================================================
  // 2. TREATMENT RESULTS (VERSIONED, APPEND-ONLY)
  // Locked Decision #2: "แก้ = เพิ่มเวอร์ชันใหม่ ชี้ supersedes_id ไม่มี UPDATE/DELETE"
  // =========================================================================

  async getTreatmentResults(
    patientId: string,
    user: UserSession,
    client?: SupabaseClient
  ): Promise<TreatmentResultRecord[]> {
    await this.assertPatientAccess(user, patientId);

    const results = await this.recordsRepo.getTreatmentResults(patientId, client);

    // Section 11 Line 409: Audit read access
    await this.auditService.write({
      actor_type: 'staff',
      actor_id: user.id,
      action: 'READ_TREATMENT_RESULTS',
      entity: 'patients',
      entity_id: patientId,
      metadata: {
        patientId,
        versionsCount: results.length,
      },
    });

    return results;
  }

  async createTreatmentResult(
    patientId: string,
    input: CreateTreatmentResultInput,
    user: UserSession,
    client?: SupabaseClient
  ): Promise<TreatmentResultRecord> {
    await this.assertPatientAccess(user, patientId);

    const result = await this.recordsRepo.createTreatmentResult(
      patientId,
      user.id,
      input.body,
      input.supersedes_id,
      client
    );

    await this.auditService.write({
      actor_type: 'staff',
      actor_id: user.id,
      action: 'CREATE_TREATMENT_RESULT',
      entity: 'treatment_results',
      entity_id: result.id,
      metadata: {
        patientId,
        resultId: result.id,
        version: result.version,
        supersedesId: result.supersedes_id,
        authorId: user.id,
      },
    });

    return result;
  }
}

export const defaultRecordsService = new RecordsService();
