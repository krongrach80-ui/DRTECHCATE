import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../middleware/errorHandler';
import { DirectoryService, defaultDirectoryService } from './service';
import {
  CreateExerciseSchema,
  UpdateExerciseSchema,
  ExerciseQuerySchema,
  CreateMinigameSchema,
  CreateMinigameQuestionSchema,
  CreateModpackSchema,
  UpdateModpackSchema,
  CreateCaseTransferSchema,
} from './schema';

export class DirectoryController {
  constructor(private directoryService: DirectoryService = defaultDirectoryService) {}

  // =========================================================================
  // 1. PTs Directory
  // =========================================================================
  listPts = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const pts = await this.directoryService.listActivePts();
      res.status(200).json({
        ok: true,
        data: pts,
      });
    } catch (err) {
      next(err);
    }
  };

  // =========================================================================
  // 2. Exercises Catalog
  // =========================================================================
  listExercises = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filter = ExerciseQuerySchema.parse(req.query);
      const exercises = await this.directoryService.listExercises(filter);
      res.status(200).json({
        ok: true,
        data: exercises,
      });
    } catch (err) {
      next(err);
    }
  };

  getExerciseById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) throw new AppError('Exercise ID is required', 400, 'BAD_REQUEST');

      const exercise = await this.directoryService.getExerciseById(id);
      res.status(200).json({
        ok: true,
        data: exercise,
      });
    } catch (err) {
      next(err);
    }
  };

  createExercise = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');

      const input = CreateExerciseSchema.parse(req.body);
      const clientIp = (req.ip || req.socket.remoteAddress || '127.0.0.1').replace(/^.*:/, '');
      const clientDeviceId = req.cookies?.staff_device_id;

      const exercise = await this.directoryService.createExercise(
        input,
        req.user,
        clientIp,
        clientDeviceId
      );

      res.status(201).json({
        ok: true,
        data: exercise,
      });
    } catch (err) {
      next(err);
    }
  };

  updateExercise = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) throw new AppError('Exercise ID is required', 400, 'BAD_REQUEST');

      const input = UpdateExerciseSchema.parse(req.body);
      const clientIp = (req.ip || req.socket.remoteAddress || '127.0.0.1').replace(/^.*:/, '');
      const clientDeviceId = req.cookies?.staff_device_id;

      const updated = await this.directoryService.updateExercise(
        id,
        input,
        req.user,
        clientIp,
        clientDeviceId
      );

      res.status(200).json({
        ok: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  };

  deleteExercise = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) throw new AppError('Exercise ID is required', 400, 'BAD_REQUEST');

      const clientIp = (req.ip || req.socket.remoteAddress || '127.0.0.1').replace(/^.*:/, '');
      const clientDeviceId = req.cookies?.staff_device_id;

      await this.directoryService.deleteExercise(id, req.user, clientIp, clientDeviceId);

      res.status(200).json({
        ok: true,
        message: 'Exercise deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  };

  uploadExerciseMedia = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) throw new AppError('Exercise ID is required', 400, 'BAD_REQUEST');

      if (!req.file) throw new AppError('No media file uploaded', 400, 'FILE_MISSING');

      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'];
      if (!allowedMimes.includes(req.file.mimetype)) {
        throw new AppError('File must be an image (JPEG, PNG, WebP) or video (MP4, WebM)', 400, 'INVALID_FILE_TYPE');
      }

      const extension = req.file.mimetype.split('/')[1] || 'jpg';
      const clientIp = (req.ip || req.socket.remoteAddress || '127.0.0.1').replace(/^.*:/, '');
      const clientDeviceId = req.cookies?.staff_device_id;

      const mediaUrl = await this.directoryService.uploadExerciseMedia(
        id,
        req.file.buffer,
        req.file.mimetype,
        extension,
        req.user,
        clientIp,
        clientDeviceId
      );

      res.status(200).json({
        ok: true,
        media_url: mediaUrl,
      });
    } catch (err) {
      next(err);
    }
  };

  // =========================================================================
  // 3. Minigames & Questions
  // =========================================================================
  listMinigames = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const minigames = await this.directoryService.listMinigames();
      res.status(200).json({
        ok: true,
        data: minigames,
      });
    } catch (err) {
      next(err);
    }
  };

  getMinigameById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) throw new AppError('Minigame ID is required', 400, 'BAD_REQUEST');

      const game = await this.directoryService.getMinigameById(id);
      res.status(200).json({
        ok: true,
        data: game,
      });
    } catch (err) {
      next(err);
    }
  };

  createMinigame = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');

      const input = CreateMinigameSchema.parse(req.body);
      const minigame = await this.directoryService.createMinigame(input, req.user);

      res.status(201).json({
        ok: true,
        data: minigame,
      });
    } catch (err) {
      next(err);
    }
  };

  listQuestions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const minigameId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!minigameId) throw new AppError('Minigame ID is required', 400, 'BAD_REQUEST');

      const questions = await this.directoryService.listQuestions(minigameId);
      res.status(200).json({
        ok: true,
        data: questions,
      });
    } catch (err) {
      next(err);
    }
  };

  createQuestion = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');

      const minigameId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!minigameId) throw new AppError('Minigame ID is required', 400, 'BAD_REQUEST');

      const input = CreateMinigameQuestionSchema.parse(req.body);
      const question = await this.directoryService.createQuestion(minigameId, input, req.user);

      res.status(201).json({
        ok: true,
        data: question,
      });
    } catch (err) {
      next(err);
    }
  };

  deleteQuestion = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');

      const minigameId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const questionId = Array.isArray(req.params.questionId) ? req.params.questionId[0] : req.params.questionId;
      if (!minigameId || !questionId) throw new AppError('IDs are required', 400, 'BAD_REQUEST');

      await this.directoryService.deleteQuestion(minigameId, questionId, req.user);

      res.status(200).json({
        ok: true,
        message: 'Question deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  };

  // =========================================================================
  // 4. Modpacks
  // =========================================================================
  listModpacks = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const modpacks = await this.directoryService.listModpacks();
      res.status(200).json({
        ok: true,
        data: modpacks,
      });
    } catch (err) {
      next(err);
    }
  };

  getModpackById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) throw new AppError('Modpack ID is required', 400, 'BAD_REQUEST');

      const modpack = await this.directoryService.getModpackById(id);
      res.status(200).json({
        ok: true,
        data: modpack,
      });
    } catch (err) {
      next(err);
    }
  };

  createModpack = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');

      const input = CreateModpackSchema.parse(req.body);
      const clientIp = (req.ip || req.socket.remoteAddress || '127.0.0.1').replace(/^.*:/, '');
      const clientDeviceId = req.cookies?.staff_device_id;

      const modpack = await this.directoryService.createModpack(
        input,
        req.user,
        clientIp,
        clientDeviceId
      );

      res.status(201).json({
        ok: true,
        data: modpack,
      });
    } catch (err) {
      next(err);
    }
  };

  updateModpack = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) throw new AppError('Modpack ID is required', 400, 'BAD_REQUEST');

      const input = UpdateModpackSchema.parse(req.body);
      const clientIp = (req.ip || req.socket.remoteAddress || '127.0.0.1').replace(/^.*:/, '');
      const clientDeviceId = req.cookies?.staff_device_id;

      const updated = await this.directoryService.updateModpack(
        id,
        input,
        req.user,
        clientIp,
        clientDeviceId
      );

      res.status(200).json({
        ok: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  };

  deleteModpack = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) throw new AppError('Modpack ID is required', 400, 'BAD_REQUEST');

      const clientIp = (req.ip || req.socket.remoteAddress || '127.0.0.1').replace(/^.*:/, '');
      const clientDeviceId = req.cookies?.staff_device_id;

      await this.directoryService.deleteModpack(id, req.user, clientIp, clientDeviceId);

      res.status(200).json({
        ok: true,
        message: 'Modpack deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  };

  // =========================================================================
  // 5. Case Transfers
  // =========================================================================
  createCaseTransfer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');

      const input = CreateCaseTransferSchema.parse(req.body);
      const clientIp = (req.ip || req.socket.remoteAddress || '127.0.0.1').replace(/^.*:/, '');
      const clientDeviceId = req.cookies?.staff_device_id;

      const transfer = await this.directoryService.createCaseTransfer(
        input,
        req.user,
        clientIp,
        clientDeviceId
      );

      res.status(201).json({
        ok: true,
        data: transfer,
      });
    } catch (err) {
      next(err);
    }
  };

  listCaseTransfers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');

      const transfers = await this.directoryService.listCaseTransfers(req.user);

      res.status(200).json({
        ok: true,
        data: transfers,
      });
    } catch (err) {
      next(err);
    }
  };

  cancelCaseTransfer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) throw new AppError('Transfer ID is required', 400, 'BAD_REQUEST');

      const clientIp = (req.ip || req.socket.remoteAddress || '127.0.0.1').replace(/^.*:/, '');
      const clientDeviceId = req.cookies?.staff_device_id;

      await this.directoryService.cancelCaseTransfer(id, req.user, clientIp, clientDeviceId);

      res.status(200).json({
        ok: true,
        message: 'Case transfer cancelled successfully',
      });
    } catch (err) {
      next(err);
    }
  };
}

export const defaultDirectoryController = new DirectoryController();
