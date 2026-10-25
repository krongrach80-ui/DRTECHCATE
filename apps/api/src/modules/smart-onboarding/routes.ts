/**
 * apps/api/src/modules/smart-onboarding/routes.ts
 * Isolated Smart Onboarding Router
 * Master Prompt v4: Sovereign Isolated Medical-Grade Architecture
 */

import { Router } from 'express';
import {
  SmartOnboardingController,
  defaultSmartOnboardingController,
} from './controller';

export function createSmartOnboardingRouter(
  controller: SmartOnboardingController = defaultSmartOnboardingController
): Router {
  const router = Router();

  // 1. Biometric Presence Scan & Login
  router.post('/scan-login', controller.scanLogin);

  // 2. Face-First Account Creation (Pending Info)
  router.post('/create-pending', controller.createPending);

  // 3. Dual-Channel Personal Info Completion (First-Finisher Wins)
  router.post('/complete-info', controller.completeInfo);

  // 4. Pending Patients Queue for Staff/Admin
  router.get('/pending-patients', controller.listPending);

  // 5. 3-Step Wizard Therapy Schedule
  router.post('/schedule', controller.saveSchedule);

  // 6. Patient Kiosk Dynamic Daily Plan (Asia/Bangkok)
  router.get('/daily-plan/:patientId', controller.getDailyPlan);

  // 7. Save Rehab Scores & Checklists
  router.post('/rehab-score', controller.saveRehabScore);

  // 8. Permanent Deletion (DB + Disk Vault) & Dossier Fetching
  router.delete('/patient/:patientId', controller.deletePatient);
  router.get('/patient/:patientId/dossier', controller.getDossier);
  router.get('/patient/:patientId', controller.getDossier);
  router.get('/dossiers', controller.listDossiers);

  // 9. Central Exercise Library
  router.get('/exercises', controller.getExercises);
  router.post('/exercises', controller.saveExercise);

  // 10. Modpacks / Presets
  router.get('/modpacks', controller.getModpacks);
  router.post('/modpacks', controller.saveModpack);

  return router;
}

export const smartOnboardingRoutes = createSmartOnboardingRouter();
