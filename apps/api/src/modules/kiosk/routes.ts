import { Router } from 'express';
import { KioskController } from './controller';
import { pairKioskSchema, createPairCodeSchema } from './schema';
import { validateBody } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/requireRole';

export function createKioskRouter(controller = new KioskController()): Router {
  const router = Router();

  // POST /api/kiosk/pair (Device endpoint for redeeming pairing code)
  router.post('/pair', validateBody(pairKioskSchema), controller.pair);

  // POST /api/kiosk/pair-code (Admin-only: generate single-use 10-minute pairing code)
  router.post(
    '/pair-code',
    authenticate,
    requireRole('admin'),
    validateBody(createPairCodeSchema),
    controller.createPairCode
  );

  return router;
}

export const kioskRoutes = createKioskRouter();
