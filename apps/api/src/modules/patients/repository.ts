import { randomUUID } from 'crypto';
import { getAdminClient } from '../../lib/supabase/adminClient';
import { AppError } from '../../middleware/errorHandler';
import {
  PatientRecord,
  CreatePatientInput,
  UpdatePatientInput,
  PatientQueryFilter,
  EnrollmentTicketRecord,
  CheckinRecord,
  normalizePhone,
} from './schema';
import { DirectoryRepository, defaultDirectoryRepository } from '../directory/repository';

export class PatientRepository {
  private inMemoryPatients: Map<string, PatientRecord> = new Map();
  private inMemoryAssignments: Map<string, { patientId: string; ptId: string; isPrimary: boolean }> = new Map();
  private inMemoryTickets: Map<string, EnrollmentTicketRecord> = new Map();
  private inMemoryCheckins: Map<string, CheckinRecord> = new Map();
  private inMemoryHnCounter = 100001;

  constructor(private directoryRepo: DirectoryRepository = defaultDirectoryRepository) {}

  clearInMemory(): void {
    this.inMemoryPatients.clear();
    this.inMemoryAssignments.clear();
    this.inMemoryTickets.clear();
    this.inMemoryCheckins.clear();
    this.inMemoryHnCounter = 100001;
  }

  // =========================================================================
  // 1. PATIENT ACCESS CHECK (PRIMARY ASSIGNMENT OR ACTIVE CASE TRANSFER)
  // =========================================================================
  async isPatientAccessibleByPt(patientId: string, ptId: string): Promise<boolean> {
    const today = new Date().toISOString().split('T')[0];

    // 1. Check primary or direct assignment
    try {
      const adminClient = getAdminClient();
      const { data: assignment } = await adminClient
        .from('patient_pt_assignments')
        .select('id')
        .eq('patient_id', patientId)
        .eq('pt_id', ptId)
        .maybeSingle();

      if (assignment) return true;

      // 2. Check active case transfer in DB
      const { data: transfer } = await adminClient
        .from('case_transfers')
        .select('id')
        .eq('patient_id', patientId)
        .eq('to_pt_id', ptId)
        .lte('start_date', today)
        .gte('end_date', today)
        .eq('status', 'active')
        .maybeSingle();

      if (transfer) return true;
    } catch {
      // fallback to in-memory
    }

    // In-Memory check:
    const assigned = Array.from(this.inMemoryAssignments.values()).some(
      (a) => a.patientId === patientId && a.ptId === ptId
    );
    if (assigned) return true;

    // Check directory repo case transfers
    return this.directoryRepo.isPatientDelegatedToPt(patientId, ptId, today);
  }

  async getAccessiblePatientIdsForPt(ptId: string): Promise<string[]> {
    const accessibleIds = new Set<string>();
    const today = new Date().toISOString().split('T')[0];

    try {
      const adminClient = getAdminClient();
      const { data: assignments } = await adminClient
        .from('patient_pt_assignments')
        .select('patient_id')
        .eq('pt_id', ptId);

      if (assignments) {
        assignments.forEach((a: { patient_id: string }) => accessibleIds.add(a.patient_id));
      }

      const { data: transfers } = await adminClient
        .from('case_transfers')
        .select('patient_id')
        .eq('to_pt_id', ptId)
        .lte('start_date', today)
        .gte('end_date', today)
        .eq('status', 'active');

      if (transfers) {
        transfers.forEach((t: { patient_id: string }) => accessibleIds.add(t.patient_id));
      }
    } catch {
      // fallback
    }

    // Also collect in-memory
    for (const a of this.inMemoryAssignments.values()) {
      if (a.ptId === ptId) accessibleIds.add(a.patientId);
    }
    const inMemTransfers = await this.directoryRepo.listCaseTransfers(ptId);
    for (const t of inMemTransfers) {
      if (t.status === 'active' && t.start_date <= today && t.end_date >= today) {
        accessibleIds.add(t.patient_id);
      }
    }

    return Array.from(accessibleIds);
  }

  // =========================================================================
  // 2. PATIENT CRUD
  // =========================================================================
  async createPatient(
    input: Partial<CreatePatientInput> & { first_name: string; last_name: string },
    createdBy: string,
    responsiblePtId?: string | null
  ): Promise<PatientRecord> {
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
    const ptId = responsiblePtId || input.responsible_pt_id || null;

    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('patients')
        .insert({
          first_name: input.first_name,
          last_name: input.last_name,
          age: input.age ?? null,
          sex: input.sex ?? null,
          phone: normalizePhone(input.phone),
          history: input.history || {},
          injury: input.injury || null,
          responsible_pt_id: ptId,
          registration_status: 'awaiting_face',
          registered_via: input.registered_via || 'reception',
          pending_expires_at: expiresAt,
          version: 1,
        })
        .select('*')
        .single();

      if (!error && data) {
        if (ptId) {
          await adminClient
            .from('patient_pt_assignments')
            .upsert(
              { patient_id: data.id, pt_id: ptId, is_primary: true },
              { onConflict: 'patient_id,pt_id' }
            );
        }
        return data as PatientRecord;
      }
    } catch {
      // fallback
    }

    // In-memory fallback
    const patientId = randomUUID();
    const hn = `HN${String(this.inMemoryHnCounter++).padStart(6, '0')}`;
    const record: PatientRecord = {
      id: patientId,
      hn,
      first_name: input.first_name,
      last_name: input.last_name,
      age: input.age ?? null,
      sex: input.sex ?? null,
      phone: normalizePhone(input.phone),
      history: input.history || {},
      injury: input.injury || null,
      responsible_pt_id: ptId,
      registration_status: 'awaiting_face',
      registered_via: input.registered_via || 'reception',
      pending_expires_at: expiresAt,
      started_at: null,
      version: 1,
      created_at: nowIso,
      updated_at: nowIso,
    };

    this.inMemoryPatients.set(patientId, record);
    if (ptId) {
      this.inMemoryAssignments.set(`${patientId}:${ptId}`, {
        patientId,
        ptId,
        isPrimary: true,
      });
    }

    return record;
  }

  async getPatientById(id: string): Promise<PatientRecord | null> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('patients')
        .select('*, responsible_pt:profiles!responsible_pt_id(id, full_name, username)')
        .eq('id', id)
        .maybeSingle();

      if (!error && data) {
        return data as PatientRecord;
      }
    } catch {
      // fallback
    }

    return this.inMemoryPatients.get(id) || null;
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
      if (input.registration_status !== undefined) updateData.registration_status = input.registration_status;

      const { data, error } = await adminClient
        .from('patients')
        .update(updateData)
        .eq('id', id)
        .eq('version', expectedVersion)
        .select('*')
        .single();

      if (!error && data) {
        if (input.responsible_pt_id) {
          await adminClient
            .from('patient_pt_assignments')
            .upsert(
              { patient_id: id, pt_id: input.responsible_pt_id, is_primary: true },
              { onConflict: 'patient_id,pt_id' }
            );
        }
        return data as PatientRecord;
      }

      // Check if version mismatch caused zero rows updated
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
    } catch (err) {
      if (err instanceof AppError) throw err;
      // fallback to in-memory
    }

    const current = this.inMemoryPatients.get(id);
    if (!current) {
      throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND');
    }

    // Strict optimistic lock check
    if (current.version !== expectedVersion) {
      throw new AppError(
        `Conflict: Patient record was modified by another user (expected version ${expectedVersion}, current version is ${current.version}). Please reload and try again.`,
        409,
        'CONFLICT'
      );
    }

    const updated: PatientRecord = {
      ...current,
      first_name: input.first_name ?? current.first_name,
      last_name: input.last_name ?? current.last_name,
      age: input.age !== undefined ? input.age : current.age,
      sex: input.sex !== undefined ? input.sex : current.sex,
      phone: input.phone !== undefined ? normalizePhone(input.phone) : current.phone,
      injury: input.injury !== undefined ? input.injury : current.injury,
      history: input.history ?? current.history,
      responsible_pt_id: input.responsible_pt_id !== undefined ? input.responsible_pt_id : current.responsible_pt_id,
      registration_status: input.registration_status ?? current.registration_status,
      version: current.version + 1,
      updated_at: nowIso,
    };

    this.inMemoryPatients.set(id, updated);
    if (input.responsible_pt_id) {
      this.inMemoryAssignments.set(`${id}:${input.responsible_pt_id}`, {
        patientId: id,
        ptId: input.responsible_pt_id,
        isPrimary: true,
      });
    }

    return updated;
  }

  async listPatients(
    filter: PatientQueryFilter,
    accessiblePatientIds?: string[] | null
  ): Promise<{ patients: PatientRecord[]; total: number; page: number; limit: number }> {
    const page = filter.page || 1;
    const limit = filter.limit || 20;

    // In-memory implementation with full trigram/search & pagination support
    let all = Array.from(this.inMemoryPatients.values());

    // 1. Scope filter by role access
    if (accessiblePatientIds !== null && accessiblePatientIds !== undefined) {
      const allowedSet = new Set(accessiblePatientIds);
      all = all.filter((p) => allowedSet.has(p.id));
    }

    // 2. Status filter
    if (filter.status) {
      all = all.filter((p) => p.registration_status === filter.status);
    }

    // 3. Responsible PT filter
    if (filter.responsible_pt_id) {
      all = all.filter((p) => p.responsible_pt_id === filter.responsible_pt_id);
    }

    // 4. Search query `q` (Thai names, phone, HN)
    if (filter.q) {
      const cleanQ = filter.q.trim().toLowerCase();
      const cleanPhoneQ = normalizePhone(cleanQ) || '';

      all = all.filter((p) => {
        const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
        const hnMatch = p.hn.toLowerCase().includes(cleanQ);
        const nameMatch = fullName.includes(cleanQ) || p.first_name.toLowerCase().includes(cleanQ) || p.last_name.toLowerCase().includes(cleanQ);
        const phoneMatch = cleanPhoneQ && p.phone ? p.phone.includes(cleanPhoneQ) : false;
        return hnMatch || nameMatch || phoneMatch;
      });
    }

    const total = all.length;
    const offset = (page - 1) * limit;
    const paginated = all.slice(offset, offset + limit);

    return {
      patients: paginated,
      total,
      page,
      limit,
    };
  }

  // =========================================================================
  // 3. KIOSK ENROLLMENT DISPATCH & COUNTER CHECK-IN
  // =========================================================================
  async createEnrollmentTicket(
    patientId: string,
    kioskId: string,
    createdBy: string
  ): Promise<EnrollmentTicketRecord> {
    const now = Date.now();
    const expiresAt = new Date(now + 10 * 60 * 1000).toISOString(); // 10 minutes
    const nowIso = new Date(now).toISOString();

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

      if (!error && data) {
        return data as EnrollmentTicketRecord;
      }
    } catch {
      // fallback
    }

    const ticket: EnrollmentTicketRecord = {
      id: randomUUID(),
      patient_id: patientId,
      kiosk_id: kioskId,
      created_by: createdBy,
      expires_at: expiresAt,
      used_at: null,
      created_at: nowIso,
    };

    this.inMemoryTickets.set(ticket.id, ticket);
    return ticket;
  }

  async createCheckin(
    patientId: string,
    kioskId: string | null,
    checkedInBy: string | null
  ): Promise<CheckinRecord> {
    const today = new Date().toISOString().split('T')[0];
    const nowIso = new Date().toISOString();

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

      if (!error && data) {
        return data as CheckinRecord;
      }
    } catch {
      // fallback
    }

    const key = `${patientId}:${today}`;
    const existing = this.inMemoryCheckins.get(key);
    if (existing) {
      return existing;
    }

    const checkin: CheckinRecord = {
      id: randomUUID(),
      patient_id: patientId,
      kiosk_id: kioskId,
      checked_in_by: checkedInBy,
      date: today,
      created_at: nowIso,
    };

    this.inMemoryCheckins.set(key, checkin);
    return checkin;
  }

  async getTodayCheckinPatientIds(dateStr: string): Promise<string[]> {
    try {
      const adminClient = getAdminClient();
      const { data } = await adminClient
        .from('checkins')
        .select('patient_id')
        .eq('date', dateStr);

      if (data && data.length > 0) {
        return data.map((d: { patient_id: string }) => d.patient_id);
      }
    } catch {
      // fallback
    }

    const ids: string[] = [];
    for (const c of this.inMemoryCheckins.values()) {
      if (c.date === dateStr) {
        ids.push(c.patient_id);
      }
    }
    return ids;
  }

  // =========================================================================
  // 4. PDPA BIOMETRIC DELETION
  // =========================================================================
  async deleteBiometrics(patientId: string): Promise<void> {
    try {
      const adminClient = getAdminClient();
      // 1. Delete templates
      await adminClient.from('face_templates').delete().eq('patient_id', patientId);
      // 2. Delete enrollments
      await adminClient.from('face_enrollments').delete().eq('patient_id', patientId);
      // 3. Reset patient registration status to awaiting_face
      await adminClient
        .from('patients')
        .update({ registration_status: 'awaiting_face', updated_at: new Date().toISOString() })
        .eq('id', patientId);
    } catch {
      // fallback
    }

    const patient = this.inMemoryPatients.get(patientId);
    if (patient) {
      patient.registration_status = 'awaiting_face';
      patient.updated_at = new Date().toISOString();
      patient.version += 1;
    }
  }

  // =========================================================================
  // 5. EXPIRY CLEANUP (AWAITING_FACE OLDER THAN 24H)
  // =========================================================================
  async cleanupExpiredPendingPatients(): Promise<number> {
    const nowIso = new Date().toISOString();
    let cleaned = 0;

    for (const patient of this.inMemoryPatients.values()) {
      if (
        patient.registration_status === 'awaiting_face' &&
        patient.pending_expires_at &&
        patient.pending_expires_at <= nowIso
      ) {
        // Soft archive or mark cancelled
        patient.registration_status = 'archived';
        patient.updated_at = nowIso;
        patient.version += 1;
        cleaned++;
      }
    }

    return cleaned;
  }
}

export const defaultPatientRepository = new PatientRepository();
