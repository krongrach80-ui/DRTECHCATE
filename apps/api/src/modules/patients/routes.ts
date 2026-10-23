import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/requireRole';
import { csrfGuard } from '../../middleware/csrfGuard';
import { PatientController, defaultPatientController } from './controller';

export function createPatientsRouter(controller: PatientController = defaultPatientController): Router {
  const router = Router();

  // All patient operations require authenticated staff ('admin' or 'pt')
  router.use(authenticate);
  router.use(requireRole('admin', 'pt'));

  // 1. Patient List & Search (with Thai search, phone normalization, pagination)
  router.get('/', controller.listPatients);

  // 2. Create Patient (creates status 'awaiting_face', issues HN from sequence)
  router.post('/', csrfGuard, controller.createPatient);

  // 3. Patient Details
  router.get('/:id', controller.getPatientById);

  // 4. Update Patient (Optimistic locking with version)
  router.patch('/:id', csrfGuard, controller.updatePatient);

  // 5. Send to Kiosk (10-minute enrollment ticket + SSE)
  router.post('/:id/send-to-kiosk', csrfGuard, controller.sendToKiosk);

  // 6. Counter Check-In (Prunes candidate pool for today's facial verification)
  router.post('/:id/checkin', csrfGuard, controller.checkin);

  // 7. Soft-Archive Patient
  router.post('/:id/archive', csrfGuard, controller.archivePatient);

  // 8. PDPA Biometric Deletion (/api/patients/:id/face)
  router.delete('/:id/face', csrfGuard, controller.deleteBiometrics);

  return router;
}

export function createFaceRouter(controller: PatientController = defaultPatientController): Router {
  const router = Router();
  router.use(authenticate);
  router.use(requireRole('admin', 'pt'));

  // Master Prompt v3 Line 324: DELETE /api/face/:patientId
  router.delete('/:patientId', csrfGuard, controller.deleteBiometrics);

  return router;
}
