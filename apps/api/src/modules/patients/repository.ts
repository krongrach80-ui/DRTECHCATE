import { getAdminClient } from '../../lib/supabase/adminClient';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../middleware/logger';
import {
  PatientRecord,
  CreatePatientInput,
  UpdatePatientInput,
  PatientQueryFilter,
  EnrollmentTicketRecord,
  CheckinRecord,
  normalizePhone,
  PatientRegistrationStatus,
} from './schema';

export interface IPatientRepository {
  isPatientAccessibleByPt(patientId: string, ptId: string): Promise<boolean>;
  getAccessiblePatientIdsForPt(ptId: string): Promise<string[]>;
  createPatient(
    input: Partial<CreatePatientInput> & {
      first_name: string;
      last_name: string;
      registration_status?: PatientRegistrationStatus;
    },
    createdBy: string,
    responsiblePtId?: string | null
  ): Promise<PatientRecord>;
  getPatientById(id: string): Promise<PatientRecord | null>;
  updatePatient(
    id: string,
    input: UpdatePatientInput,
    expectedVersion: number
  ): Promise<PatientRecord>;
  listPatients(
    filter: PatientQueryFilter,
    accessiblePatientIds?: string[] | null
  ): Promise<{ patients: PatientRecord[]; total: number; page: number; limit: number }>;
  createEnrollmentTicket(
    patientId: string,
    kioskId: string,
    createdBy: string
  ): Promise<EnrollmentTicketRecord>;
  createCheckin(
    patientId: string,
    kioskId: string | null,
    checkedInBy: string | null
  ): Promise<CheckinRecord>;
  getTodayCheckinPatientIds(dateStr: string): Promise<string[]>;
  deleteBiometrics(patientId: string): Promise<void>;
  cleanupExpiredPendingPatients(): Promise<number>;
}

export class PatientRepository implements IPatientRepository {
  // =========================================================================
  // 1. PATIENT ACCESS CHECK (PRIMARY ASSIGNMENT OR ACTIVE CASE TRANSFER)
  // =========================================================================
  async isPatientAccessibleByPt(patientId: string, ptId: string): Promise<boolean> {
    const today = new Date().toISOString().split('T')[0];

    try {
      const adminClient = getAdminClient();
      // 1. Direct or primary assignment
      const { data: assignment, error: assignError } = await adminClient
        .from('patient_pt_assignments')
        .select('id')
        .eq('patient_id', patientId)
        .eq('pt_id', ptId)
        .maybeSingle();

      if (assignError) {
        logger.error({ assignError, patientId, ptId }, 'Database error checking patient assignment');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      if (assignment) return true;

      // 2. Active case transfer
      const { data: transfer, error: transferError } = await adminClient
        .from('case_transfers')
        .select('id')
        .eq('patient_id', patientId)
        .eq('to_pt_id', ptId)
        .lte('start_date', today)
        .gte('end_date', today)
        .eq('status', 'active')
        .maybeSingle();

      if (transferError) {
        logger.error({ transferError, patientId, ptId }, 'Database error checking case transfer');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return !!transfer;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, patientId, ptId }, 'Unexpected database connection error in isPatientAccessibleByPt');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async getAccessiblePatientIdsForPt(ptId: string): Promise<string[]> {
    const accessibleIds = new Set<string>();
    const today = new Date().toISOString().split('T')[0];

    try {
      const adminClient = getAdminClient();
      const { data: assignments, error: assignError } = await adminClient
        .from('patient_pt_assignments')
        .select('patient_id')
        .eq('pt_id', ptId);

      if (assignError) {
        logger.error({ assignError, ptId }, 'Database error querying accessible assignments');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      if (assignments) {
        assignments.forEach((a: { patient_id: string }) => accessibleIds.add(a.patient_id));
      }

      const { data: transfers, error: transferError } = await adminClient
        .from('case_transfers')
        .select('patient_id')
        .eq('to_pt_id', ptId)
        .lte('start_date', today)
        .gte('end_date', today)
        .eq('status', 'active');

      if (transferError) {
        logger.error({ transferError, ptId }, 'Database error querying active case transfers');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      if (transfers) {
        transfers.forEach((t: { patient_id: string }) => accessibleIds.add(t.patient_id));
      }

      return Array.from(accessibleIds);
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, ptId }, 'Unexpected database connection error in getAccessiblePatientIdsForPt');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  // =========================================================================
  // 2. PATIENT CRUD (HN from PostgreSQL Sequence patient_hn_seq)
  // =========================================================================
  async createPatient(
    input: Partial<CreatePatientInput> & {
      first_name: string;
      last_name: string;
      registration_status?: PatientRegistrationStatus;
    },
    _createdBy: string,
    responsiblePtId?: string | null
  ): Promise<PatientRecord> {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const ptId = responsiblePtId || input.responsible_pt_id || null;

    try {
      const adminClient = getAdminClient();
      // Omit hn so Postgres DEFAULT ('HN' || lpad(nextval('patient_hn_seq')::text, 6, '0')) triggers
      const cleanHistory: Record<string, unknown> = { ...(input.history || {}) };
      if (!cleanHistory.chronic_diseases) cleanHistory.chronic_diseases = '-';
      if (!cleanHistory.allergies) cleanHistory.allergies = '-';
      if (!cleanHistory.notes) cleanHistory.notes = '-';

      let validPtId: string | null = null;
      if (ptId) {
        try {
          const { data: ptProfile } = await adminClient
            .from('profiles')
            .select('id')
            .eq('id', ptId)
            .maybeSingle();
          if (ptProfile) {
            validPtId = ptProfile.id;
          } else {
            const { data: anyPt } = await adminClient
              .from('profiles')
              .select('id')
              .eq('role', 'pt')
              .eq('status', 'active')
              .limit(1)
              .maybeSingle();
            if (anyPt) validPtId = anyPt.id;
          }
        } catch {
          // If query fails, don't set invalid ptId
          validPtId = null;
        }
      }

      const { data, error } = await adminClient
        .from('patients')
        .insert({
          first_name: input.first_name.trim(),
          last_name: input.last_name.trim(),
          age: typeof input.age === 'number' && !isNaN(input.age) ? input.age : 30,
          sex: input.sex || 'unspecified',
          phone: normalizePhone(input.phone) || '-',
          history: cleanHistory,
          injury: input.injury?.trim() || '-',
          responsible_pt_id: validPtId,
          registration_status: input.registration_status || 'active',
          registered_via: input.registered_via || 'reception',
          pending_expires_at: expiresAt,
          version: 1,
        })
        .select('*')
        .single();

      if (error || !data) {
        logger.error({ error, input }, 'Failed to insert patient in Supabase');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      if (validPtId) {
        try {
          await adminClient
            .from('patient_pt_assignments')
            .upsert(
              { patient_id: data.id, pt_id: validPtId, is_primary: true },
              { onConflict: 'patient_id,pt_id' }
            );
        } catch (assignError) {
          logger.warn({ assignError, patientId: data.id, ptId: validPtId }, 'Non-fatal warning upserting patient_pt_assignments');
        }
      }

      // Auto-provision initial consent record for biometric registration
      try {
        await adminClient
          .from('consents')
          .insert({
            subject_type: 'patient',
            subject_id: data.id,
            type: 'biometrics',
            text_version: 'v1',
          });
      } catch (cErr) {
        logger.warn({ cErr, patientId: data.id }, 'Initial biometric consent auto-insert non-fatal warning');
      }

      return data as PatientRecord;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, input }, 'Unexpected database error in createPatient');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async getPatientById(id: string): Promise<PatientRecord | null> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('patients')
        .select('*, responsible_pt:profiles!responsible_pt_id(id, full_name, username)')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        logger.error({ error, id }, 'Database error querying patient by id');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return (data as PatientRecord) || null;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, id }, 'Unexpected database connection error in getPatientById');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async updatePatient(
    id: string,
    input: UpdatePatientInput,
    expectedVersion: number
  ): Promise<PatientRecord> {
    const nowIso = new Date().toISOString();

    try {
      const adminClient = getAdminClient();
      const updateData: Record<string, unknown> = {
        updated_at: nowIso,
        version: expectedVersion + 1,
      };

      if (input.first_name !== undefined) updateData.first_name = input.first_name;
      if (input.last_name !== undefined) updateData.last_name = input.last_name;
      if (input.age !== undefined) updateData.age = input.age;
      if (input.sex !== undefined) updateData.sex = input.sex;
      if (input.phone !== undefined) updateData.phone = normalizePhone(input.phone);
      if (input.injury !== undefined) updateData.injury = input.injury;
      if (input.history !== undefined) updateData.history = input.history;
      if (input.responsible_pt_id !== undefined) updateData.responsible_pt_id = input.responsible_pt_id;
      if (input.registration_status !== undefined) {
        updateData.registration_status = input.registration_status;
        if (input.registration_status === 'active') {
          updateData.started_at = nowIso;
        }
      }

      const { data, error } = await adminClient
        .from('patients')
        .update(updateData)
        .eq('id', id)
        .eq('version', expectedVersion)
        .select('*')
        .maybeSingle();

      if (error) {
        logger.error({ error, id, expectedVersion }, 'Database error during updatePatient');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      if (data) {
        if (input.responsible_pt_id) {
          const { error: assignError } = await adminClient
            .from('patient_pt_assignments')
            .upsert(
              { patient_id: id, pt_id: input.responsible_pt_id, is_primary: true },
              { onConflict: 'patient_id,pt_id' }
            );

          if (assignError) {
            logger.error({ assignError, id }, 'Failed to update patient PT assignment');
            throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
          }
        }
        return data as PatientRecord;
      }

      // Check whether record does not exist or version conflict occurred
      const current = await this.getPatientById(id);
      if (!current) {
        throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND');
      }
      if (current.version !== expectedVersion) {
        throw new AppError(
          `Conflict: Patient record was modified by another user (expected version ${expectedVersion}, current version is ${current.version}). Please reload and try again.`,
          409,
          'CONFLICT'
        );
      }

      throw new AppError('Failed to update patient record', 500, 'UPDATE_FAILED');
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, id }, 'Unexpected error in updatePatient');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async listPatients(
    filter: PatientQueryFilter,
    accessiblePatientIds?: string[] | null
  ): Promise<{ patients: PatientRecord[]; total: number; page: number; limit: number }> {
    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const offset = (page - 1) * limit;

    try {
      const adminClient = getAdminClient();
      let query = adminClient
        .from('patients')
        .select('*, responsible_pt:profiles!responsible_pt_id(id, full_name, username)', { count: 'exact' });

      if (accessiblePatientIds !== null && accessiblePatientIds !== undefined) {
        if (accessiblePatientIds.length === 0) {
          return { patients: [], total: 0, page, limit };
        }
        query = query.in('id', accessiblePatientIds);
      }

      if (filter.status) {
        query = query.eq('registration_status', filter.status);
      }

      if (filter.responsible_pt_id) {
        query = query.eq('responsible_pt_id', filter.responsible_pt_id);
      }

      if (filter.q) {
        const cleanQ = filter.q.trim();
        query = query.or(`first_name.ilike.%${cleanQ}%,last_name.ilike.%${cleanQ}%,hn.ilike.%${cleanQ}%,phone.ilike.%${cleanQ}%`);
      }

      query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

      const { data, count, error } = await query;
      if (error) {
        logger.error({ error, filter }, 'Database error listing patients');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return {
        patients: (data as PatientRecord[]) || [],
        total: count || 0,
        page,
        limit,
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, filter }, 'Unexpected error in listPatients');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  // =========================================================================
  // 3. KIOSK ENROLLMENT DISPATCH & COUNTER CHECK-IN
  // =========================================================================
  async createEnrollmentTicket(
    patientId: string,
    kioskId: string,
    createdBy: string
  ): Promise<EnrollmentTicketRecord> {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('enrollment_tickets')
        .insert({
          patient_id: patientId,
          kiosk_id: kioskId,
          created_by: createdBy,
          expires_at: expiresAt,
        })
        .select('*')
        .single();

      if (error || !data) {
        logger.error({ error, patientId, kioskId }, 'Database error creating enrollment ticket');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return data as EnrollmentTicketRecord;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, patientId, kioskId }, 'Unexpected error in createEnrollmentTicket');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async createCheckin(
    patientId: string,
    kioskId: string | null,
    checkedInBy: string | null
  ): Promise<CheckinRecord> {
    const today = new Date().toISOString().split('T')[0];

    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('checkins')
        .upsert(
          {
            patient_id: patientId,
            kiosk_id: kioskId,
            checked_in_by: checkedInBy,
            date: today,
          },
          { onConflict: 'patient_id,date' }
        )
        .select('*')
        .single();

      if (error || !data) {
        logger.error({ error, patientId }, 'Database error recording checkin');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return data as CheckinRecord;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, patientId }, 'Unexpected error in createCheckin');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async getTodayCheckinPatientIds(dateStr: string): Promise<string[]> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('checkins')
        .select('patient_id')
        .eq('date', dateStr);

      if (error) {
        logger.error({ error, dateStr }, 'Database error querying checkin patient ids');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return data ? data.map((d: { patient_id: string }) => d.patient_id) : [];
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, dateStr }, 'Unexpected error in getTodayCheckinPatientIds');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  // =========================================================================
  // 4. PDPA BIOMETRIC DELETION
  // =========================================================================
  async deleteBiometrics(patientId: string): Promise<void> {
    try {
      const adminClient = getAdminClient();
      const { error: err1 } = await adminClient.from('face_templates').delete().eq('patient_id', patientId);
      if (err1) {
        logger.error({ err1, patientId }, 'Database error deleting face_templates');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      const { error: err2 } = await adminClient.from('face_enrollments').delete().eq('patient_id', patientId);
      if (err2) {
        logger.error({ err2, patientId }, 'Database error deleting face_enrollments');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      const { error: err3 } = await adminClient
        .from('patients')
        .update({ registration_status: 'awaiting_face', updated_at: new Date().toISOString() })
        .eq('id', patientId);
      if (err3) {
        logger.error({ err3, patientId }, 'Database error resetting patient status to awaiting_face');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, patientId }, 'Unexpected error in deleteBiometrics');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  // =========================================================================
  // 5. EXPIRY CLEANUP (AWAITING_FACE OLDER THAN 24H)
  // =========================================================================
  async cleanupExpiredPendingPatients(): Promise<number> {
    const nowIso = new Date().toISOString();

    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('patients')
        .update({ registration_status: 'archived', updated_at: nowIso })
        .eq('registration_status', 'awaiting_face')
        .lte('pending_expires_at', nowIso)
        .select('id');

      if (error) {
        logger.error({ error }, 'Database error during cleanupExpiredPendingPatients');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return data ? data.length : 0;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err }, 'Unexpected error in cleanupExpiredPendingPatients');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }
}

let currentPatientRepository: IPatientRepository = new PatientRepository();

export function setDefaultPatientRepository(repo: IPatientRepository): void {
  currentPatientRepository = repo;
}

export const defaultPatientRepository: IPatientRepository = new Proxy(
  {} as unknown as IPatientRepository,
  {
    get(_target, prop) {
      const val = Reflect.get(currentPatientRepository, prop);
      if (typeof val === 'function') {
        return (val as (...args: unknown[]) => unknown).bind(currentPatientRepository);
      }
      return val;
    },
    set(_target, prop, value) {
      return Reflect.set(currentPatientRepository, prop, value);
    },
  }
);
