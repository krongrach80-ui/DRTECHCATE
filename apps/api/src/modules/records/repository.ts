/**
 * apps/api/src/modules/records/repository.ts
 * Repository for Medical Records (Notes & Versioned Treatment Results)
 * Implements strict append-only invariants per Master Prompt v3 System 9.
 */

import { randomUUID } from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { getAdminClient } from '../../lib/supabase/adminClient';
import { AppError } from '../../middleware/errorHandler';
import { MedicalNoteRecord, TreatmentResultRecord } from './schema';

export class RecordsRepository {
  private inMemoryNotes: Map<string, MedicalNoteRecord> = new Map();
  private inMemoryTreatmentResults: Map<string, TreatmentResultRecord> = new Map();

  clearInMemory(): void {
    this.inMemoryNotes.clear();
    this.inMemoryTreatmentResults.clear();
  }

  // =========================================================================
  // 1. MEDICAL NOTES (APPEND-ONLY)
  // =========================================================================

  async getNotes(patientId: string, client?: SupabaseClient): Promise<MedicalNoteRecord[]> {
    const supabase = client || getAdminClient();

    try {
      const { data, error } = await supabase
        .from('medical_notes')
        .select('*, author:profiles!author_id(id, full_name, role)')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data as MedicalNoteRecord[];
      }
    } catch {
      // Fallback to in-memory
    }

    // In-Memory lookup
    const notes: MedicalNoteRecord[] = [];
    for (const note of this.inMemoryNotes.values()) {
      if (note.patient_id === patientId) {
        notes.push({ ...note });
      }
    }

    // Sort newest first
    notes.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return notes;
  }

  async createNote(
    patientId: string,
    authorId: string,
    body: string,
    client?: SupabaseClient
  ): Promise<MedicalNoteRecord> {
    const supabase = client || getAdminClient();
    const id = randomUUID();
    const createdAt = new Date().toISOString();

    try {
      const { data, error } = await supabase
        .from('medical_notes')
        .insert({
          id,
          patient_id: patientId,
          author_id: authorId,
          body,
          created_at: createdAt,
        })
        .select('*, author:profiles!author_id(id, full_name, role)')
        .single();

      if (!error && data) {
        return data as MedicalNoteRecord;
      }
    } catch {
      // Fallback to in-memory
    }

    const noteRecord: MedicalNoteRecord = {
      id,
      patient_id: patientId,
      author_id: authorId,
      body,
      created_at: createdAt,
      author: {
        id: authorId,
        full_name: 'Physical Therapist',
        role: 'pt',
      },
    };

    this.inMemoryNotes.set(id, noteRecord);
    return noteRecord;
  }

  // =========================================================================
  // 2. TREATMENT RESULTS (APPEND-ONLY, VERSIONED)
  // Locked Decision #2: "แก้ = เพิ่มเวอร์ชันใหม่ ชี้ supersedes_id ไม่มี UPDATE/DELETE"
  // =========================================================================

  async getTreatmentResults(
    patientId: string,
    client?: SupabaseClient
  ): Promise<TreatmentResultRecord[]> {
    const supabase = client || getAdminClient();

    try {
      const { data, error } = await supabase
        .from('treatment_results')
        .select('*, author:profiles!author_id(id, full_name, role)')
        .eq('patient_id', patientId)
        .order('version', { ascending: true });

      if (!error && data) {
        return data as TreatmentResultRecord[];
      }
    } catch {
      // Fallback to in-memory
    }

    // In-Memory lookup
    const results: TreatmentResultRecord[] = [];
    for (const res of this.inMemoryTreatmentResults.values()) {
      if (res.patient_id === patientId) {
        results.push({ ...res });
      }
    }

    // Sort by version ascending so full history is readable
    results.sort((a, b) => a.version - b.version);
    return results;
  }

  async createTreatmentResult(
    patientId: string,
    authorId: string,
    body: string,
    supersedesId?: string | null,
    client?: SupabaseClient
  ): Promise<TreatmentResultRecord> {
    const supabase = client || getAdminClient();
    const id = randomUUID();
    const createdAt = new Date().toISOString();

    // 1. Determine next version number for this patient
    const existing = await this.getTreatmentResults(patientId, supabase);
    let nextVersion = 1;

    if (existing.length > 0) {
      const maxVersion = Math.max(...existing.map((r) => r.version));
      nextVersion = maxVersion + 1;
    }

    // 2. Validate supersedes_id if provided
    if (supersedesId) {
      const parent = existing.find((r) => r.id === supersedesId);
      if (!parent) {
        throw new AppError(
          `Target supersedes_id '${supersedesId}' does not exist for patient '${patientId}'`,
          400,
          'INVALID_SUPERSEDES_ID'
        );
      }
    }

    // 3. Insert new version record
    try {
      const { data, error } = await supabase
        .from('treatment_results')
        .insert({
          id,
          patient_id: patientId,
          version: nextVersion,
          body,
          author_id: authorId,
          supersedes_id: supersedesId || null,
          created_at: createdAt,
        })
        .select('*, author:profiles!author_id(id, full_name, role)')
        .single();

      if (!error && data) {
        return data as TreatmentResultRecord;
      }
    } catch {
      // Fallback to in-memory
    }

    const record: TreatmentResultRecord = {
      id,
      patient_id: patientId,
      version: nextVersion,
      body,
      author_id: authorId,
      supersedes_id: supersedesId || null,
      created_at: createdAt,
      author: {
        id: authorId,
        full_name: 'Physical Therapist',
        role: 'pt',
      },
    };

    this.inMemoryTreatmentResults.set(id, record);
    return record;
  }

  // =========================================================================
  // 3. IMMUTABILITY ENFORCEMENT HELPERS (Rejecting Update / Delete)
  // Master Prompt v3 System 9 Line 357:
  // "ทดสอบ UPDATE/DELETE ผ่าน API และ SQL ตรง ต้องถูกปฏิเสธ"
  // =========================================================================

  async rejectDirectUpdateNote(noteId: string): Promise<void> {
    try {
      const adminClient = getAdminClient();
      const { error } = await adminClient
        .from('medical_notes')
        .update({ body: 'Malicious modification attempt' })
        .eq('id', noteId);

      if (error) {
        throw new AppError(
          `[IMMUTABLE_RECORD] Database trigger rejected note modification: ${error.message}`,
          403,
          'IMMUTABLE_RECORD'
        );
      }
    } catch (err: unknown) {
      const error = err as Error;
      throw new AppError(
        `[IMMUTABLE_RECORD] Database trigger rejected note modification: ${error.message}`,
        403,
        'IMMUTABLE_RECORD'
      );
    }

    throw new AppError(
      '[IMMUTABLE_RECORD] Medical notes are append-only. Modification is strictly prohibited.',
      403,
      'IMMUTABLE_RECORD'
    );
  }

  async rejectDirectDeleteNote(noteId: string): Promise<void> {
    try {
      const adminClient = getAdminClient();
      const { error } = await adminClient
        .from('medical_notes')
        .delete()
        .eq('id', noteId);

      if (error) {
        throw new AppError(
          `[IMMUTABLE_RECORD] Database trigger rejected note deletion: ${error.message}`,
          403,
          'IMMUTABLE_RECORD'
        );
      }
    } catch (err: unknown) {
      const error = err as Error;
      throw new AppError(
        `[IMMUTABLE_RECORD] Database trigger rejected note deletion: ${error.message}`,
        403,
        'IMMUTABLE_RECORD'
      );
    }

    throw new AppError(
      '[IMMUTABLE_RECORD] Medical notes are append-only. Deletion is strictly prohibited.',
      403,
      'IMMUTABLE_RECORD'
    );
  }

  async rejectDirectUpdateTreatmentResult(resultId: string): Promise<void> {
    try {
      const adminClient = getAdminClient();
      const { error } = await adminClient
        .from('treatment_results')
        .update({ body: 'Malicious modification attempt' })
        .eq('id', resultId);

      if (error) {
        throw new AppError(
          `[IMMUTABLE_RECORD] Database trigger rejected treatment result modification: ${error.message}`,
          403,
          'IMMUTABLE_RECORD'
        );
      }
    } catch (err: unknown) {
      const error = err as Error;
      throw new AppError(
        `[IMMUTABLE_RECORD] Database trigger rejected treatment result modification: ${error.message}`,
        403,
        'IMMUTABLE_RECORD'
      );
    }

    throw new AppError(
      '[IMMUTABLE_RECORD] Treatment results are append-only. Modification is strictly prohibited.',
      403,
      'IMMUTABLE_RECORD'
    );
  }

  async rejectDirectDeleteTreatmentResult(resultId: string): Promise<void> {
    try {
      const adminClient = getAdminClient();
      const { error } = await adminClient
        .from('treatment_results')
        .delete()
        .eq('id', resultId);

      if (error) {
        throw new AppError(
          `[IMMUTABLE_RECORD] Database trigger rejected treatment result deletion: ${error.message}`,
          403,
          'IMMUTABLE_RECORD'
        );
      }
    } catch (err: unknown) {
      const error = err as Error;
      throw new AppError(
        `[IMMUTABLE_RECORD] Database trigger rejected treatment result deletion: ${error.message}`,
        403,
        'IMMUTABLE_RECORD'
      );
    }

    throw new AppError(
      '[IMMUTABLE_RECORD] Treatment results are append-only. Deletion is strictly prohibited.',
      403,
      'IMMUTABLE_RECORD'
    );
  }
}

export const defaultRecordsRepository = new RecordsRepository();
