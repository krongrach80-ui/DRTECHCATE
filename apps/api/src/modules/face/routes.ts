/**
 * apps/api/src/modules/face/routes.ts
 * Express Router for /api/face endpoints
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/requireRole';
import { csrfGuard } from '../../middleware/csrfGuard';
import {
  FaceEnrollmentController,
  defaultFaceEnrollmentController,
} from './controller';

export function createFaceRouter(
  controller: FaceEnrollmentController = defaultFaceEnrollmentController
): Router {
  const router = Router();

  // All /api/face operations require authenticated staff ('admin' or 'pt')
  router.use(authenticate);
  router.use(requireRole('admin', 'pt'));

  // 1. Staff Face Enrollment (Spec 7.3)
  router.post('/enroll', csrfGuard, controller.enrollStaff);

  // 2. PDPA Biometric Deletion (Spec 0.10, 5, 6.2)
  router.delete('/:patientId', csrfGuard, controller.deleteBiometrics);

  return router;
}

export const faceRoutes = createFaceRouter();
