import { AppError } from '../../middleware/errorHandler';
import { UserSession } from '../../middleware/authenticate';
import { audit } from '../audit';
import { StaffProfileRecord } from '../staff/schema';
import { IDirectoryRepository, defaultDirectoryRepository } from './repository';
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

export class DirectoryService {
  constructor(private repo: IDirectoryRepository = defaultDirectoryRepository) {}

  public setRepository(repo: IDirectoryRepository): void {
    this.repo = repo;
  }

  // =========================================================================
  // 1. PTs Directory
  // =========================================================================
  async listActivePts(): Promise<StaffProfileRecord[]> {
    return this.repo.listActivePts();
  }

  // =========================================================================
  // 2. Exercises Catalog
  // =========================================================================
  async createExercise(
    input: CreateExerciseInput,
    currentUser: UserSession,
    clientIp?: string,
    clientDeviceId?: string
  ): Promise<ExerciseRecord> {
    const exercise = await this.repo.createExercise(input, currentUser.id);

    await audit.write({
      actor_type: 'staff',
      actor_id: currentUser.id,
      action: 'exercise_created',
      entity: 'exercises',
      entity_id: exercise.id,
      ip: clientIp || null,
      device_id: clientDeviceId || null,
      metadata: {
        title: exercise.title,
        difficulty: exercise.difficulty,
        target_joint: exercise.target_joint,
      },
    });

    return exercise;
  }

  async getExerciseById(id: string): Promise<ExerciseRecord> {
    const exercise = await this.repo.getExerciseById(id);
    if (!exercise) {
      throw new AppError(`Exercise ${id} not found`, 404, 'NOT_FOUND');
    }
    return exercise;
  }

  async listExercises(filter?: ExerciseQueryFilter): Promise<ExerciseRecord[]> {
    return this.repo.listExercises(filter);
  }

  async updateExercise(
    id: string,
    input: UpdateExerciseInput,
    currentUser: UserSession,
    clientIp?: string,
    clientDeviceId?: string
  ): Promise<ExerciseRecord> {
    const existing = await this.getExerciseById(id);

    // SPEC REQUIREMENT: PT can ONLY update exercises they created
    if (currentUser.role !== 'admin' && existing.created_by !== currentUser.id) {
      throw new AppError(
        'Access denied: Physiotherapists can only update exercises they personally created',
        403,
        'FORBIDDEN'
      );
    }

    const updated = await this.repo.updateExercise(id, input);

    await audit.write({
      actor_type: 'staff',
      actor_id: currentUser.id,
      action: 'exercise_updated',
      entity: 'exercises',
      entity_id: id,
      ip: clientIp || null,
      device_id: clientDeviceId || null,
      metadata: {
        title: updated.title,
        updated_fields: Object.keys(input),
      },
    });

    return updated;
  }

  async deleteExercise(
    id: string,
    currentUser: UserSession,
    clientIp?: string,
    clientDeviceId?: string
  ): Promise<void> {
    const existing = await this.getExerciseById(id);

    // SPEC REQUIREMENT: PT can ONLY delete exercises they created
    if (currentUser.role !== 'admin' && existing.created_by !== currentUser.id) {
      throw new AppError(
        'Access denied: Physiotherapists can only delete exercises they personally created',
        403,
        'FORBIDDEN'
      );
    }

    await this.repo.deleteExercise(id);

    await audit.write({
      actor_type: 'staff',
      actor_id: currentUser.id,
      action: 'exercise_deleted',
      entity: 'exercises',
      entity_id: id,
      ip: clientIp || null,
      device_id: clientDeviceId || null,
      metadata: {
        title: existing.title,
      },
    });
  }

  async uploadExerciseMedia(
    id: string,
    fileBuffer: Buffer,
    mimeType: string,
    extension: string,
    currentUser: UserSession,
    clientIp?: string,
    clientDeviceId?: string
  ): Promise<string> {
    const existing = await this.getExerciseById(id);

    if (currentUser.role !== 'admin' && existing.created_by !== currentUser.id) {
      throw new AppError(
        'Access denied: Physiotherapists can only update media for exercises they personally created',
        403,
        'FORBIDDEN'
      );
    }

    const mediaUrl = await this.repo.uploadExerciseMedia(id, fileBuffer, mimeType, extension);
    await this.repo.updateExercise(id, { image_path: mediaUrl });

    await audit.write({
      actor_type: 'staff',
      actor_id: currentUser.id,
      action: 'exercise_media_updated',
      entity: 'exercises',
      entity_id: id,
      ip: clientIp || null,
      device_id: clientDeviceId || null,
      metadata: { media_url: mediaUrl },
    });

    return mediaUrl;
  }

  // =========================================================================
  // 3. Minigames & Questions
  // =========================================================================
  async createMinigame(input: CreateMinigameInput, currentUser: UserSession): Promise<MinigameRecord> {
    if (currentUser.role !== 'admin') {
      throw new AppError('Access denied: requires admin role', 403, 'FORBIDDEN');
    }
    return this.repo.createMinigame(input, currentUser.id);
  }

  async listMinigames(): Promise<MinigameRecord[]> {
    return this.repo.listMinigames();
  }

  async getMinigameById(id: string): Promise<MinigameRecord> {
    const game = await this.repo.getMinigameById(id);
    if (!game) {
      throw new AppError(`Minigame ${id} not found`, 404, 'NOT_FOUND');
    }
    return game;
  }

  async createQuestion(
    minigameId: string,
    input: CreateMinigameQuestionInput,
    currentUser: UserSession
  ): Promise<MinigameQuestionRecord> {
    if (currentUser.role !== 'admin') {
      throw new AppError('Access denied: requires admin role', 403, 'FORBIDDEN');
    }
    await this.getMinigameById(minigameId);
    return this.repo.createQuestion(minigameId, input, currentUser.id);
  }

  async listQuestions(minigameId: string): Promise<MinigameQuestionRecord[]> {
    await this.getMinigameById(minigameId);
    return this.repo.listQuestionsByMinigame(minigameId);
  }

  async deleteQuestion(minigameId: string, questionId: string, currentUser: UserSession): Promise<void> {
    if (currentUser.role !== 'admin') {
      throw new AppError('Access denied: requires admin role', 403, 'FORBIDDEN');
    }
    await this.getMinigameById(minigameId);
    await this.repo.deleteQuestion(questionId);
  }

  // =========================================================================
  // 4. Modpacks (Curated Bundles)
  // =========================================================================
  async createModpack(
    input: CreateModpackInput,
    currentUser: UserSession,
    clientIp?: string,
    clientDeviceId?: string
  ): Promise<ModpackRecord> {
    // Validate each exercise exists
    for (const item of input.items) {
      await this.getExerciseById(item.exercise_id);
    }

    const modpack = await this.repo.createModpack(input, currentUser.id);

    await audit.write({
      actor_type: 'staff',
      actor_id: currentUser.id,
      action: 'modpack_created',
      entity: 'modpacks',
      entity_id: modpack.id,
      ip: clientIp || null,
      device_id: clientDeviceId || null,
      metadata: {
        name: modpack.name,
        item_count: modpack.items.length,
      },
    });

    return modpack;
  }

  async getModpackById(id: string): Promise<ModpackRecord> {
    const modpack = await this.repo.getModpackById(id);
    if (!modpack) {
      throw new AppError(`Modpack ${id} not found`, 404, 'NOT_FOUND');
    }
    return modpack;
  }

  async listModpacks(): Promise<ModpackRecord[]> {
    return this.repo.listModpacks();
  }

  async updateModpack(
    id: string,
    input: UpdateModpackInput,
    currentUser: UserSession,
    clientIp?: string,
    clientDeviceId?: string
  ): Promise<ModpackRecord> {
    const existing = await this.getModpackById(id);

    if (currentUser.role !== 'admin' && existing.created_by !== currentUser.id) {
      throw new AppError(
        'Access denied: Physiotherapists can only update modpacks they personally created',
        403,
        'FORBIDDEN'
      );
    }

    if (input.items) {
      for (const item of input.items) {
        await this.getExerciseById(item.exercise_id);
      }
    }

    const updated = await this.repo.updateModpack(id, input);

    await audit.write({
      actor_type: 'staff',
      actor_id: currentUser.id,
      action: 'modpack_updated',
      entity: 'modpacks',
      entity_id: id,
      ip: clientIp || null,
      device_id: clientDeviceId || null,
      metadata: {
        name: updated.name,
      },
    });

    return updated;
  }

  async deleteModpack(
    id: string,
    currentUser: UserSession,
    clientIp?: string,
    clientDeviceId?: string
  ): Promise<void> {
    const existing = await this.getModpackById(id);

    if (currentUser.role !== 'admin' && existing.created_by !== currentUser.id) {
      throw new AppError(
        'Access denied: Physiotherapists can only delete modpacks they personally created',
        403,
        'FORBIDDEN'
      );
    }

    await this.repo.deleteModpack(id);

    await audit.write({
      actor_type: 'staff',
      actor_id: currentUser.id,
      action: 'modpack_deleted',
      entity: 'modpacks',
      entity_id: id,
      ip: clientIp || null,
      device_id: clientDeviceId || null,
      metadata: {
        name: existing.name,
      },
    });
  }

  // =========================================================================
  // 5. Case Transfers (ฝากเคสชั่วคราว)
  // =========================================================================
  async createCaseTransfer(
    input: CreateCaseTransferInput,
    currentUser: UserSession,
    clientIp?: string,
    clientDeviceId?: string
  ): Promise<CaseTransferRecord> {
    const fromPtId = currentUser.role === 'admin' && input.from_pt_id ? input.from_pt_id : currentUser.id;

    if (fromPtId === input.to_pt_id) {
      throw new AppError('Cannot transfer a case to the same physiotherapist', 400, 'INVALID_TRANSFER');
    }

    const transfer = await this.repo.createCaseTransfer(input, fromPtId, currentUser.id);

    await audit.write({
      actor_type: 'staff',
      actor_id: currentUser.id,
      action: 'case_transfer_created',
      entity: 'case_transfers',
      entity_id: transfer.id,
      ip: clientIp || null,
      device_id: clientDeviceId || null,
      metadata: {
        patient_id: transfer.patient_id,
        from_pt_id: transfer.from_pt_id,
        to_pt_id: transfer.to_pt_id,
        start_date: transfer.start_date,
        end_date: transfer.end_date,
      },
    });

    return transfer;
  }

  async listCaseTransfers(currentUser: UserSession): Promise<CaseTransferRecord[]> {
    if (currentUser.role === 'admin') {
      return this.repo.listCaseTransfers();
    }
    return this.repo.listCaseTransfers(currentUser.id);
  }

  async cancelCaseTransfer(
    id: string,
    currentUser: UserSession,
    clientIp?: string,
    clientDeviceId?: string
  ): Promise<void> {
    const transfer = await this.repo.getCaseTransferById(id);
    if (!transfer) {
      throw new AppError(`Case transfer ${id} not found`, 404, 'NOT_FOUND');
    }

    if (currentUser.role !== 'admin' && transfer.from_pt_id !== currentUser.id) {
      throw new AppError(
        'Access denied: You can only cancel transfers you created',
        403,
        'FORBIDDEN'
      );
    }

    await this.repo.cancelCaseTransfer(id);

    await audit.write({
      actor_type: 'staff',
      actor_id: currentUser.id,
      action: 'case_transfer_cancelled',
      entity: 'case_transfers',
      entity_id: id,
      ip: clientIp || null,
      device_id: clientDeviceId || null,
      metadata: {
        patient_id: transfer.patient_id,
      },
    });
  }

  /**
   * Helper function: checks whether a destination PT has access to a patient on dateStr.
   * Master Prompt v3 Section 0 (Item 1):
   * "PT เห็น/แก้คนไข้: เฉพาะคนไข้ที่ตนรับผิดชอบ และเคสที่ได้รับฝากในช่วงวันที่ active"
   */
  async isPatientAccessibleByPt(patientId: string, ptId: string, dateStr: string): Promise<boolean> {
    return this.repo.isPatientDelegatedToPt(patientId, ptId, dateStr);
  }
}

export let defaultDirectoryService = new DirectoryService();

export function setDefaultDirectoryService(service: DirectoryService): void {
  defaultDirectoryService = service;
}
