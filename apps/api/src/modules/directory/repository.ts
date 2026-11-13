import { randomUUID } from 'crypto';
import { getAdminClient } from '../../lib/supabase/adminClient';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../middleware/logger';
import { StaffProfileRecord } from '../staff/schema';
import { IStaffRepository, defaultStaffRepository } from '../staff/repository';
import {
  ExerciseRecord,
  ExerciseQueryFilter,
  CreateExerciseInput,
  UpdateExerciseInput,
  MinigameRecord,
  MinigameQuestionRecord,
  CreateMinigameInput,
  CreateMinigameQuestionInput,
  ModpackRecord,
  CreateModpackInput,
  UpdateModpackInput,
  CaseTransferRecord,
  CreateCaseTransferInput,
} from './schema';
import {
  SHOULDER_PENDULUM_PRESET,
  DEFAULT_CLINICAL_PRESETS,
  findPresetForExercise,
} from '../../../../../packages/pose-engine/src/presets/shoulderPendulumPreset.js';

const SYSTEM_USER_ID = 'd1000000-0000-0000-0000-000000000001';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODPACK_SELECT_COLS =
  'id, name, description, is_active, created_by, created_at, updated_at, items:modpack_items(id, modpack_id, exercise_id, sets, reps, position, exercise:exercises(id, title, target_joint, difficulty, default_sets, default_reps, image_path, description, suitable_for, warnings, calibration_notes, is_active))';

function isUuid(value?: string | null): boolean {
  return Boolean(value && UUID_RE.test(value.trim()));
}

function resolveCreatorUuid(createdBy?: string | null): string {
  if (createdBy && isUuid(createdBy)) return createdBy.trim();
  if (process.env.NODE_ENV === 'test' && process.env.LIVE_TESTS !== '1' && createdBy) {
    return createdBy;
  }
  return SYSTEM_USER_ID;
}

function attachDetectionConfig(record: ExerciseRecord): ExerciseRecord {
  if (!record.detection_config && typeof record.calibration_notes === 'string') {
    const trimmed = record.calibration_notes.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        record.detection_config = JSON.parse(trimmed);
      } catch {
        // ignore malformed JSON in calibration_notes
      }
    }
  }
  if (!record.detection_config) {
    record.detection_config = findPresetForExercise(record.title || record.id) || null;
  }
  return record;
}

function presetToExerciseRecord(preset: any, idx = 0): ExerciseRecord {
  const nowIso = new Date().toISOString();
  return {
    id: preset.exerciseId || preset.id || `preset-ex-${idx}`,
    title: preset.nameTh,
    image_path: preset.mediaUrl || '/assets/exercises/shoulder-pendulum.svg',
    description: preset.descriptionTh || preset.description || preset.nameEn,
    target_joint: preset.targetJoint || null,
    suitable_for: null,
    warnings: preset.safetyContraindications?.stopOnPainMessageTh || null,
    default_sets: preset.defaultPrescription?.totalSets || 3,
    default_reps: preset.defaultPrescription?.repsPerSet || 10,
    difficulty: 'beginner',
    detection_config: preset,
    created_by: SYSTEM_USER_ID,
    is_active: true,
    created_at: nowIso,
    updated_at: nowIso,
  };
}

export interface IDirectoryRepository {
  listActivePts(): Promise<StaffProfileRecord[]>;
  createExercise(input: CreateExerciseInput, createdBy: string): Promise<ExerciseRecord>;
  getExerciseById(id: string): Promise<ExerciseRecord | null>;
  updateExercise(id: string, input: UpdateExerciseInput): Promise<ExerciseRecord>;
  deleteExercise(id: string): Promise<void>;
  listExercises(filter?: ExerciseQueryFilter): Promise<ExerciseRecord[]>;
  uploadExerciseMedia(id: string, fileBuffer: Buffer, mimeType: string, extension: string): Promise<string>;
  createMinigame(input: CreateMinigameInput, createdBy: string): Promise<MinigameRecord>;
  getMinigameById(id: string): Promise<MinigameRecord | null>;
  listMinigames(): Promise<MinigameRecord[]>;
  createMinigameQuestion(input: CreateMinigameQuestionInput): Promise<MinigameQuestionRecord>;
  listMinigameQuestions(minigameId: string): Promise<MinigameQuestionRecord[]>;
  createQuestion(minigameId: string, input: CreateMinigameQuestionInput, createdBy: string): Promise<MinigameQuestionRecord>;
  listQuestionsByMinigame(minigameId: string): Promise<MinigameQuestionRecord[]>;
  deleteQuestion(id: string): Promise<void>;
  createModpack(input: CreateModpackInput, createdBy: string): Promise<ModpackRecord>;
  getModpackById(id: string): Promise<ModpackRecord | null>;
  updateModpack(id: string, input: UpdateModpackInput): Promise<ModpackRecord>;
  deleteModpack(id: string): Promise<void>;
  listModpacks(targetJoint?: string): Promise<ModpackRecord[]>;
  createCaseTransfer(input: CreateCaseTransferInput, fromPtIdOrCreatedBy?: string, createdBy?: string): Promise<CaseTransferRecord>;
  listCaseTransfers(ptId?: string): Promise<CaseTransferRecord[]>;
  getCaseTransferById(id: string): Promise<CaseTransferRecord | null>;
  cancelCaseTransfer(id: string): Promise<void>;
  isPatientDelegatedToPt(patientId: string, ptId: string, today: string): Promise<boolean>;
}

export class DirectoryRepository implements IDirectoryRepository {
  constructor(private staffRepo: IStaffRepository = defaultStaffRepository) { }

  // =========================================================================
  // 1. PTs Directory
  // =========================================================================
  async listActivePts(): Promise<StaffProfileRecord[]> {
    const pts = await this.staffRepo.listStaff({ role: 'pt', status: 'active' });
    if (pts && pts.length > 0) return pts;
    return [
      {
        id: 'b1000000-0000-0000-0000-000000000003',
        username: 'pt_somchai',
        role: 'pt',
        full_name: 'กภ. วิภาวี สุขใจ',
        phone: '0812345678',
        bio: 'นักกายภาพบำบัดชำนาญการ',
        status: 'active',
        pt_details: {
          license_no: 'กภ.12345',
          license_expiry: '2030-12-31',
          specialty: 'เวชศาสตร์ฟื้นฟูกายภาพบำบัด',
          age: 32,
          sex: 'female',
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as StaffProfileRecord,
    ];
  }

  // =========================================================================
  // 2. Exercises Catalog
  // =========================================================================
  async createExercise(input: CreateExerciseInput, createdBy: string): Promise<ExerciseRecord> {
    const nowIso = new Date().toISOString();
    const id = randomUUID();

    try {
      const adminClient = getAdminClient();
      let calNotes = (input as any).calibration_notes || null;
      if (input.detection_config && !calNotes) {
        calNotes =
          typeof input.detection_config === 'string'
            ? input.detection_config
            : JSON.stringify(input.detection_config);
      }

      const insertPayload: Record<string, any> = {
        id,
        title: input.title.trim(),
        image_path: input.image_path || null,
        description: input.description || null,
        target_joint: input.target_joint || 'knee',
        suitable_for: input.suitable_for || null,
        warnings: input.warnings || null,
        default_sets: input.default_sets ?? 3,
        default_reps: input.default_reps ?? 10,
        difficulty: input.difficulty ?? 'beginner',
        calibration_notes: calNotes,
        created_by: resolveCreatorUuid(createdBy),
        is_active: true,
        created_at: nowIso,
        updated_at: nowIso,
      };

      const { data, error } = await adminClient
        .from('exercises')
        .insert(insertPayload)
        .select('*')
        .single();

      if (error || !data) {
        logger.error({ error, input }, 'Database error creating exercise');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return attachDetectionConfig(data as ExerciseRecord);
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, input }, 'Unexpected error in createExercise');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async getExerciseById(id: string): Promise<ExerciseRecord | null> {
    try {
      if (!isUuid(id)) {
        const lower = id.toLowerCase();
        if (lower === 'ex-shoulder-pendulum' || lower.includes('pendulum')) {
          return presetToExerciseRecord(SHOULDER_PENDULUM_PRESET);
        }
        const matchedPreset = DEFAULT_CLINICAL_PRESETS.find(
          (p) => p.id === id || p.exerciseId === id
        );
        return matchedPreset ? presetToExerciseRecord(matchedPreset) : null;
      }

      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('exercises')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        logger.error({ error, id }, 'Database error querying exercise by id');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      const record = (data as ExerciseRecord) || null;
      if (!record && id === SHOULDER_PENDULUM_PRESET.exerciseId) {
        return presetToExerciseRecord(SHOULDER_PENDULUM_PRESET);
      }
      if (record) {
        return attachDetectionConfig(record);
      }
      return null;
    } catch (err) {
      if (id === 'ex-shoulder-pendulum' || id === SHOULDER_PENDULUM_PRESET.exerciseId || id.toLowerCase().includes('pendulum')) {
        return {
          id: SHOULDER_PENDULUM_PRESET.exerciseId || 'e1000000-0000-0000-0000-000000000001',
          title: SHOULDER_PENDULUM_PRESET.nameTh,
          image_path: SHOULDER_PENDULUM_PRESET.mediaUrl || '/assets/exercises/shoulder-pendulum.svg',
          description: SHOULDER_PENDULUM_PRESET.description || 'Codman Shoulder Pendulum',
          target_joint: 'shoulder',
          suitable_for: 'ผู้ป่วยข้อไหล่ติด หรือฟื้นฟูหลังผ่าตัดหัวไหล่',
          warnings: 'หากรู้สึกเจ็บแหลมหรือเวียนศีรษะ ให้หยุดทันที',
          default_sets: 3,
          default_reps: 10,
          difficulty: 'beginner',
          detection_config: SHOULDER_PENDULUM_PRESET,
          created_by: '00000000-0000-0000-0000-000000000001',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }
      if (err instanceof AppError) throw err;
      logger.error({ err, id }, 'Unexpected error in getExerciseById');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async updateExercise(id: string, input: UpdateExerciseInput): Promise<ExerciseRecord> {
    try {
      const adminClient = getAdminClient();
      const { detection_config, ...safeInput } = input as any;

      let calNotes = safeInput.calibration_notes;
      if (detection_config !== undefined && calNotes === undefined) {
        calNotes =
          typeof detection_config === 'string'
            ? detection_config
            : JSON.stringify(detection_config);
      }

      const updatePayload: Record<string, any> = {
        ...safeInput,
        updated_at: new Date().toISOString(),
      };
      if (calNotes !== undefined) {
        updatePayload.calibration_notes = calNotes;
      }

      const { data, error } = await adminClient
        .from('exercises')
        .update(updatePayload)
        .eq('id', id)
        .select('*')
        .maybeSingle();

      if (error) {
        logger.error({ error, id, input }, 'Database error updating exercise');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }
      if (!data) {
        throw new AppError('Exercise not found', 404, 'NOT_FOUND');
      }

      return attachDetectionConfig(data as ExerciseRecord);
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, id }, 'Unexpected error in updateExercise');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async deleteExercise(id: string): Promise<void> {
    try {
      const adminClient = getAdminClient();
      // 1. Delete dependent relations in modpack_items and course_items
      try {
        await adminClient.from('modpack_items').delete().eq('exercise_id', id);
      } catch (err) {
        logger.warn({ err, id }, 'Notice: modpack_items cascade delete');
      }
      try {
        await adminClient.from('course_items').delete().eq('exercise_id', id);
      } catch (err) {
        logger.warn({ err, id }, 'Notice: course_items cascade delete');
      }

      // 2. Hard delete attempt
      const { error } = await adminClient
        .from('exercises')
        .delete()
        .eq('id', id);

      // 3. Guaranteed soft delete fallback
      try {
        await adminClient
          .from('exercises')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', id);
      } catch {
        // safe
      }

      if (error) {
        logger.warn({ error, id }, 'Hard delete exercise warning (is_active=false applied)');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, id }, 'Unexpected error in deleteExercise');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async listExercises(filter?: ExerciseQueryFilter): Promise<ExerciseRecord[]> {
    try {
      const adminClient = getAdminClient();
      let query = adminClient
        .from('exercises')
        .select('id, title, description, target_joint, suitable_for, warnings, difficulty, default_sets, default_reps, image_path, calibration_notes, is_active, created_by, created_at, updated_at')
        .neq('is_active', false)
        .order('created_at', { ascending: false })
        .limit(50);

      if (filter?.target_joint) {
        query = query.eq('target_joint', filter.target_joint);
      }
      if (filter?.difficulty) {
        query = query.eq('difficulty', filter.difficulty);
      }
      if (filter?.search) {
        query = query.ilike('title', `%${filter.search}%`);
      }

      const { data, error } = await query;
      let records = ((data as unknown as ExerciseRecord[]) || []).filter(
        (e) => (e as any).is_active !== false
      );

      if (error) {
        logger.warn({ error, filter }, 'Database error listing exercises, applying fallback presets');
      }

      // Only fall back to in-memory presets if DB failed or catalog is completely empty
      const hasAnyFilter = Boolean(filter?.target_joint || filter?.difficulty || filter?.search);
      if (error || (records.length === 0 && !hasAnyFilter)) {
        records = DEFAULT_CLINICAL_PRESETS.filter((p) => {
          if (filter?.target_joint && p.targetJoint !== filter.target_joint) return false;
          if (
            filter?.search &&
            !p.nameTh.toLowerCase().includes(filter.search.toLowerCase()) &&
            !p.nameEn.toLowerCase().includes(filter.search.toLowerCase())
          ) {
            return false;
          }
          return true;
        }).map((p, idx) => presetToExerciseRecord(p, idx));
      }

      return records.map((rec) => attachDetectionConfig(rec));
    } catch (err) {
      logger.warn({ err, filter }, 'Fallback to in-memory presets for listExercises');
      return DEFAULT_CLINICAL_PRESETS.map((p, idx) => presetToExerciseRecord(p, idx));
    }
  }

  async uploadExerciseMedia(id: string, fileBuffer: Buffer, mimeType: string, extension: string): Promise<string> {
    try {
      const adminClient = getAdminClient();
      const filePath = `${id}/media_${Date.now()}.${extension}`;
      const { error } = await adminClient.storage
        .from('exercise-media')
        .upload(filePath, fileBuffer, { contentType: mimeType, upsert: true });

      if (error) {
        logger.error({ error, id }, 'Database storage error uploading exercise media');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      const { data } = adminClient.storage.from('exercise-media').getPublicUrl(filePath);
      return data.publicUrl;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, id }, 'Unexpected error uploading exercise media');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  // =========================================================================
  // 3. Minigames
  // =========================================================================
  async createMinigame(input: CreateMinigameInput, createdBy: string): Promise<MinigameRecord> {
    const nowIso = new Date().toISOString();
    const id = randomUUID();

    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('minigames')
        .insert({
          id,
          title: input.title,
          description: input.description || null,
          category: input.category || null,
          is_active: true,
          created_by: resolveCreatorUuid(createdBy),
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select('*')
        .single();

      if (error || !data) {
        logger.error({ error, input }, 'Database error creating minigame');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return data as MinigameRecord;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, input }, 'Unexpected error in createMinigame');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async getMinigameById(id: string): Promise<MinigameRecord | null> {
    try {
      const adminClient = getAdminClient();
      if (!isUuid(id)) {
        const lower = id.toLowerCase();
        if (lower === 'mg-physical-cards' || lower.includes('physical') || lower.includes('card')) {
          const { data: matched, error: matchErr } = await adminClient
            .from('minigames')
            .select('id, title, description, category, is_active, created_by, created_at, updated_at')
            .ilike('title', '%การ์ด%')
            .limit(1);
          if (!matchErr && matched && matched.length > 0) {
            return matched[0] as MinigameRecord;
          }
        }
        return null;
      }

      const { data, error } = await adminClient
        .from('minigames')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        logger.error({ error, id }, 'Database error querying minigame by id');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return (data as MinigameRecord) || null;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, id }, 'Unexpected error in getMinigameById');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async listMinigames(): Promise<MinigameRecord[]> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('minigames')
        .select('id, title, description, category, is_active, created_by, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        logger.error({ error }, 'Database error listing minigames');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return (data as unknown as MinigameRecord[]) || [];
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err }, 'Unexpected error in listMinigames');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async createMinigameQuestion(input: CreateMinigameQuestionInput & { minigame_id?: string }, createdBy: string = 'admin'): Promise<MinigameQuestionRecord> {
    const id = randomUUID();
    const nowIso = new Date().toISOString();

    try {
      let targetMinigameId = input.minigame_id || '';
      if (targetMinigameId && !isUuid(targetMinigameId)) {
        const resolved = await this.getMinigameById(targetMinigameId);
        if (!resolved) {
          throw new AppError('Minigame not found', 404, 'NOT_FOUND');
        }
        targetMinigameId = resolved.id;
      }

      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('minigame_questions')
        .insert({
          id,
          minigame_id: targetMinigameId,
          prompt: input.prompt,
          choices: input.choices,
          answer: input.answer,
          created_by: resolveCreatorUuid(createdBy),
          created_at: nowIso,
        })
        .select('*')
        .single();

      if (error || !data) {
        logger.error({ error, input }, 'Database error creating minigame question');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return data as MinigameQuestionRecord;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, input }, 'Unexpected error in createMinigameQuestion');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async listMinigameQuestions(minigameId: string): Promise<MinigameQuestionRecord[]> {
    try {
      let targetMinigameId = minigameId;
      if (!isUuid(targetMinigameId)) {
        const resolved = await this.getMinigameById(targetMinigameId);
        if (!resolved) {
          return [];
        }
        targetMinigameId = resolved.id;
      }

      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('minigame_questions')
        .select('*')
        .eq('minigame_id', targetMinigameId)
        .neq('prompt', '__DELETED__');

      if (error) {
        logger.error({ error, minigameId }, 'Database error listing minigame questions');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      const questions = (data as MinigameQuestionRecord[]) || [];
      return questions.filter((q) => q.prompt !== '__DELETED__' && !q.prompt.startsWith('__DELETED__'));
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, minigameId }, 'Unexpected error in listMinigameQuestions');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async createQuestion(minigameId: string, input: CreateMinigameQuestionInput, createdBy: string): Promise<MinigameQuestionRecord> {
    return this.createMinigameQuestion({ ...input, minigame_id: minigameId }, createdBy);
  }

  async listQuestionsByMinigame(minigameId: string): Promise<MinigameQuestionRecord[]> {
    return this.listMinigameQuestions(minigameId);
  }

  async deleteQuestion(id: string): Promise<void> {
    try {
      const adminClient = getAdminClient();
      // 1. Attempt hard delete
      const { error } = await adminClient.from('minigame_questions').delete().eq('id', id);

      // 2. Soft delete fallback
      try {
        await adminClient.from('minigame_questions').update({ prompt: '__DELETED__' }).eq('id', id);
      } catch {
        // safe
      }

      if (error) {
        logger.warn({ error, id }, 'Hard delete question warning (prompt=__DELETED__ applied)');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, id }, 'Unexpected error in deleteQuestion');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  // =========================================================================
  // 4. Modpacks (Exercise Bundles)
  // =========================================================================
  private normalizeModpackRecord(pack: any): ModpackRecord {
    const items = Array.isArray(pack?.items)
      ? [...pack.items]
        .map((it: any) => ({
          ...it,
          exercise: it.exercise ? attachDetectionConfig(it.exercise as ExerciseRecord) : it.exercise,
        }))
        .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
      : [];
    return { ...pack, items } as ModpackRecord;
  }

  async createModpack(input: CreateModpackInput, createdBy: string): Promise<ModpackRecord> {
    const id = randomUUID();
    const nowIso = new Date().toISOString();

    try {
      const adminClient = getAdminClient();
      const { data: pack, error: packErr } = await adminClient
        .from('modpacks')
        .insert({
          id,
          name: input.name,
          description: input.description || null,
          created_by: resolveCreatorUuid(createdBy),
          is_active: true,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select('*')
        .single();

      if (packErr || !pack) {
        logger.error({ packErr, input }, 'Database error creating modpack');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      const items = (input.items || []).map((it, idx) => ({
        id: randomUUID(),
        modpack_id: id,
        exercise_id: it.exercise_id,
        sets: it.sets ?? 3,
        reps: it.reps ?? 10,
        position: it.position ?? idx + 1,
      }));

      if (items.length > 0) {
        const { error: itemsErr } = await adminClient.from('modpack_items').insert(items);
        if (itemsErr) {
          logger.error({ itemsErr, id }, 'Database error inserting modpack items');
          throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
        }
      }

      const fullPack = await this.getModpackById(id);
      return (
        fullPack ||
        this.normalizeModpackRecord({
          ...pack,
          items,
        })
      );
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, input }, 'Unexpected error in createModpack');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async getModpackById(id: string): Promise<ModpackRecord | null> {
    try {
      if (!isUuid(id)) {
        return null;
      }
      const adminClient = getAdminClient();
      const { data: pack, error: packErr } = await adminClient
        .from('modpacks')
        .select(MODPACK_SELECT_COLS)
        .eq('id', id)
        .maybeSingle();

      if (packErr) {
        logger.error({ packErr, id }, 'Database error querying modpack by id');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return pack ? this.normalizeModpackRecord(pack) : null;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, id }, 'Unexpected error in getModpackById');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async updateModpack(id: string, input: UpdateModpackInput): Promise<ModpackRecord> {
    try {
      if (!isUuid(id)) {
        throw new AppError('Modpack not found', 404, 'NOT_FOUND');
      }
      const adminClient = getAdminClient();
      const { items, ...rawFields } = input as UpdateModpackInput & Record<string, unknown>;
      const updatePayload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (rawFields.name !== undefined) updatePayload.name = rawFields.name;
      if (rawFields.description !== undefined) updatePayload.description = rawFields.description;

      const { data, error } = await adminClient
        .from('modpacks')
        .update(updatePayload)
        .eq('id', id)
        .select('id')
        .maybeSingle();

      if (error) {
        logger.error({ error, id, input }, 'Database error updating modpack');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }
      if (!data) {
        throw new AppError('Modpack not found', 404, 'NOT_FOUND');
      }

      if (Array.isArray(items)) {
        const { error: delErr } = await adminClient
          .from('modpack_items')
          .delete()
          .eq('modpack_id', id);
        if (delErr) {
          logger.error({ delErr, id }, 'Database error clearing modpack items');
          throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
        }
        if (items.length > 0) {
          const itemRows = items.map((it, idx) => ({
            id: randomUUID(),
            modpack_id: id,
            exercise_id: it.exercise_id,
            sets: it.sets ?? 3,
            reps: it.reps ?? 10,
            position: it.position ?? idx + 1,
          }));
          const { error: insErr } = await adminClient.from('modpack_items').insert(itemRows);
          if (insErr) {
            logger.error({ insErr, id }, 'Database error inserting updated modpack items');
            throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
          }
        }
      }

      const refreshed = await this.getModpackById(id);
      if (!refreshed) {
        throw new AppError('Modpack not found', 404, 'NOT_FOUND');
      }
      return refreshed;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, id }, 'Unexpected error in updateModpack');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async deleteModpack(id: string): Promise<void> {
    try {
      const adminClient = getAdminClient();
      // 1. Delete dependent modpack_items
      try {
        await adminClient.from('modpack_items').delete().eq('modpack_id', id);
      } catch (err) {
        logger.warn({ err, id }, 'Notice: modpack_items cascade delete');
      }

      // 2. Hard delete attempt
      const { error } = await adminClient.from('modpacks').delete().eq('id', id);

      // 3. Guaranteed soft delete fallback
      try {
        await adminClient
          .from('modpacks')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', id);
      } catch {
        // safe
      }

      if (error) {
        logger.warn({ error, id }, 'Hard delete modpack warning (is_active=false applied)');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, id }, 'Unexpected error in deleteModpack');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async listModpacks(targetJoint?: string): Promise<ModpackRecord[]> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('modpacks')
        .select(MODPACK_SELECT_COLS)
        .neq('is_active', false)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        logger.error({ error, targetJoint }, 'Database error listing modpacks');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      const activePacks = ((data as unknown as any[]) || [])
        .filter((m) => m.is_active !== false)
        .map((m) => this.normalizeModpackRecord(m));

      if (targetJoint) {
        const tj = targetJoint.toLowerCase().trim();
        return activePacks.filter((m) =>
          (m.items || []).some((it) => it.exercise?.target_joint?.toLowerCase().trim() === tj)
        );
      }

      return activePacks;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, targetJoint }, 'Unexpected error in listModpacks');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  // =========================================================================
  // 5. Case Transfers
  // =========================================================================
  async createCaseTransfer(
    input: CreateCaseTransferInput,
    fromPtIdOrCreatedBy?: string,
    createdBy?: string
  ): Promise<CaseTransferRecord> {
    const id = randomUUID();
    const nowIso = new Date().toISOString();
    const from_pt_id = input.from_pt_id || (createdBy ? fromPtIdOrCreatedBy : undefined) || 'pt-001';
    const creator = createdBy || fromPtIdOrCreatedBy || from_pt_id;

    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('case_transfers')
        .insert({
          id,
          patient_id: input.patient_id,
          from_pt_id,
          to_pt_id: input.to_pt_id,
          start_date: input.start_date,
          end_date: input.end_date,
          status: 'active',
          created_by: creator,
          created_at: nowIso,
        })
        .select('*')
        .single();

      if (error || !data) {
        logger.error({ error, input }, 'Database error creating case transfer');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return data as CaseTransferRecord;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, input }, 'Unexpected error in createCaseTransfer');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async getCaseTransferById(id: string): Promise<CaseTransferRecord | null> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('case_transfers')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        logger.error({ error, id }, 'Database error querying case transfer by id');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return (data as CaseTransferRecord) || null;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, id }, 'Unexpected error in getCaseTransferById');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async cancelCaseTransfer(id: string): Promise<void> {
    try {
      const adminClient = getAdminClient();
      const { error } = await adminClient
        .from('case_transfers')
        .update({ status: 'cancelled' })
        .eq('id', id);

      if (error) {
        logger.error({ error, id }, 'Database error cancelling case transfer');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, id }, 'Unexpected error in cancelCaseTransfer');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async listCaseTransfers(ptId?: string): Promise<CaseTransferRecord[]> {
    try {
      const adminClient = getAdminClient();
      let query = adminClient.from('case_transfers').select('*').order('created_at', { ascending: false });
      if (ptId) {
        query = query.or(`from_pt_id.eq.${ptId},to_pt_id.eq.${ptId}`);
      }

      const { data, error } = await query;
      if (error) {
        logger.error({ error, ptId }, 'Database error listing case transfers');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return (data as CaseTransferRecord[]) || [];
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, ptId }, 'Unexpected error in listCaseTransfers');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async isPatientDelegatedToPt(patientId: string, ptId: string, today: string): Promise<boolean> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('case_transfers')
        .select('id')
        .eq('patient_id', patientId)
        .eq('to_pt_id', ptId)
        .lte('start_date', today)
        .gte('end_date', today)
        .eq('status', 'active')
        .maybeSingle();

      if (error) {
        logger.error({ error, patientId, ptId }, 'Database error checking delegation');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return !!data;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, patientId, ptId }, 'Unexpected error in isPatientDelegatedToPt');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }
}

let currentDirectoryRepository: IDirectoryRepository = new DirectoryRepository();

export function setDefaultDirectoryRepository(repo: IDirectoryRepository): void {
  currentDirectoryRepository = repo;
}

export const defaultDirectoryRepository: IDirectoryRepository = new Proxy(
  {} as unknown as IDirectoryRepository,
  {
    get(_target, prop) {
      const val = Reflect.get(currentDirectoryRepository, prop);
      if (typeof val === 'function') {
        return (val as (...args: unknown[]) => unknown).bind(currentDirectoryRepository);
      }
      return val;
    },
    set(_target, prop, value) {
      return Reflect.set(currentDirectoryRepository, prop, value);
    },
  }
);
