/**
 * apps/api/src/modules/records/repository.ts
 * Repository for Medical Records (Notes & Versioned Treatment Results)
 * Implements strict append-only invariants per Master Prompt v3 System 9.
 * Fail-Closed on DB failure: throws 503 with logger.error (Zero in-memory fallback).
 */

import { randomUUID } from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { getAdminClient } from '../../lib/supabase/adminClient';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../middleware/logger';
import { MedicalNoteRecord, TreatmentResultRecord } from './schema';

export interface IRecordsRepository {
  getNotes(patientId: string, client?: SupabaseClient): Promise<MedicalNoteRecord[]>;
  createNote(
    patientId: string,
    authorId: string,
    body: string,
    client?: SupabaseClient
  ): Promise<MedicalNoteRecord>;
  getTreatmentResults(
    patientId: string,
    client?: SupabaseClient
  ): Promise<TreatmentResultRecord[]>;
  createTreatmentResult(
    patientId: string,
    authorId: string,
    body: string,
    supersedesId?: string | null,
    client?: SupabaseClient
  ): Promise<TreatmentResultRecord>;
  rejectDirectUpdateNote(noteId: string): Promise<void>;
  rejectDirectDeleteNote(noteId: string): Promise<void>;
  rejectDirectUpdateTreatmentResult(resultId: string): Promise<void>;
  rejectDirectDeleteTreatmentResult(resultId: string): Promise<void>;
}

export class RecordsRepository implements IRecordsRepository {
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

      if (error) {
        logger.error({ error, patientId }, 'Database error querying medical notes');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return (data as MedicalNoteRecord[]) || [];
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, patientId }, 'Unexpected database error in getNotes');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
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

      if (error || !data) {
        logger.error({ error, patientId, authorId }, 'Database error inserting medical note');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return data as MedicalNoteRecord;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, patientId, authorId }, 'Unexpected database error in createNote');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
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

      if (error) {
        logger.error({ error, patientId }, 'Database error querying treatment results');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return (data as TreatmentResultRecord[]) || [];
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, patientId }, 'Unexpected database error in getTreatmentResults');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
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

      if (error || !data) {
        logger.error({ error, patientId, authorId }, 'Database error inserting treatment result');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return data as TreatmentResultRecord;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, patientId, authorId }, 'Unexpected database error in createTreatmentResult');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
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
      if (err instanceof AppError) throw err;
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
      if (err instanceof AppError) throw err;
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
      if (err instanceof AppError) throw err;
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
      if (err instanceof AppError) throw err;
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

let currentRecordsRepository: IRecordsRepository = new RecordsRepository();

export function setDefaultRecordsRepository(repo: IRecordsRepository): void {
  currentRecordsRepository = repo;
}

export const defaultRecordsRepository: IRecordsRepository = new Proxy(
  {} as unknown as IRecordsRepository,
  {
    get(_target, prop) {
      const val = Reflect.get(currentRecordsRepository, prop);
      if (typeof val === 'function') {
        return (val as (...args: unknown[]) => unknown).bind(currentRecordsRepository);
      }
      return val;
    },
    set(_target, prop, value) {
      return Reflect.set(currentRecordsRepository, prop, value);
    },
  }
);
