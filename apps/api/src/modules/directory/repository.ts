import { randomUUID } from 'crypto';
import { getAdminClient } from '../../lib/supabase/adminClient';
import { StaffProfileRecord } from '../staff/schema';
import { StaffRepository, defaultStaffRepository } from '../staff/repository';
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
  ModpackItemRecord,
  CreateModpackInput,
  UpdateModpackInput,
  CaseTransferRecord,
  CreateCaseTransferInput,
} from './schema';

export class DirectoryRepository {
  private inMemoryExercises: Map<string, ExerciseRecord> = new Map();
  private inMemoryMinigames: Map<string, MinigameRecord> = new Map();
  private inMemoryQuestions: Map<string, MinigameQuestionRecord> = new Map();
  private inMemoryModpacks: Map<string, ModpackRecord> = new Map();
  private inMemoryTransfers: Map<string, CaseTransferRecord> = new Map();

  constructor(private staffRepo: StaffRepository = defaultStaffRepository) {}

  clearAllInMemory(): void {
    this.inMemoryExercises.clear();
    this.inMemoryMinigames.clear();
    this.inMemoryQuestions.clear();
    this.inMemoryModpacks.clear();
    this.inMemoryTransfers.clear();
  }

  // =========================================================================
  // 1. PTs Directory
  // =========================================================================
  async listActivePts(): Promise<StaffProfileRecord[]> {
    return this.staffRepo.listStaff({ role: 'pt', status: 'active' });
  }

  // =========================================================================
  // 2. Exercises Catalog
  // =========================================================================
  async createExercise(input: CreateExerciseInput, createdBy: string): Promise<ExerciseRecord> {
    const nowIso = new Date().toISOString();
    const record: ExerciseRecord = {
      id: randomUUID(),
      title: input.title,
      image_path: input.image_path || null,
      description: input.description || null,
      target_joint: input.target_joint || null,
      suitable_for: input.suitable_for || null,
      warnings: input.warnings || null,
      default_sets: input.default_sets ?? 3,
      default_reps: input.default_reps ?? 10,
      difficulty: input.difficulty ?? 'beginner',
      created_by: createdBy,
      is_active: true,
      created_at: nowIso,
      updated_at: nowIso,
    };

    this.inMemoryExercises.set(record.id, record);

    try {
      const adminClient = getAdminClient();
      await adminClient.from('exercises').insert({
        id: record.id,
        title: record.title,
        image_path: record.image_path,
        description: record.description,
        target_joint: record.target_joint,
        suitable_for: record.suitable_for,
        warnings: record.warnings,
        default_sets: record.default_sets,
        default_reps: record.default_reps,
        difficulty: record.difficulty,
        created_by: record.created_by,
        is_active: record.is_active,
        created_at: record.created_at,
        updated_at: record.updated_at,
      });
    } catch {
      // in-memory fallback
    }

    return record;
  }

  async getExerciseById(id: string): Promise<ExerciseRecord | null> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('exercises')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!error && data) {
        return data as ExerciseRecord;
      }
    } catch {
      // fallback
    }

    return this.inMemoryExercises.get(id) || null;
  }

  async listExercises(filter?: ExerciseQueryFilter): Promise<ExerciseRecord[]> {
    try {
      const adminClient = getAdminClient();
      let query = adminClient
        .from('exercises')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

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
      if (!error && data) {
        return data as ExerciseRecord[];
      }
    } catch {
      // fallback
    }

    let results = Array.from(this.inMemoryExercises.values()).filter((e) => e.is_active);
    if (filter?.target_joint) {
      results = results.filter((e) => e.target_joint === filter.target_joint);
    }
    if (filter?.difficulty) {
      results = results.filter((e) => e.difficulty === filter.difficulty);
    }
    if (filter?.search) {
      const s = filter.search.toLowerCase();
      results = results.filter((e) => e.title.toLowerCase().includes(s));
    }

    return results;
  }

  async updateExercise(id: string, updates: UpdateExerciseInput): Promise<ExerciseRecord> {
    const existing = await this.getExerciseById(id);
    if (!existing) {
      throw new Error(`Exercise ${id} not found`);
    }

    const updated: ExerciseRecord = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    this.inMemoryExercises.set(id, updated);

    try {
      const adminClient = getAdminClient();
      await adminClient.from('exercises').update(updates).eq('id', id);
    } catch {
      // fallback
    }

    return updated;
  }

  async deleteExercise(id: string): Promise<boolean> {
    try {
      const adminClient = getAdminClient();
      const { error } = await adminClient.from('exercises').delete().eq('id', id);
      if (!error) {
        this.inMemoryExercises.delete(id);
        return true;
      }
    } catch {
      // fallback
    }

    const had = this.inMemoryExercises.has(id);
    this.inMemoryExercises.delete(id);
    return had;
  }

  async uploadExerciseMedia(
    exerciseId: string,
    fileBuffer: Buffer,
    mimeType: string,
    extension: string
  ): Promise<string> {
    const filePath = `${exerciseId}/media_${Date.now()}.${extension}`;
    try {
      const adminClient = getAdminClient();
      const { error } = await adminClient.storage
        .from('exercise-media')
        .upload(filePath, fileBuffer, {
          contentType: mimeType,
          upsert: true,
        });

      if (!error) {
        const { data } = await adminClient.storage
          .from('exercise-media')
          .createSignedUrl(filePath, 3600 * 24);
        if (data?.signedUrl) {
          return data.signedUrl;
        }
      }
    } catch {
      // fallback
    }

    return `/storage/exercise-media/${filePath}`;
  }

  // =========================================================================
  // 3. Minigames & Questions
  // =========================================================================
  async createMinigame(input: CreateMinigameInput, createdBy: string): Promise<MinigameRecord> {
    const nowIso = new Date().toISOString();
    const record: MinigameRecord = {
      id: randomUUID(),
      title: input.title,
      description: input.description || null,
      category: input.category || null,
      is_active: true,
      created_by: createdBy,
      created_at: nowIso,
      updated_at: nowIso,
    };

    this.inMemoryMinigames.set(record.id, record);

    try {
      const adminClient = getAdminClient();
      await adminClient.from('minigames').insert(record);
    } catch {
      // fallback
    }

    return record;
  }

  async listMinigames(): Promise<MinigameRecord[]> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('minigames')
        .select('*')
        .eq('is_active', true)
        .order('title', { ascending: true });

      if (!error && data) {
        return data as MinigameRecord[];
      }
    } catch {
      // fallback
    }

    return Array.from(this.inMemoryMinigames.values()).filter((m) => m.is_active);
  }

  async getMinigameById(id: string): Promise<MinigameRecord | null> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('minigames')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!error && data) {
        return data as MinigameRecord;
      }
    } catch {
      // fallback
    }

    return this.inMemoryMinigames.get(id) || null;
  }

  async createQuestion(
    minigameId: string,
    input: CreateMinigameQuestionInput,
    createdBy: string
  ): Promise<MinigameQuestionRecord> {
    const record: MinigameQuestionRecord = {
      id: randomUUID(),
      minigame_id: minigameId,
      prompt: input.prompt,
      choices: input.choices,
      answer: input.answer,
      created_by: createdBy,
      created_at: new Date().toISOString(),
    };

    this.inMemoryQuestions.set(record.id, record);

    try {
      const adminClient = getAdminClient();
      await adminClient.from('minigame_questions').insert(record);
    } catch {
      // fallback
    }

    return record;
  }

  async listQuestionsByMinigame(minigameId: string): Promise<MinigameQuestionRecord[]> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('minigame_questions')
        .select('*')
        .eq('minigame_id', minigameId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        return data as MinigameQuestionRecord[];
      }
    } catch {
      // fallback
    }

    return Array.from(this.inMemoryQuestions.values()).filter(
      (q) => q.minigame_id === minigameId
    );
  }

  async deleteQuestion(questionId: string): Promise<boolean> {
    try {
      const adminClient = getAdminClient();
      const { error } = await adminClient.from('minigame_questions').delete().eq('id', questionId);
      if (!error) {
        this.inMemoryQuestions.delete(questionId);
        return true;
      }
    } catch {
      // fallback
    }

    const had = this.inMemoryQuestions.has(questionId);
    this.inMemoryQuestions.delete(questionId);
    return had;
  }

  // =========================================================================
  // 4. Modpacks (Curated Bundles)
  // =========================================================================
  async createModpack(input: CreateModpackInput, createdBy: string): Promise<ModpackRecord> {
    const modpackId = randomUUID();
    const nowIso = new Date().toISOString();

    const items: ModpackItemRecord[] = input.items.map((item) => ({
      id: randomUUID(),
      modpack_id: modpackId,
      exercise_id: item.exercise_id,
      sets: item.sets,
      reps: item.reps,
      position: item.position,
      exercise: this.inMemoryExercises.get(item.exercise_id) || null,
    }));

    const modpack: ModpackRecord = {
      id: modpackId,
      name: input.name,
      description: input.description || null,
      created_by: createdBy,
      created_at: nowIso,
      updated_at: nowIso,
      items,
    };

    this.inMemoryModpacks.set(modpackId, modpack);

    try {
      const adminClient = getAdminClient();
      await adminClient.from('modpacks').insert({
        id: modpack.id,
        name: modpack.name,
        description: modpack.description,
        created_by: modpack.created_by,
        created_at: modpack.created_at,
        updated_at: modpack.updated_at,
      });

      const dbItems = items.map((i) => ({
        id: i.id,
        modpack_id: i.modpack_id,
        exercise_id: i.exercise_id,
        sets: i.sets,
        reps: i.reps,
        position: i.position,
      }));

      await adminClient.from('modpack_items').insert(dbItems);
    } catch {
      // fallback
    }

    return modpack;
  }

  async getModpackById(id: string): Promise<ModpackRecord | null> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('modpacks')
        .select('*, modpack_items(*, exercises(*))')
        .eq('id', id)
        .maybeSingle();

      if (!error && data) {
        return {
          id: data.id,
          name: data.name,
          description: data.description,
          created_by: data.created_by,
          created_at: data.created_at,
          updated_at: data.updated_at,
          items: Array.isArray(data.modpack_items)
            ? data.modpack_items.map((i: Record<string, unknown>) => ({
                id: String(i.id),
                modpack_id: String(i.modpack_id),
                exercise_id: String(i.exercise_id),
                sets: Number(i.sets),
                reps: Number(i.reps),
                position: Number(i.position),
                exercise: i.exercises as ExerciseRecord | null,
              }))
            : [],
        };
      }
    } catch {
      // fallback
    }

    return this.inMemoryModpacks.get(id) || null;
  }

  async listModpacks(): Promise<ModpackRecord[]> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('modpacks')
        .select('*, modpack_items(*, exercises(*))')
        .order('name', { ascending: true });

      if (!error && data) {
        return data.map((d) => ({
          id: d.id,
          name: d.name,
          description: d.description,
          created_by: d.created_by,
          created_at: d.created_at,
          updated_at: d.updated_at,
          items: Array.isArray(d.modpack_items)
            ? d.modpack_items.map((i: Record<string, unknown>) => ({
                id: String(i.id),
                modpack_id: String(i.modpack_id),
                exercise_id: String(i.exercise_id),
                sets: Number(i.sets),
                reps: Number(i.reps),
                position: Number(i.position),
                exercise: i.exercises as ExerciseRecord | null,
              }))
            : [],
        }));
      }
    } catch {
      // fallback
    }

    return Array.from(this.inMemoryModpacks.values());
  }

  async updateModpack(id: string, updates: UpdateModpackInput): Promise<ModpackRecord> {
    const existing = await this.getModpackById(id);
    if (!existing) {
      throw new Error(`Modpack ${id} not found`);
    }

    let items = existing.items;
    if (updates.items) {
      items = updates.items.map((item) => ({
        id: randomUUID(),
        modpack_id: id,
        exercise_id: item.exercise_id,
        sets: item.sets,
        reps: item.reps,
        position: item.position,
        exercise: this.inMemoryExercises.get(item.exercise_id) || null,
      }));
    }

    const updated: ModpackRecord = {
      ...existing,
      name: updates.name ?? existing.name,
      description: updates.description !== undefined ? updates.description : existing.description,
      items,
      updated_at: new Date().toISOString(),
    };

    this.inMemoryModpacks.set(id, updated);

    try {
      const adminClient = getAdminClient();
      await adminClient
        .from('modpacks')
        .update({
          name: updated.name,
          description: updated.description,
          updated_at: updated.updated_at,
        })
        .eq('id', id);

      if (updates.items) {
        await adminClient.from('modpack_items').delete().eq('modpack_id', id);
        const dbItems = items.map((i) => ({
          id: i.id,
          modpack_id: i.modpack_id,
          exercise_id: i.exercise_id,
          sets: i.sets,
          reps: i.reps,
          position: i.position,
        }));
        await adminClient.from('modpack_items').insert(dbItems);
      }
    } catch {
      // fallback
    }

    return updated;
  }

  async deleteModpack(id: string): Promise<boolean> {
    try {
      const adminClient = getAdminClient();
      const { error } = await adminClient.from('modpacks').delete().eq('id', id);
      if (!error) {
        this.inMemoryModpacks.delete(id);
        return true;
      }
    } catch {
      // fallback
    }

    const had = this.inMemoryModpacks.has(id);
    this.inMemoryModpacks.delete(id);
    return had;
  }

  // =========================================================================
  // 5. Case Transfers (ฝากเคสชั่วคราว)
  // =========================================================================
  async createCaseTransfer(
    input: CreateCaseTransferInput,
    fromPtId: string,
    createdBy: string
  ): Promise<CaseTransferRecord> {
    const record: CaseTransferRecord = {
      id: randomUUID(),
      patient_id: input.patient_id,
      from_pt_id: input.from_pt_id || fromPtId,
      to_pt_id: input.to_pt_id,
      start_date: input.start_date,
      end_date: input.end_date,
      created_by: createdBy,
      status: 'active',
      created_at: new Date().toISOString(),
    };

    this.inMemoryTransfers.set(record.id, record);

    try {
      const adminClient = getAdminClient();
      await adminClient.from('case_transfers').insert(record);
    } catch {
      // fallback
    }

    return record;
  }

  async listCaseTransfers(ptId?: string): Promise<CaseTransferRecord[]> {
    try {
      const adminClient = getAdminClient();
      let query = adminClient.from('case_transfers').select('*').order('created_at', { ascending: false });

      if (ptId) {
        query = query.or(`from_pt_id.eq.${ptId},to_pt_id.eq.${ptId}`);
      }

      const { data, error } = await query;
      if (!error && data) {
        return data as CaseTransferRecord[];
      }
    } catch {
      // fallback
    }

    let results = Array.from(this.inMemoryTransfers.values());
    if (ptId) {
      results = results.filter((t) => t.from_pt_id === ptId || t.to_pt_id === ptId);
    }
    return results;
  }

  async getCaseTransferById(id: string): Promise<CaseTransferRecord | null> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('case_transfers')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!error && data) {
        return data as CaseTransferRecord;
      }
    } catch {
      // fallback
    }

    return this.inMemoryTransfers.get(id) || null;
  }

  async cancelCaseTransfer(id: string): Promise<void> {
    const existing = await this.getCaseTransferById(id);
    if (!existing) {
      throw new Error(`Case transfer ${id} not found`);
    }

    const updated: CaseTransferRecord = {
      ...existing,
      status: 'cancelled',
    };
    this.inMemoryTransfers.set(id, updated);

    try {
      const adminClient = getAdminClient();
      await adminClient.from('case_transfers').update({ status: 'cancelled' }).eq('id', id);
    } catch {
      // fallback
    }
  }

  /**
   * Helper function to check if a patient is delegated to a given PT on a target date.
   */
  async isPatientDelegatedToPt(patientId: string, ptId: string, dateStr: string): Promise<boolean> {
    const targetDate = new Date(dateStr).getTime();

    // Check DB
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('case_transfers')
        .select('*')
        .eq('patient_id', patientId)
        .eq('to_pt_id', ptId)
        .eq('status', 'active')
        .lte('start_date', dateStr)
        .gte('end_date', dateStr);

      if (!error && data && data.length > 0) {
        return true;
      }
    } catch {
      // fallback
    }

    // Check in-memory
    for (const t of this.inMemoryTransfers.values()) {
      if (
        t.patient_id === patientId &&
        t.to_pt_id === ptId &&
        t.status === 'active'
      ) {
        const start = new Date(t.start_date).getTime();
        const end = new Date(t.end_date).getTime();
        if (targetDate >= start && targetDate <= end) {
          return true;
        }
      }
    }

    return false;
  }
}

export const defaultDirectoryRepository = new DirectoryRepository();
