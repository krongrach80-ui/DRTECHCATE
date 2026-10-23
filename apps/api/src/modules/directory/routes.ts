import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/requireRole';
import { DirectoryController, defaultDirectoryController } from './controller';

const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for exercise photos / videos
});

export function createDirectoryRouter(
  controller: DirectoryController = defaultDirectoryController
): Router {
  const router = Router();

  /**
   * Directory & Reference Data Routes
   * Master Prompt v3 Section 5 (Line 155):
   * - GET /api/pts
   * - CRUD /api/exercises
   * - CRUD /api/minigames & questions
   * - CRUD /api/modpacks
   * - GET/POST /api/case-transfers
   */

  // 1. PTs Directory
  router.get('/pts', authenticate, controller.listPts);

  // 2. Exercises Catalog
  router.get('/exercises', authenticate, controller.listExercises);
  router.get('/exercises/:id', authenticate, controller.getExerciseById);
  router.post('/exercises', authenticate, controller.createExercise);
  router.patch('/exercises/:id', authenticate, controller.updateExercise);
  router.delete('/exercises/:id', authenticate, controller.deleteExercise);
  router.post('/exercises/:id/media', authenticate, mediaUpload.single('media'), controller.uploadExerciseMedia);

  // 3. Minigames & Questions
  router.get('/minigames', authenticate, controller.listMinigames);
  router.get('/minigames/:id', authenticate, controller.getMinigameById);
  router.post('/minigames', authenticate, requireRole('admin'), controller.createMinigame);
  router.get('/minigames/:id/questions', authenticate, controller.listQuestions);
  router.post('/minigames/:id/questions', authenticate, requireRole('admin'), controller.createQuestion);
  router.delete('/minigames/:id/questions/:questionId', authenticate, requireRole('admin'), controller.deleteQuestion);

  // 4. Modpacks
  router.get('/modpacks', authenticate, controller.listModpacks);
  router.get('/modpacks/:id', authenticate, controller.getModpackById);
  router.post('/modpacks', authenticate, controller.createModpack);
  router.patch('/modpacks/:id', authenticate, controller.updateModpack);
  router.delete('/modpacks/:id', authenticate, controller.deleteModpack);

  // 5. Case Transfers (ฝากเคสชั่วคราว)
  router.get('/case-transfers', authenticate, controller.listCaseTransfers);
  router.post('/case-transfers', authenticate, controller.createCaseTransfer);
  router.post('/case-transfers/:id/cancel', authenticate, controller.cancelCaseTransfer);
  router.delete('/case-transfers/:id', authenticate, controller.cancelCaseTransfer);

  return router;
}

export const directoryRoutes = createDirectoryRouter();
