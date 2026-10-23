/**
 * apps/api/src/modules/records/routes.ts
 * Express router for Clinical Records (Medical Notes & Treatment Results)
 * Conforms to Master Prompt v3 System 9.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/requireRole';
import { csrfGuard } from '../../middleware/csrfGuard';
import { validateBody } from '../../middleware/validate';
import { RecordsController, defaultRecordsController } from './controller';
import { createMedicalNoteSchema, createTreatmentResultSchema } from './schema';

export function createRecordsRouter(controller: RecordsController = defaultRecordsController): Router {
  const router = Router();

  // Route-specific auth guard for clinical records
  const authGuard = [authenticate, requireRole('admin', 'pt')];

  // =========================================================================
  // 1. MEDICAL NOTES (GET/POST only, No UPDATE/DELETE)
  // =========================================================================
  router.get('/patients/:id/notes', ...authGuard, controller.getNotes);
  router.post(
    '/patients/:id/notes',
    ...authGuard,
    csrfGuard,
    validateBody(createMedicalNoteSchema),
    controller.createNote
  );

  // Prohibit modification & deletion routes
  router.put('/patients/:id/notes', ...authGuard, controller.rejectModification);
  router.patch('/patients/:id/notes', ...authGuard, controller.rejectModification);
  router.delete('/patients/:id/notes', ...authGuard, controller.rejectModification);
  router.delete('/patients/:id/notes/:noteId', ...authGuard, controller.rejectModification);

  // =========================================================================
  // 2. TREATMENT RESULTS (GET/POST only, Versioned, No UPDATE/DELETE)
  // =========================================================================
  router.get('/patients/:id/treatment-results', ...authGuard, controller.getTreatmentResults);
  router.post(
    '/patients/:id/treatment-results',
    ...authGuard,
    csrfGuard,
    validateBody(createTreatmentResultSchema),
    controller.createTreatmentResult
  );

  // Prohibit modification & deletion routes
  router.put('/patients/:id/treatment-results', ...authGuard, controller.rejectModification);
  router.patch('/patients/:id/treatment-results', ...authGuard, controller.rejectModification);
  router.delete('/patients/:id/treatment-results', ...authGuard, controller.rejectModification);
  router.delete('/patients/:id/treatment-results/:resultId', ...authGuard, controller.rejectModification);

  return router;
}

export const recordsRoutes = createRecordsRouter();
