import { randomUUID } from 'crypto';
import { AppError } from '../../middleware/errorHandler';
import {
  IPatientRepository,
  setDefaultPatientRepository,
} from '../../modules/patients/repository';
import {
  PatientRecord,
  CreatePatientInput,
  UpdatePatientInput,
  PatientQueryFilter,
  EnrollmentTicketRecord,
  CheckinRecord,
  normalizePhone,
} from '../../modules/patients/schema';
import {
  IRecordsRepository,
  setDefaultRecordsRepository,
} from '../../modules/records/repository';
import {
  MedicalNoteRecord,
  TreatmentResultRecord,
} from '../../modules/records/schema';
import {
  ISecurityRepository,
  setDefaultSecurityRepository,
} from '../../modules/security/repository';
import {
  BanRecord,
  BanType,
  BanQueryFilter,
} from '../../modules/security/schema';
import {
  IStaffRepository,
  setDefaultStaffRepository,
} from '../../modules/staff/repository';
import {
  StaffProfileRecord,
  StaffRole,
  StaffStatus,
  StaffQueryFilter,
} from '../../modules/staff/schema';
import {
  IDirectoryRepository,
  setDefaultDirectoryRepository,
} from '../../modules/directory/repository';
import {
  ExerciseRecord,
  CreateExerciseInput,
  UpdateExerciseInput,
  MinigameRecord,
  CreateMinigameInput,
  MinigameQuestionRecord,
  CreateMinigameQuestionInput,
  ModpackRecord,
  CreateModpackInput,
  UpdateModpackInput,
  CaseTransferRecord,
  CreateCaseTransferInput,
  ExerciseQueryFilter,
} from '../../modules/directory/schema';
import {
  ICourseRepository,
  setDefaultCourseRepository,
} from '../../modules/courses/repository';
import {
  CourseRecord,
  CreateCourseOutput,
  UpdateCourseInput,
  CourseQueryFilter,
  CourseItemRecord,
  CourseItemInput,
} from '../../modules/courses/schema';
import {
  IKioskRepository,
  setDefaultKioskRepository,
  KioskDeviceRecord,
  PairingRecord,
  MissionRunRecord,
  MissionStepRecord,
} from '../../modules/kiosk/repository';
import {
  IAuditRepository,
  setDefaultAuditRepository,
} from '../../modules/audit/repository';
import {
  AuditWriteInput,
  AuditQueryFilter,
  AuditLogRecord,
} from '../../modules/audit/schema';
import {
  IAuthRepository,
  setDefaultAuthRepository,
  UserProfileRecord,
} from '../../modules/auth/repository';

import { defaultPatientService } from '../../modules/patients/service';
import { defaultRecordsService } from '../../modules/records/service';
import { defaultSecurityService } from '../../modules/security/service';
import { defaultStaffService } from '../../modules/staff/service';
import { defaultDirectoryService } from '../../modules/directory/service';
import { defaultCourseService } from '../../modules/courses/service';
import { defaultAuditService } from '../../modules/audit/service';
import {
  IFaceEnrollmentRepository,
  setDefaultFaceEnrollmentRepository,
  ConsentRecord,
  EnrollmentTicketData,
  defaultFaceEnrollmentService,
} from '../../modules/face';

export class FakePatientRepository implements IPatientRepository {
  public inMemoryPatients = new Map<string, PatientRecord>();
  public inMemoryAssignments = new Map<string, { patient_id: string; pt_id: string }>();
  public inMemoryTickets = new Map<string, EnrollmentTicketRecord>();
  public inMemoryCheckins = new Map<string, CheckinRecord>();
  public hnCounter = 100000;

  clearInMemory(): void {
    this.inMemoryPatients.clear();
    this.inMemoryAssignments.clear();
    this.inMemoryTickets.clear();
    this.inMemoryCheckins.clear();
    this.hnCounter = 100000;
  }

  async isPatientAccessibleByPt(patientId: string, ptId: string): Promise<boolean> {
    for (const assign of this.inMemoryAssignments.values()) {
      if (assign.patient_id === patientId && assign.pt_id === ptId) {
        return true;
      }
    }
    const today = new Date().toISOString().split('T')[0];
    if (currentFakeDirectoryRepo) {
      const delegated = await currentFakeDirectoryRepo.isPatientDelegatedToPt(patientId, ptId, today);
      if (delegated) return true;
    }
    return false;
  }

  async getAccessiblePatientIdsForPt(ptId: string): Promise<string[]> {
    const ids = new Set<string>();
    for (const assign of this.inMemoryAssignments.values()) {
      if (assign.pt_id === ptId) {
        ids.add(assign.patient_id);
      }
    }
    const today = new Date().toISOString().split('T')[0];
    if (currentFakeDirectoryRepo) {
      for (const t of currentFakeDirectoryRepo.inMemoryTransfers.values()) {
        if (t.to_pt_id === ptId && t.status === 'active' && t.start_date <= today && t.end_date >= today) {
          ids.add(t.patient_id);
        }
      }
    }
    return Array.from(ids);
  }

  async createPatient(
    input: Partial<CreatePatientInput> & { first_name: string; last_name: string },
    createdBy: string,
    responsiblePtId?: string | null
  ): Promise<PatientRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.hnCounter += 1;
    const hn = `HN${this.hnCounter}`;
    const normalizedPhone = input.phone ? normalizePhone(input.phone) : '0812345678';

    const patient: PatientRecord = {
      id,
      hn,
      first_name: input.first_name,
      last_name: input.last_name,
      phone: normalizedPhone,
      age: input.age ?? null,
      sex: input.sex ?? null,
      injury: input.injury ?? null,
      history: input.history ?? {},
      registered_via: input.registered_via ?? 'reception',
      responsible_pt_id: responsiblePtId || null,
      registration_status: 'awaiting_face',
      pending_expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      started_at: null,
      version: 1,
      created_at: now,
      updated_at: now,
    };

    this.inMemoryPatients.set(id, patient);

    if (responsiblePtId) {
      this.inMemoryAssignments.set(`${id}:${responsiblePtId}`, {
        patient_id: id,
        pt_id: responsiblePtId,
      });
    }

    return patient;
  }

  async getPatientById(id: string): Promise<PatientRecord | null> {
    return this.inMemoryPatients.get(id) || null;
  }

  async updatePatient(id: string, input: UpdatePatientInput, expectedVersion: number): Promise<PatientRecord> {
    const existing = this.inMemoryPatients.get(id);
    if (!existing) {
      throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND');
    }
    if (existing.version !== expectedVersion) {
      throw new AppError('Conflict: Patient record modified by another user. Refresh and retry.', 409, 'CONFLICT');
    }

    const updated: PatientRecord = {
      ...existing,
      ...input,
      phone: input.phone ? normalizePhone(input.phone) : existing.phone,
      started_at: input.registration_status === 'active' ? (existing.started_at || new Date().toISOString()) : existing.started_at,
      version: existing.version + 1,
      updated_at: new Date().toISOString(),
    };
    this.inMemoryPatients.set(id, updated);
    return updated;
  }

  async listPatients(
    filter: PatientQueryFilter,
    accessiblePatientIds?: string[] | null
  ): Promise<{ patients: PatientRecord[]; total: number; page: number; limit: number }> {
    let list = Array.from(this.inMemoryPatients.values());

    if (accessiblePatientIds !== null && accessiblePatientIds !== undefined) {
      list = list.filter((p) => accessiblePatientIds.includes(p.id));
    }

    const searchQuery = filter.q?.toLowerCase().trim();
    if (searchQuery) {
      const cleanPhoneQuery = searchQuery.replace(/\D/g, '');
      list = list.filter(
        (p) =>
          p.first_name.toLowerCase().includes(searchQuery) ||
          p.last_name.toLowerCase().includes(searchQuery) ||
          p.hn.toLowerCase().includes(searchQuery) ||
          (p.phone &&
            (p.phone.toLowerCase().includes(searchQuery) ||
              (cleanPhoneQuery.length >= 3 && p.phone.replace(/\D/g, '').includes(cleanPhoneQuery))))
      );
    }

    if (filter.status) {
      list = list.filter((p) => p.registration_status === filter.status);
    }

    const total = list.length;
    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const start = (page - 1) * limit;
    const paged = list.slice(start, start + limit);

    return { patients: paged, total, page, limit };
  }

  async createEnrollmentTicket(patientId: string, kioskId: string, createdBy: string): Promise<EnrollmentTicketRecord> {
    const ticket: EnrollmentTicketRecord = {
      id: randomUUID(),
      patient_id: patientId,
      kiosk_id: kioskId,
      created_by: createdBy,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      used_at: null,
      created_at: new Date().toISOString(),
    };
    this.inMemoryTickets.set(ticket.id, ticket);
    return ticket;
  }

  async createCheckin(patientId: string, kioskId: string | null, checkedInBy: string | null): Promise<CheckinRecord> {
    const today = new Date().toISOString().split('T')[0];
    const key = `${patientId}:${today}`;
    const existing = this.inMemoryCheckins.get(key);
    if (existing) return existing;

    const checkin: CheckinRecord = {
      id: randomUUID(),
      patient_id: patientId,
      kiosk_id: kioskId,
      checked_in_by: checkedInBy,
      date: today,
      created_at: new Date().toISOString(),
    };
    this.inMemoryCheckins.set(key, checkin);
    return checkin;
  }

  async getTodayCheckinPatientIds(dateStr: string): Promise<string[]> {
    const ids: string[] = [];
    for (const c of this.inMemoryCheckins.values()) {
      if (c.date === dateStr) ids.push(c.patient_id);
    }
    return ids;
  }

  async deleteBiometrics(patientId: string): Promise<void> {
    const patient = this.inMemoryPatients.get(patientId);
    if (patient) {
      patient.registration_status = 'awaiting_face';
      patient.updated_at = new Date().toISOString();
      patient.version += 1;
    }
  }

  async cleanupExpiredPendingPatients(): Promise<number> {
    const now = new Date().toISOString();
    let cleaned = 0;
    for (const p of this.inMemoryPatients.values()) {
      if (p.registration_status === 'awaiting_face' && p.pending_expires_at && p.pending_expires_at <= now) {
        p.registration_status = 'archived';
        p.updated_at = now;
        p.version += 1;
        cleaned++;
      }
    }
    return cleaned;
  }
}

export class FakeRecordsRepository implements IRecordsRepository {
  public inMemoryNotes = new Map<string, MedicalNoteRecord>();
  public inMemoryTreatmentResults = new Map<string, TreatmentResultRecord>();

  clearInMemory(): void {
    this.inMemoryNotes.clear();
    this.inMemoryTreatmentResults.clear();
  }

  async getNotes(patientId: string): Promise<MedicalNoteRecord[]> {
    const notes: MedicalNoteRecord[] = [];
    for (const n of this.inMemoryNotes.values()) {
      if (n.patient_id === patientId) notes.push(n);
    }
    return notes.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async createNote(patientId: string, authorId: string, body: string): Promise<MedicalNoteRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const note: MedicalNoteRecord = {
      id,
      patient_id: patientId,
      author_id: authorId,
      body,
      created_at: now,
      author: { id: authorId, full_name: 'PT Staff', role: 'pt' },
    };
    this.inMemoryNotes.set(id, note);
    return note;
  }

  async getTreatmentResults(patientId: string): Promise<TreatmentResultRecord[]> {
    const results: TreatmentResultRecord[] = [];
    for (const r of this.inMemoryTreatmentResults.values()) {
      if (r.patient_id === patientId) results.push(r);
    }
    return results.sort((a, b) => a.version - b.version);
  }

  async createTreatmentResult(
    patientId: string,
    authorId: string,
    body: string,
    supersedesId?: string | null
  ): Promise<TreatmentResultRecord> {
    const existing = await this.getTreatmentResults(patientId);
    let nextVersion = 1;
    if (existing.length > 0) {
      nextVersion = Math.max(...existing.map((r) => r.version)) + 1;
    }

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

    const id = randomUUID();
    const now = new Date().toISOString();
    const result: TreatmentResultRecord = {
      id,
      patient_id: patientId,
      version: nextVersion,
      body,
      author_id: authorId,
      supersedes_id: supersedesId || null,
      created_at: now,
      author: { id: authorId, full_name: 'PT Staff', role: 'pt' },
    };
    this.inMemoryTreatmentResults.set(id, result);
    return result;
  }

  async rejectDirectUpdateNote(id: string): Promise<void> {
    throw new AppError(
      `[IMMUTABLE_RECORD] Database trigger rejected note update: Note ${id} is immutable`,
      403,
      'IMMUTABLE_RECORD'
    );
  }

  async rejectDirectDeleteNote(id: string): Promise<void> {
    throw new AppError(
      `[IMMUTABLE_RECORD] Database trigger rejected note deletion: Note ${id} is append-only`,
      403,
      'IMMUTABLE_RECORD'
    );
  }

  async rejectDirectUpdateTreatmentResult(id: string): Promise<void> {
    throw new AppError(
      `[IMMUTABLE_RECORD] Database trigger rejected treatment result update: Result ${id} is immutable`,
      403,
      'IMMUTABLE_RECORD'
    );
  }

  async rejectDirectDeleteTreatmentResult(id: string): Promise<void> {
    throw new AppError(
      `[IMMUTABLE_RECORD] Database trigger rejected treatment result deletion: Result ${id} is append-only`,
      403,
      'IMMUTABLE_RECORD'
    );
  }
}

export class FakeSecurityRepository implements ISecurityRepository {
  public inMemoryBans = new Map<string, BanRecord>();
  private currentAiSettings: any = {
    cosine_similarity: 0.80,
    margin_threshold: 0.08,
    liveness_enabled: true,
    pose_confidence: 0.65,
    landmark_visibility: 0.55,
    rom_tolerance: 10,
    max_trunk_lean: 22,
    max_velocity: 220,
    voice_guidance: true,
    his_cloud_sync: true,
  };

  clearInMemory(): void {
    this.inMemoryBans.clear();
    this.currentAiSettings = {
      cosine_similarity: 0.80,
      margin_threshold: 0.08,
      liveness_enabled: true,
      pose_confidence: 0.65,
      landmark_visibility: 0.55,
      rom_tolerance: 10,
      max_trunk_lean: 22,
      max_velocity: 220,
      voice_guidance: true,
      his_cloud_sync: true,
    };
  }

  async createBan(data: {
    id?: string;
    type: BanType;
    value: string;
    reason?: string | null;
    expires_at?: string | null;
    created_by?: string | null;
  }): Promise<BanRecord> {
    const id = data.id || randomUUID();
    const now = new Date().toISOString();
    const ban: BanRecord = {
      id,
      type: data.type,
      value: (data.value || '').trim().toLowerCase(),
      reason: data.reason || null,
      expires_at: data.expires_at || null,
      created_by: data.created_by || null,
      created_at: now,
    };
    this.inMemoryBans.set(id, ban);
    return ban;
  }

  async getBanById(id: string): Promise<BanRecord | null> {
    return this.inMemoryBans.get(id) || null;
  }

  async getBanByTypeAndValue(type: BanType, value: string): Promise<BanRecord | null> {
    const clean = value.trim().toLowerCase();
    for (const b of this.inMemoryBans.values()) {
      if (b.type === type && b.value === clean) return b;
    }
    return null;
  }

  async listBans(filter?: BanQueryFilter): Promise<BanRecord[]> {
    let list = Array.from(this.inMemoryBans.values());
    if (filter?.type) {
      list = list.filter((b) => b.type === filter.type);
    }
    if ((filter as any)?.value) {
      const v = (filter as any).value.trim().toLowerCase();
      list = list.filter((b) => b.value === v);
    }
    if ((filter as any)?.target_value) {
      const v = (filter as any).target_value.trim().toLowerCase();
      list = list.filter((b) => b.value === v);
    }
    if (filter?.active_only) {
      const nowIso = new Date().toISOString();
      list = list.filter((b) => !b.expires_at || b.expires_at > nowIso);
    }
    return list;
  }

  async deleteBan(id: string): Promise<boolean> {
    return this.inMemoryBans.delete(id);
  }

  async getActiveBans(): Promise<BanRecord[]> {
    return this.listBans({ active_only: true });
  }

  async getAiSettings(): Promise<any> {
    return { ...this.currentAiSettings };
  }

  async saveAiSettings(settings: any): Promise<any> {
    this.currentAiSettings = { ...settings, updated_at: new Date().toISOString() };
    return { ...this.currentAiSettings };
  }
}

export class FakeStaffRepository implements IStaffRepository {
  public inMemoryStaff = new Map<string, StaffProfileRecord>();

  clearInMemoryStaff(): void {
    this.inMemoryStaff.clear();
  }

  async createAuthUser(_email: string, _password: string): Promise<string> {
    return randomUUID();
  }

  async resetAuthPassword(_userId: string, _newPassword: string): Promise<void> {}

  async createStaff(
    profileData: {
      id: string;
      role: StaffRole;
      username: string;
      full_name: string;
      phone?: string | null;
      bio?: string | null;
      status?: StaffStatus;
    },
    ptData?: {
      license_no: string;
      license_expiry?: string | null;
      specialty?: string | null;
      age?: number | null;
      sex?: string | null;
    }
  ): Promise<StaffProfileRecord> {
    const id = profileData.id || randomUUID();
    const now = new Date().toISOString();
    const record: StaffProfileRecord = {
      id,
      role: profileData.role,
      username: profileData.username,
      full_name: profileData.full_name,
      phone: profileData.phone || null,
      bio: profileData.bio || null,
      avatar_url: null,
      status: profileData.status || 'active',
      force_logout_at: null,
      last_login_at: null,
      created_at: now,
      updated_at: now,
      pt_details: ptData
        ? {
            license_no: ptData.license_no,
            license_expiry: ptData.license_expiry || null,
            specialty: ptData.specialty || null,
            age: ptData.age ?? null,
            sex: ptData.sex || null,
          }
        : null,
    };
    this.inMemoryStaff.set(id, record);
    return record;
  }

  async getStaffById(id: string): Promise<StaffProfileRecord | null> {
    return this.inMemoryStaff.get(id) || null;
  }

  async getStaffByUsername(username: string): Promise<StaffProfileRecord | null> {
    const clean = username.trim().toLowerCase();
    for (const s of this.inMemoryStaff.values()) {
      if (s.username.toLowerCase() === clean) return s;
    }
    return null;
  }

  async listStaff(filter?: StaffQueryFilter): Promise<StaffProfileRecord[]> {
    let list = Array.from(this.inMemoryStaff.values());
    if (filter?.role) {
      list = list.filter((s) => s.role === filter.role);
    }
    if (filter?.status) {
      list = list.filter((s) => s.status === filter.status);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (s) =>
          s.username.toLowerCase().includes(q) ||
          s.full_name.toLowerCase().includes(q)
      );
    }
    return list;
  }

  async updateStaff(
    id: string,
    profileUpdates: Partial<{
      role: StaffRole;
      username: string;
      full_name: string;
      phone: string | null;
      bio: string | null;
      status: StaffStatus;
      avatar_url: string | null;
    }>,
    ptUpdates?: Partial<{
      license_no: string;
      license_expiry: string | null;
      specialty: string | null;
      age: number | null;
      sex: string | null;
    }>
  ): Promise<StaffProfileRecord> {
    const existing = this.inMemoryStaff.get(id);
    if (!existing) {
      throw new AppError(`Staff profile ${id} not found`, 404, 'NOT_FOUND');
    }

    const updated: StaffProfileRecord = {
      ...existing,
      ...profileUpdates,
      updated_at: new Date().toISOString(),
      pt_details:
        existing.role === 'pt' && ptUpdates
          ? {
              license_no: ptUpdates.license_no ?? existing.pt_details?.license_no ?? '',
              license_expiry: ptUpdates.license_expiry ?? existing.pt_details?.license_expiry ?? null,
              specialty: ptUpdates.specialty ?? existing.pt_details?.specialty ?? null,
              age: ptUpdates.age ?? existing.pt_details?.age ?? null,
              sex: ptUpdates.sex ?? existing.pt_details?.sex ?? null,
            }
          : existing.pt_details,
    };
    this.inMemoryStaff.set(id, updated);
    return updated;
  }

  async uploadAvatar(ownerId: string, _fileBuffer: Buffer, _mimeType: string, extension: string): Promise<string> {
    return `https://example.com/avatar-${ownerId}.${extension}`;
  }
}

export class FakeDirectoryRepository implements IDirectoryRepository {
  public inMemoryExercises = new Map<string, ExerciseRecord>();
  public inMemoryMinigames = new Map<string, MinigameRecord>();
  public inMemoryQuestions = new Map<string, MinigameQuestionRecord>();
  public inMemoryModpacks = new Map<string, ModpackRecord>();
  public inMemoryTransfers = new Map<string, CaseTransferRecord>();

  clearAllInMemory(): void {
    this.inMemoryExercises.clear();
    this.inMemoryMinigames.clear();
    this.inMemoryQuestions.clear();
    this.inMemoryModpacks.clear();
    this.inMemoryTransfers.clear();
  }

  async listActivePts(): Promise<StaffProfileRecord[]> {
    if (currentFakeStaffRepo) {
      return currentFakeStaffRepo.listStaff({ role: 'pt', status: 'active' });
    }
    return [];
  }

  // Exercises
  async createExercise(input: CreateExerciseInput, createdBy: string): Promise<ExerciseRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const record: ExerciseRecord = {
      id,
      title: input.title,
      image_path: input.image_path || null,
      description: input.description || null,
      target_joint: input.target_joint || null,
      suitable_for: input.suitable_for || null,
      warnings: input.warnings || null,
      default_sets: input.default_sets ?? 3,
      default_reps: input.default_reps ?? 10,
      difficulty: input.difficulty || 'beginner',
      created_by: createdBy,
      is_active: true,
      created_at: now,
      updated_at: now,
    };
    this.inMemoryExercises.set(id, record);
    return record;
  }

  async getExerciseById(id: string): Promise<ExerciseRecord | null> {
    return this.inMemoryExercises.get(id) || null;
  }

  async updateExercise(id: string, input: UpdateExerciseInput): Promise<ExerciseRecord> {
    const existing = this.inMemoryExercises.get(id);
    if (!existing) throw new AppError(`Exercise ${id} not found`, 404, 'NOT_FOUND');
    const updated = { ...existing, ...input, updated_at: new Date().toISOString() };
    this.inMemoryExercises.set(id, updated);
    return updated;
  }

  async deleteExercise(id: string): Promise<void> {
    this.inMemoryExercises.delete(id);
  }

  async listExercises(filter?: ExerciseQueryFilter): Promise<ExerciseRecord[]> {
    let list = Array.from(this.inMemoryExercises.values());
    if (filter?.target_joint) list = list.filter((e) => e.target_joint === filter.target_joint);
    if (filter?.difficulty) list = list.filter((e) => e.difficulty === filter.difficulty);
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter((e) => e.title.toLowerCase().includes(q) || (e.description && e.description.toLowerCase().includes(q)));
    }
    return list;
  }

  async uploadExerciseMedia(id: string, _fileBuffer: Buffer, _mimeType: string, extension: string): Promise<string> {
    const mediaUrl = `https://storage.local/exercise-media/${id}/media_${Date.now()}.${extension}`;
    const existing = this.inMemoryExercises.get(id);
    if (existing) {
      existing.image_path = mediaUrl;
    }
    return mediaUrl;
  }

  // Minigames
  async createMinigame(input: CreateMinigameInput, createdBy: string): Promise<MinigameRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const record: MinigameRecord = {
      id,
      title: input.title,
      description: input.description || null,
      category: input.category || null,
      is_active: true,
      created_by: createdBy,
      created_at: now,
      updated_at: now,
    };
    this.inMemoryMinigames.set(id, record);
    return record;
  }

  async getMinigameById(id: string): Promise<MinigameRecord | null> {
    return this.inMemoryMinigames.get(id) || null;
  }

  async listMinigames(): Promise<MinigameRecord[]> {
    return Array.from(this.inMemoryMinigames.values());
  }

  async createQuestion(minigameId: string, input: CreateMinigameQuestionInput, createdBy: string): Promise<MinigameQuestionRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const record: MinigameQuestionRecord = {
      id,
      minigame_id: minigameId,
      prompt: input.prompt,
      choices: input.choices,
      answer: input.answer,
      created_by: createdBy,
      created_at: now,
    };
    this.inMemoryQuestions.set(id, record);
    return record;
  }

  async listQuestionsByMinigame(minigameId: string): Promise<MinigameQuestionRecord[]> {
    return Array.from(this.inMemoryQuestions.values()).filter((q) => q.minigame_id === minigameId);
  }

  async deleteQuestion(id: string): Promise<void> {
    this.inMemoryQuestions.delete(id);
  }

  async createMinigameQuestion(input: CreateMinigameQuestionInput, createdBy?: string): Promise<MinigameQuestionRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const record: MinigameQuestionRecord = {
      id,
      minigame_id: (input as any).minigame_id || '',
      prompt: input.prompt,
      choices: input.choices,
      answer: input.answer,
      created_by: createdBy || 'admin',
      created_at: now,
    };
    this.inMemoryQuestions.set(id, record);
    return record;
  }

  async listMinigameQuestions(minigameId: string): Promise<MinigameQuestionRecord[]> {
    let list = Array.from(this.inMemoryQuestions.values());
    if (minigameId) list = list.filter((q) => q.minigame_id === minigameId);
    return list;
  }

  // Modpacks
  async createModpack(input: CreateModpackInput, createdBy: string): Promise<ModpackRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const items = (input.items || []).map((item, idx) => ({
      id: randomUUID(),
      modpack_id: id,
      exercise_id: item.exercise_id,
      sets: item.sets,
      reps: item.reps,
      position: item.position ?? idx + 1,
      exercise: this.inMemoryExercises.get(item.exercise_id) || null,
    }));

    const record: ModpackRecord = {
      id,
      name: input.name,
      description: input.description || null,
      created_by: createdBy,
      created_at: now,
      updated_at: now,
      items,
    };
    this.inMemoryModpacks.set(id, record);
    return record;
  }

  async getModpackById(id: string): Promise<ModpackRecord | null> {
    return this.inMemoryModpacks.get(id) || null;
  }

  async updateModpack(id: string, input: UpdateModpackInput): Promise<ModpackRecord> {
    const existing = this.inMemoryModpacks.get(id);
    if (!existing) throw new AppError(`Modpack ${id} not found`, 404, 'NOT_FOUND');
    let updatedItems = existing.items;
    if (input.items) {
      updatedItems = input.items.map((it, idx) => ({
        id: randomUUID(),
        modpack_id: id,
        exercise_id: it.exercise_id,
        sets: it.sets,
        reps: it.reps,
        position: it.position ?? idx + 1,
        exercise: this.inMemoryExercises.get(it.exercise_id) || null,
      }));
    }
    const updated: ModpackRecord = {
      ...existing,
      ...input,
      items: updatedItems,
      updated_at: new Date().toISOString(),
    };
    this.inMemoryModpacks.set(id, updated);
    return updated;
  }

  async deleteModpack(id: string): Promise<void> {
    this.inMemoryModpacks.delete(id);
  }

  async listModpacks(_targetJoint?: string): Promise<ModpackRecord[]> {
    return Array.from(this.inMemoryModpacks.values());
  }

  // Case Transfers
  async createCaseTransfer(input: CreateCaseTransferInput, fromPtIdOrCreatedBy?: string, createdBy?: string): Promise<CaseTransferRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const from_pt_id = input.from_pt_id || (createdBy ? fromPtIdOrCreatedBy : undefined) || 'pt-001';
    const creator = createdBy || fromPtIdOrCreatedBy || from_pt_id;

    const record: CaseTransferRecord = {
      id,
      patient_id: input.patient_id,
      from_pt_id,
      to_pt_id: input.to_pt_id,
      start_date: input.start_date,
      end_date: input.end_date,
      status: 'active',
      created_by: creator,
      created_at: now,
    };
    this.inMemoryTransfers.set(id, record);
    return record;
  }

  async listCaseTransfers(ptId?: string): Promise<CaseTransferRecord[]> {
    let list = Array.from(this.inMemoryTransfers.values());
    if (ptId) list = list.filter((t) => t.from_pt_id === ptId || t.to_pt_id === ptId);
    return list;
  }

  async getCaseTransferById(id: string): Promise<CaseTransferRecord | null> {
    return this.inMemoryTransfers.get(id) || null;
  }

  async cancelCaseTransfer(id: string): Promise<void> {
    const existing = this.inMemoryTransfers.get(id);
    if (existing) {
      existing.status = 'cancelled';
    }
  }

  async isPatientDelegatedToPt(patientId: string, ptId: string, today: string): Promise<boolean> {
    for (const t of this.inMemoryTransfers.values()) {
      if (
        t.patient_id === patientId &&
        t.to_pt_id === ptId &&
        t.status === 'active' &&
        t.start_date <= today &&
        t.end_date >= today
      ) {
        return true;
      }
    }
    return false;
  }
}

export class FakeCourseRepository implements ICourseRepository {
  public inMemoryCourses = new Map<string, CourseRecord>();

  clearInMemory(): void {
    this.inMemoryCourses.clear();
  }

  async createCourse(
    input: Partial<CreateCourseOutput> & {
      patient_id: string;
      start_date: string;
      end_date: string;
      weekdays: number[];
    },
    ptId: string,
    items: CourseItemInput[] = []
  ): Promise<CourseRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const createdItems: CourseItemRecord[] = (items.length > 0 ? items : (input.items || [])).map((it, idx) => ({
      id: randomUUID(),
      course_id: id,
      exercise_id: it.exercise_id,
      sets: it.sets ?? 3,
      reps: it.reps ?? 10,
      position: it.position ?? idx + 1,
      exercise: currentFakeDirectoryRepo.inMemoryExercises.get(it.exercise_id) || null,
      created_at: now,
    }));

    const patient = currentFakePatientRepo.inMemoryPatients.get(input.patient_id);

    const record: CourseRecord = {
      id,
      patient_id: input.patient_id,
      pt_id: input.pt_id || ptId,
      name: (input as any).name || 'Treatment Course',
      description: (input as any).description || null,
      target_joint: (input as any).target_joint || 'general',
      start_date: input.start_date,
      end_date: input.end_date,
      weekdays: input.weekdays || [],
      start_time: input.start_time || null,
      kiosk_id: input.kiosk_id || null,
      include_minigame: input.include_minigame ?? false,
      modpack_id: input.modpack_id || null,
      goals: input.goals || null,
      progression_criteria: input.progression_criteria || null,
      status: 'active',
      version: 1,
      items: createdItems,
      patient: patient
        ? {
            id: patient.id,
            hn: patient.hn,
            first_name: patient.first_name,
            last_name: patient.last_name,
            phone: patient.phone,
          }
        : null,
      created_at: now,
      updated_at: now,
    } as any;
    this.inMemoryCourses.set(id, record);
    return record;
  }

  async getCourseById(id: string): Promise<CourseRecord | null> {
    return this.inMemoryCourses.get(id) || null;
  }

  async updateCourse(
    id: string,
    input: UpdateCourseInput,
    expectedVersion?: number
  ): Promise<CourseRecord> {
    const existing = this.inMemoryCourses.get(id);
    if (!existing) throw new AppError(`Course ${id} not found`, 404, 'COURSE_NOT_FOUND');
    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      throw new AppError(
        `Conflict: Course was modified by another user (expected version ${expectedVersion}, current version is ${existing.version})`,
        409,
        'CONFLICT'
      );
    }
    const now = new Date().toISOString();
    let updatedItems = existing.items;
    if (input.items && Array.isArray(input.items)) {
      updatedItems = input.items.map((it, idx) => ({
        id: randomUUID(),
        course_id: id,
        exercise_id: it.exercise_id,
        sets: it.sets ?? 3,
        reps: it.reps ?? 10,
        position: it.position ?? idx + 1,
        exercise: currentFakeDirectoryRepo.inMemoryExercises.get(it.exercise_id) || null,
        created_at: now,
      }));
    }

    const updated: CourseRecord = {
      ...existing,
      ...input,
      items: updatedItems,
      version: (existing.version || 1) + 1,
      updated_at: now,
    };
    this.inMemoryCourses.set(id, updated);
    return updated;
  }

  async archiveCourse(id: string, expectedVersion: number): Promise<void> {
    await this.updateCourse(id, { status: 'cancelled' }, expectedVersion);
  }

  async deleteCourse(id: string): Promise<void> {
    const existing = this.inMemoryCourses.get(id);
    if (existing) {
      existing.status = 'cancelled';
      existing.updated_at = new Date().toISOString();
    }
  }

  async listCourses(
    filter: CourseQueryFilter,
    accessiblePatientIds?: string[] | null
  ): Promise<{ courses: CourseRecord[]; total: number; page: number; limit: number }> {
    let list = Array.from(this.inMemoryCourses.values());
    if (accessiblePatientIds !== null && accessiblePatientIds !== undefined) {
      list = list.filter((c) => accessiblePatientIds.includes(c.patient_id));
    }
    if (filter.patient_id) list = list.filter((c) => c.patient_id === filter.patient_id);
    if (filter.pt_id) list = list.filter((c) => c.pt_id === filter.pt_id);
    if (filter.status) list = list.filter((c) => c.status === filter.status);
    if (filter.kiosk_id) list = list.filter((c) => c.kiosk_id === filter.kiosk_id);

    const total = list.length;
    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const start = (page - 1) * limit;
    const paged = list.slice(start, start + limit);
    return { courses: paged, total, page, limit };
  }

  async getPrescriptionForPatientToday(patientId: string, kioskId?: string): Promise<CourseRecord | null> {
    const today = new Date();
    const todayDateStr = today.toISOString().split('T')[0];
    const jsDay = today.getDay();
    const weekdayNumber = jsDay === 0 ? 7 : jsDay;

    for (const c of this.inMemoryCourses.values()) {
      if (c.patient_id !== patientId || c.status !== 'active') continue;
      if (c.start_date && c.end_date && (c.start_date > todayDateStr || c.end_date < todayDateStr)) continue;
      if (kioskId && c.kiosk_id && c.kiosk_id !== kioskId) continue;
      if (Array.isArray(c.weekdays) && (c.weekdays.includes(weekdayNumber) || c.weekdays.includes(jsDay))) {
        return c;
      }
    }
    return null;
  }

  async getTodayAppointments(
    dateStr: string,
    kioskId?: string | null,
    accessiblePatientIds?: string[] | null
  ): Promise<CourseRecord[]> {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    const dayOfWeek = dateObj.getUTCDay();
    const isoDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;

    let list = Array.from(this.inMemoryCourses.values()).filter((c) => {
      if (c.status !== 'active') return false;
      if ((c as any).appointment_date === dateStr) return true;
      const start = c.start_date;
      const end = c.end_date;
      const weekdays = c.weekdays as number[] | undefined;
      if (start && end && start <= dateStr && end >= dateStr) {
        if (!weekdays || weekdays.length === 0 || weekdays.includes(dayOfWeek) || weekdays.includes(isoDayOfWeek)) {
          return true;
        }
      }
      return false;
    });

    if (kioskId !== undefined && kioskId !== null) {
      list = list.filter((c) => !c.kiosk_id || c.kiosk_id === kioskId);
    }
    if (accessiblePatientIds !== null && accessiblePatientIds !== undefined) {
      list = list.filter((c) => accessiblePatientIds.includes(c.patient_id));
    }
    return list;
  }

  async getCalendarAppointments(
    startDate: string,
    endDate: string,
    ptId?: string,
    accessibleIds?: string[] | null
  ): Promise<CourseRecord[]> {
    let list = Array.from(this.inMemoryCourses.values()).filter((c) => {
      if (c.status === 'cancelled') return false;
      const appt = (c as any).appointment_date;
      if (appt && appt >= startDate && appt <= endDate) return true;
      const start = c.start_date;
      const end = c.end_date;
      if (start && end && start <= endDate && end >= startDate) return true;
      return false;
    });
    if (ptId) list = list.filter((c) => c.pt_id === ptId);
    if (accessibleIds !== null && accessibleIds !== undefined) {
      list = list.filter((c) => accessibleIds.includes(c.patient_id));
    }
    return list;
  }
}

export class FakeAuditRepository implements IAuditRepository {
  public inMemoryLogs: AuditLogRecord[] = [];

  async write(input: AuditWriteInput): Promise<AuditLogRecord> {
    const record: AuditLogRecord = {
      id: randomUUID(),
      actor_type: input.actor_type,
      actor_id: input.actor_id || null,
      action: input.action,
      entity: input.entity,
      entity_id: input.entity_id || null,
      ip: input.ip || null,
      device_id: input.device_id || null,
      metadata: input.metadata || {},
      created_at: new Date().toISOString(),
    };
    this.inMemoryLogs.unshift(record);
    return record;
  }

  async query(filter: AuditQueryFilter): Promise<{ logs: AuditLogRecord[]; total: number }> {
    let list = [...this.inMemoryLogs];
    if (filter.actor_id) list = list.filter((l) => l.actor_id === filter.actor_id);
    if (filter.action) list = list.filter((l) => l.action === filter.action);
    if (filter.entity) list = list.filter((l) => l.entity === filter.entity);
    return { logs: list, total: list.length };
  }

  clearInMemoryLogs(): void {
    this.inMemoryLogs = [];
  }
}

export class FakeAuthRepository implements IAuthRepository {
  async getProfileById(userId: string): Promise<UserProfileRecord | null> {
    const s = currentFakeStaffRepo.inMemoryStaff.get(userId);
    if (!s) return null;
    const nameParts = (s.full_name || '').split(' ');
    return {
      id: s.id,
      role: s.role,
      first_name: (s as any).first_name || nameParts[0] || 'Staff',
      last_name: (s as any).last_name || nameParts.slice(1).join(' ') || 'Member',
      status: s.status,
      force_logout_at: s.force_logout_at,
    };
  }

  async forceLogout(userId: string): Promise<void> {
    const s = currentFakeStaffRepo.inMemoryStaff.get(userId);
    if (s) {
      s.force_logout_at = new Date().toISOString();
    }
  }

  async recordStaffDevice(): Promise<void> {}
  async recordLoginFailure(): Promise<void> {}
  async getLoginFailuresByIp(): Promise<number> { return 0; }
  async getLoginFailuresByUsername(): Promise<number> { return 0; }
  async getLoginFailuresByUsernameAndIp(): Promise<number> { return 0; }
}

export class FakeKioskRepository implements IKioskRepository {
  public inMemoryDevices = new Map<string, KioskDeviceRecord>();
  public inMemoryPairings = new Map<string, PairingRecord>();
  public inMemoryChallenges = new Map<string, { nonce: string; device_id: string; steps: string[]; expires_at: Date; used_at: Date | null; created_at: Date }>();
  public inMemoryFaceTemplates = new Map<string, Array<{ patient_id: string; embedding: number[]; pose: string }>>();
  public inMemoryStaffCalls: Array<{ id: string; kiosk_id: string; reason: string; created_at: string; handled_by: string | null; handled_at: string | null }> = [];
  public inMemoryMissionRuns = new Map<string, MissionRunRecord>();
  public inMemoryMissionSteps = new Map<string, MissionStepRecord[]>();
  public inMemorySessions = new Map<string, { token: string; kiosk_id: string; patient_id: string; expires_at: Date; confirmed_at: Date | null; is_active: boolean; created_at: Date }>();
  public failedFaceAttempts = new Map<string, number>();
  public ipFailures: Array<{ ip: string; timestamp: number }> = [];
  public globalFailures: number[] = [];

  constructor() {
    this.seedDefaultDevices();
  }

  seedDefaultDevices(): void {
    this.inMemoryDevices.set('kiosk-01', {
      id: 'kiosk-01',
      name: 'Kiosk 1 Main Building',
      location: 'Building A, Fl 1',
      token_hash: 'kiosk-token-hash-01',
      pairing_code_hash: null,
      paired_at: new Date().toISOString(),
      is_active: true,
    });
    this.inMemoryDevices.set('kiosk-02', {
      id: 'kiosk-02',
      name: 'Kiosk 2 Rehab Center',
      location: 'Building B, Fl 2',
      token_hash: 'kiosk-token-hash-02',
      pairing_code_hash: null,
      paired_at: new Date().toISOString(),
      is_active: true,
    });
  }

  async getKioskById(kioskId: string): Promise<KioskDeviceRecord | null> {
    return this.inMemoryDevices.get(kioskId) || null;
  }

  async savePairingRecord(record: PairingRecord): Promise<void> {
    this.inMemoryPairings.set(record.kioskId, record);
    const existing = this.inMemoryDevices.get(record.kioskId);
    if (existing) {
      existing.pairing_code_hash = record.codeHash;
    }
  }

  async getPairingRecord(kioskId: string): Promise<PairingRecord | null> {
    return this.inMemoryPairings.get(kioskId) || null;
  }

  async recordKioskCodeFailure(kioskId: string): Promise<number> {
    const record = this.inMemoryPairings.get(kioskId);
    if (!record) return 0;
    record.failedAttempts += 1;
    if (record.failedAttempts >= 3) {
      record.isLocked = true;
    }
    return record.failedAttempts;
  }

  async recordIpFailure(ip: string): Promise<void> {
    this.ipFailures.push({ ip, timestamp: Date.now() });
  }

  async getIpFailureCount(ip: string, windowMs: number): Promise<number> {
    const cutoff = Date.now() - windowMs;
    return this.ipFailures.filter((f) => f.ip === ip && f.timestamp >= cutoff).length;
  }

  async recordGlobalFailure(): Promise<void> {
    this.globalFailures.push(Date.now());
  }

  async getGlobalFailureCount(windowMs: number): Promise<number> {
    const cutoff = Date.now() - windowMs;
    return this.globalFailures.filter((t) => t >= cutoff).length;
  }

  async markPairingUsed(kioskId: string, tokenHash: string): Promise<void> {
    const record = this.inMemoryPairings.get(kioskId);
    if (record) {
      record.isUsed = true;
    }
    const dev = this.inMemoryDevices.get(kioskId);
    if (dev) {
      dev.token_hash = tokenHash;
      dev.pairing_code_hash = null;
      dev.paired_at = new Date().toISOString();
      dev.is_active = true;
    }
  }

  async saveChallenge(nonce: string, kioskId: string, steps: string[], expiresAt: Date): Promise<void> {
    this.inMemoryChallenges.set(nonce, {
      nonce,
      device_id: kioskId,
      steps,
      expires_at: expiresAt,
      used_at: null,
      created_at: new Date(),
    });
  }

  async getChallenge(nonce: string): Promise<{ nonce: string; device_id: string; steps: string[]; expires_at: Date; used_at: Date | null; created_at: Date } | null> {
    return this.inMemoryChallenges.get(nonce) || null;
  }

  async markChallengeUsed(nonce: string): Promise<void> {
    const c = this.inMemoryChallenges.get(nonce);
    if (c) c.used_at = new Date();
  }

  async saveFaceTemplate(
    patientId: string,
    embedding: number[],
    pose: 'front' | 'left' | 'right' | 'nod' = 'front'
  ): Promise<void> {
    const arr = this.inMemoryFaceTemplates.get(patientId) || [];
    arr.push({ patient_id: patientId, embedding, pose });
    this.inMemoryFaceTemplates.set(patientId, arr);
  }

  async matchFaceCandidates(
    probe: number[],
    candidateIds: string[]
  ): Promise<Array<{ patient_id: string; score: number }>> {
    if (!candidateIds || candidateIds.length === 0) return [];

    const results: Array<{ patient_id: string; score: number }> = [];
    for (const pid of candidateIds) {
      const templates = this.inMemoryFaceTemplates.get(pid) || [];
      for (const t of templates) {
        let dot = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < probe.length; i++) {
          dot += probe[i] * t.embedding[i];
          normA += probe[i] * probe[i];
          normB += t.embedding[i] * t.embedding[i];
        }
        const sim = normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
        results.push({ patient_id: pid, score: sim });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 10);
  }

  async createStaffCall(kioskId: string, reason: string): Promise<{ id: string; kiosk_id: string; reason: string; created_at: string; handled_by: string | null; handled_at: string | null }> {
    const id = randomUUID();
    const call = {
      id,
      kiosk_id: kioskId,
      reason,
      created_at: new Date().toISOString(),
      handled_by: null,
      handled_at: null,
    };
    this.inMemoryStaffCalls.unshift(call);
    return call;
  }

  async listStaffCalls(kioskId?: string): Promise<Array<{ id: string; kiosk_id: string; reason: string; created_at: string; handled_by: string | null; handled_at: string | null }>> {
    return this.inMemoryStaffCalls.filter((c) => !kioskId || c.kiosk_id === kioskId);
  }

  async handleStaffCall(id: string, staffId: string): Promise<boolean> {
    const call = this.inMemoryStaffCalls.find((c) => c.id === id);
    if (!call) return false;
    call.handled_by = staffId;
    call.handled_at = new Date().toISOString();
    return true;
  }

  async createKioskSession(kioskId: string, patientId: string): Promise<{ token: string; kiosk_id: string; patient_id: string; expires_at: Date; confirmed_at: Date | null; is_active: boolean; created_at: Date }> {
    const token = `ksession_${randomUUID()}_${Date.now()}`;
    const session = {
      token,
      kiosk_id: kioskId,
      patient_id: patientId,
      expires_at: new Date(Date.now() + 15 * 60 * 1000),
      confirmed_at: null,
      is_active: true,
      created_at: new Date(),
    };
    this.inMemorySessions.set(token, session);
    return session;
  }

  async getKioskSession(token: string): Promise<{ token: string; kiosk_id: string; patient_id: string; expires_at: Date; confirmed_at: Date | null; is_active: boolean; created_at: Date } | null> {
    const s = this.inMemorySessions.get(token);
    if (!s || !s.is_active || s.expires_at < new Date()) return null;
    return s;
  }

  async confirmKioskSession(token: string): Promise<{ token: string; kiosk_id: string; patient_id: string; expires_at: Date; confirmed_at: Date | null; is_active: boolean; created_at: Date } | null> {
    const s = await this.getKioskSession(token);
    if (!s) return null;
    s.confirmed_at = new Date();
    return s;
  }

  async invalidateKioskSession(token: string): Promise<void> {
    const s = this.inMemorySessions.get(token);
    if (s) s.is_active = false;
  }

  async getKioskByTokenHash(tokenHash: string): Promise<KioskDeviceRecord | null> {
    for (const d of this.inMemoryDevices.values()) {
      if (d.token_hash === tokenHash) return d;
    }
    return null;
  }

  async listDevices(): Promise<KioskDeviceRecord[]> {
    return Array.from(this.inMemoryDevices.values());
  }

  async createDevice(name: string, location?: string | null): Promise<KioskDeviceRecord> {
    const id = randomUUID();
    const rec: KioskDeviceRecord = {
      id,
      name,
      location: location || null,
      token_hash: randomUUID(),
      pairing_code_hash: null,
      paired_at: null,
      is_active: false,
    };
    this.inMemoryDevices.set(id, rec);
    return rec;
  }

  async getOrCreateMissionRun(patientId: string, courseId: string, runDate: string): Promise<MissionRunRecord> {
    const key = `${patientId}:${courseId}:${runDate}`;
    let run = this.inMemoryMissionRuns.get(key);
    if (!run) {
      run = {
        id: randomUUID(),
        patient_id: patientId,
        course_id: courseId,
        run_date: runDate,
        status: 'pending',
        started_at: null,
        finished_at: null,
        created_at: new Date().toISOString(),
      };
      this.inMemoryMissionRuns.set(key, run);
    }
    return run;
  }

  async recordMissionStep(
    runId: string,
    stepType: 'exercise' | 'minigame' | 'rest',
    refId?: string | null,
    score?: unknown
  ): Promise<MissionStepRecord> {
    const step: MissionStepRecord = {
      id: randomUUID(),
      run_id: runId,
      step_type: stepType,
      ref_id: refId || null,
      score,
      completed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    const steps = this.inMemoryMissionSteps.get(runId) || [];
    steps.push(step);
    this.inMemoryMissionSteps.set(runId, steps);

    for (const run of this.inMemoryMissionRuns.values()) {
      if (run.id === runId && run.status === 'pending') {
        run.status = 'in_progress';
        run.started_at = new Date().toISOString();
      }
    }
    return step;
  }

  async completeMissionRun(
    patientId: string,
    courseId: string,
    runDate: string
  ): Promise<MissionRunRecord> {
    const key = `${patientId}:${courseId}:${runDate}`;
    let run = this.inMemoryMissionRuns.get(key);
    if (!run) {
      run = await this.getOrCreateMissionRun(patientId, courseId, runDate);
    }
    run.status = 'completed';
    run.finished_at = new Date().toISOString();
    return run;
  }

  async getMissionRunByPatientAndCourse(
    patientId: string,
    courseId: string,
    runDate: string
  ): Promise<MissionRunRecord | null> {
    const key = `${patientId}:${courseId}:${runDate}`;
    return this.inMemoryMissionRuns.get(key) || null;
  }

  getFailedFaceAttempts(kioskId: string): number {
    return this.failedFaceAttempts.get(kioskId) || 0;
  }

  incrementFailedFaceAttempts(kioskId: string): number {
    const cur = this.getFailedFaceAttempts(kioskId) + 1;
    this.failedFaceAttempts.set(kioskId, cur);
    return cur;
  }

  resetFailedFaceAttempts(kioskId: string): void {
    this.failedFaceAttempts.set(kioskId, 0);
  }

  clearPairings(): void {
    this.inMemoryPairings.clear();
    this.inMemoryChallenges.clear();
    this.inMemoryFaceTemplates.clear();
    this.inMemoryStaffCalls = [];
    this.inMemorySessions.clear();
    this.inMemoryMissionRuns.clear();
    this.inMemoryMissionSteps.clear();
    this.failedFaceAttempts.clear();
    this.ipFailures = [];
    this.globalFailures = [];
    this.inMemoryDevices.clear();
    this.seedDefaultDevices();
  }
}

export class FakeFaceEnrollmentRepository implements IFaceEnrollmentRepository {
  public inMemoryConsents = new Map<string, ConsentRecord>();
  public inMemoryTickets = new Map<string, EnrollmentTicketData>();
  public inMemoryTemplates: Array<{ patient_id: string; embedding: number[]; pose: string }> = [];
  public inMemoryStorageFiles = new Map<string, Buffer>();
  public inMemoryEnrollments = new Map<string, { id: string; patient_id: string; status: string }>();
  public failRpc: boolean = false;
  public failUpload: boolean = false;

  clearInMemory(): void {
    this.inMemoryConsents.clear();
    this.inMemoryTickets.clear();
    this.inMemoryTemplates = [];
    this.inMemoryStorageFiles.clear();
    this.inMemoryEnrollments.clear();
    this.failRpc = false;
    this.failUpload = false;
  }

  async getActiveConsent(patientId: string, consentId?: string): Promise<ConsentRecord | null> {
    for (const consent of this.inMemoryConsents.values()) {
      if (consent.subject_id === patientId && !consent.revoked_at) {
        if (!consentId || consent.id === consentId) {
          return consent;
        }
      }
    }
    return null;
  }

  async isPatientAccessibleByPt(patientId: string, ptId: string): Promise<boolean> {
    return currentFakePatientRepo.isPatientAccessibleByPt(patientId, ptId);
  }

  async getEnrollmentTicket(ticketId: string): Promise<EnrollmentTicketData | null> {
    return this.inMemoryTickets.get(ticketId) || null;
  }

  async findDuplicateFaceCandidate(
    probe: number[],
    excludePatientId: string,
    threshold: number
  ): Promise<{ patient_id: string; score: number } | null> {
    let bestMatch: { patient_id: string; score: number } | null = null;
    let maxScore = -1;

    for (const t of this.inMemoryTemplates) {
      if (t.patient_id === excludePatientId) continue;
      let dot = 0;
      for (let i = 0; i < probe.length; i++) {
        dot += probe[i] * t.embedding[i];
      }
      if (dot > maxScore) {
        maxScore = dot;
        if (dot >= threshold) {
          bestMatch = { patient_id: t.patient_id, score: dot };
        }
      }
    }

    return bestMatch;
  }

  async uploadBiometricImages(
    patientId: string,
    enrollmentId: string,
    images: Array<{ frameIndex: number; buffer: Buffer }>
  ): Promise<string[]> {
    if (this.failUpload) {
      throw new AppError('Storage service unavailable', 503, 'STORAGE_UNAVAILABLE');
    }

    const uploadedPaths: string[] = [];
    for (const img of images) {
      const frameNum = String(img.frameIndex + 1).padStart(2, '0');
      const filePath = `${patientId}/${enrollmentId}/frame_${frameNum}.jpg`;
      this.inMemoryStorageFiles.set(filePath, img.buffer);
      uploadedPaths.push(filePath);
    }
    return uploadedPaths;
  }

  async deleteBiometricFiles(filePaths: string[]): Promise<void> {
    for (const path of filePaths) {
      this.inMemoryStorageFiles.delete(path);
    }
  }

  async deletePatientBiometricStorage(patientId: string): Promise<number> {
    let count = 0;
    for (const key of Array.from(this.inMemoryStorageFiles.keys())) {
      if (key.startsWith(`${patientId}/`)) {
        this.inMemoryStorageFiles.delete(key);
        count++;
      }
    }
    return count;
  }

  async callEnrollFaceAtomic(params: {
    patientId: string;
    staffId: string;
    modelVersion: string;
    poses: string[];
    embeddings: number[][];
    consentId?: string | null;
    ticketId?: string | null;
  }): Promise<string> {
    if (this.failRpc) {
      throw new AppError('RPC enroll_face_atomic execution failed: database constraint violation', 500, 'RPC_FAILED');
    }

    const enrollmentId = randomUUID();
    this.inMemoryEnrollments.set(enrollmentId, {
      id: enrollmentId,
      patient_id: params.patientId,
      status: 'active',
    });

    for (let i = 0; i < params.poses.length; i++) {
      this.inMemoryTemplates.push({
        patient_id: params.patientId,
        pose: params.poses[i],
        embedding: params.embeddings[i],
      });
    }

    if (params.ticketId && this.inMemoryTickets.has(params.ticketId)) {
      const t = this.inMemoryTickets.get(params.ticketId)!;
      t.used_at = new Date().toISOString();
    }

    const patient = currentFakePatientRepo.inMemoryPatients.get(params.patientId);
    if (patient) {
      patient.registration_status = 'active';
    }

    return enrollmentId;
  }

  async rollbackEnrollment(enrollmentId: string, patientId: string): Promise<void> {
    this.inMemoryEnrollments.delete(enrollmentId);
    this.inMemoryTemplates = this.inMemoryTemplates.filter((t) => t.patient_id !== patientId);
    const patient = currentFakePatientRepo.inMemoryPatients.get(patientId);
    if (patient) {
      patient.registration_status = 'awaiting_face';
    }
  }

  async deleteBiometrics(patientId: string): Promise<void> {
    this.inMemoryTemplates = this.inMemoryTemplates.filter((t) => t.patient_id !== patientId);
    for (const [id, en] of this.inMemoryEnrollments.entries()) {
      if (en.patient_id === patientId) {
        this.inMemoryEnrollments.delete(id);
      }
    }
    await this.deletePatientBiometricStorage(patientId);
    const patient = currentFakePatientRepo.inMemoryPatients.get(patientId);
    if (patient) {
      patient.registration_status = 'awaiting_face';
    }
  }
}

export const currentFakePatientRepo = new FakePatientRepository();
export const currentFakeRecordsRepo = new FakeRecordsRepository();
export const currentFakeSecurityRepo = new FakeSecurityRepository();
export const currentFakeStaffRepo = new FakeStaffRepository();
export const currentFakeDirectoryRepo = new FakeDirectoryRepository();
export const currentFakeCourseRepo = new FakeCourseRepository();
export const currentFakeAuditRepo = new FakeAuditRepository();
export const currentFakeAuthRepo = new FakeAuthRepository();
export const currentFakeKioskRepo = new FakeKioskRepository();
export const currentFakeFaceEnrollmentRepo = new FakeFaceEnrollmentRepository();

export function setupTestFakeRepositories(): void {
  setDefaultPatientRepository(currentFakePatientRepo);
  setDefaultRecordsRepository(currentFakeRecordsRepo);
  setDefaultSecurityRepository(currentFakeSecurityRepo);
  setDefaultStaffRepository(currentFakeStaffRepo);
  setDefaultDirectoryRepository(currentFakeDirectoryRepo);
  setDefaultCourseRepository(currentFakeCourseRepo);
  setDefaultAuditRepository(currentFakeAuditRepo);
  setDefaultAuthRepository(currentFakeAuthRepo);
  setDefaultKioskRepository(currentFakeKioskRepo);
  setDefaultFaceEnrollmentRepository(currentFakeFaceEnrollmentRepo);

  defaultPatientService.setRepository(currentFakePatientRepo);
  defaultRecordsService.setRepository(currentFakeRecordsRepo);
  defaultRecordsService.setPatientRepository(currentFakePatientRepo);
  defaultSecurityService.setRepository(currentFakeSecurityRepo);
  defaultStaffService.setRepository(currentFakeStaffRepo);
  defaultDirectoryService.setRepository(currentFakeDirectoryRepo);
  defaultCourseService.setRepository(currentFakeCourseRepo);
  defaultCourseService.setPatientRepository(currentFakePatientRepo);
  defaultCourseService.setDirectoryRepository(currentFakeDirectoryRepo);
  defaultAuditService.setRepository(currentFakeAuditRepo);
  defaultFaceEnrollmentService.setRepository(currentFakeFaceEnrollmentRepo);
  defaultFaceEnrollmentService.setPatientRepository(currentFakePatientRepo);
}

export function resetAllFakeRepositories(): void {
  currentFakePatientRepo.clearInMemory();
  currentFakeRecordsRepo.clearInMemory();
  currentFakeSecurityRepo.clearInMemory();
  currentFakeStaffRepo.clearInMemoryStaff();
  currentFakeDirectoryRepo.clearAllInMemory();
  currentFakeCourseRepo.clearInMemory();
  currentFakeAuditRepo.clearInMemoryLogs();
  currentFakeKioskRepo.clearPairings();
  currentFakeFaceEnrollmentRepo.clearInMemory();
}
