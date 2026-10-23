import { Router } from 'express';
import { KioskController } from './controller';
import { KioskFaceAuthController } from './faceAuth.controller';
import {
  pairKioskSchema,
  createPairCodeSchema,
  ChallengeRequestSchema,
  VerifyFaceSchema,
  ConfirmIdentitySchema,
  KioskMissionStepSchema,
  KioskFinishMissionSchema,
} from './schema';
import { validateBody } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/requireRole';

export function createKioskRouter(
  deviceController = new KioskController(),
  faceAuthController = new KioskFaceAuthController()
): Router {
  const router = Router();

  // =========================================================================
  // SYSTEM 4: KIOSK DEVICE PAIRING
  // =========================================================================

  // POST /api/kiosk/pair (Device endpoint for redeeming pairing code)
  router.post('/pair', validateBody(pairKioskSchema), deviceController.pair);

  // POST /api/kiosk/pair-code (Admin-only: generate single-use 10-minute pairing code)
  router.post(
    '/pair-code',
    authenticate,
    requireRole('admin'),
    validateBody(createPairCodeSchema),
    deviceController.createPairCode
  );

  // GET /api/kiosk/devices (Admin-only: list all kiosk devices)
  router.get('/devices', authenticate, requireRole('admin'), deviceController.listDevices);

  // POST /api/kiosk/devices (Admin-only: register a new kiosk terminal)
  router.post('/devices', authenticate, requireRole('admin'), deviceController.createDevice);

  // GET /api/kiosk/staff-calls (Staff: view active and recent staff calls)
  router.get('/staff-calls', authenticate, deviceController.listStaffCalls);

  // POST /api/kiosk/staff-calls/:id/handle (Staff: mark a call as resolved)
  router.post('/staff-calls/:id/handle', authenticate, deviceController.handleStaffCall);


  // =========================================================================
  // SYSTEM 7: KIOSK FACE AUTHENTICATION & CHALLENGE
  // =========================================================================

  // POST /api/kiosk/challenge (Request single-use nonce & 2 gesture challenge)
  router.post(
    '/challenge',
    validateBody(ChallengeRequestSchema),
    faceAuthController.challenge
  );

  // POST /api/kiosk/verify (Submit 512-dim probe vector for dual-criteria match)
  router.post(
    '/verify',
    validateBody(VerifyFaceSchema),
    faceAuthController.verify
  );

  // POST /api/kiosk/verify-face (Client library alias)
  router.post(
    '/verify-face',
    validateBody(VerifyFaceSchema),
    faceAuthController.verify
  );

  // POST /api/kiosk/confirm-identity (Confirm or reject identity on kiosk)
  router.post(
    '/confirm-identity',
    validateBody(ConfirmIdentitySchema),
    faceAuthController.confirmIdentity
  );

  // POST /api/kiosk/call-staff (Manual staff call trigger)
  router.post(
    '/call-staff',
    faceAuthController.callStaff
  );

  // =========================================================================
  // SYSTEM 14: DAILY MISSION WORKFLOWS
  // =========================================================================

  // GET /api/kiosk/plan (Retrieve today's prescribed exercises & minigame)
  router.get('/plan', deviceController.getPlan);

  // POST /api/kiosk/mission/steps (Record individual exercise or minigame completion)
  router.post(
    '/mission/steps',
    validateBody(KioskMissionStepSchema),
    deviceController.recordStep
  );

  // POST /api/kiosk/finish (Finish mission, record pain VAS rating & notes)
  router.post(
    '/finish',
    validateBody(KioskFinishMissionSchema),
    deviceController.finishMission
  );

  return router;
}

export const kioskRoutes = createKioskRouter();
