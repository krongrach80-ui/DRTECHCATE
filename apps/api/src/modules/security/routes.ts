import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/requireRole';
import { AuthController } from '../auth/controller';
import { SecurityController } from './controller';

/**
 * Security & Session Revocation / Bans Router
 * Master Prompt v3 Section 5 (Line 160) & Section 10 (Line 307-308):
 * - POST /api/security/force-logout/:id (admin only, PT gets 403)
 * - POST /api/security/bans (admin only, PT gets 403)
 * - GET /api/security/bans (admin only, PT gets 403)
 * - DELETE /api/security/bans/:id (admin only, PT gets 403)
 */
export function createSecurityRouter(
  authController = new AuthController(),
  securityController = new SecurityController()
): Router {
  const router = Router();

  // Force-logout endpoint (admin only)
  router.post(
    ['/force-logout/:id', '/force-logout'],
    authenticate,
    requireRole('admin'),
    (req: Request, res: Response, next: NextFunction) => {
      if (req.params.id && !req.params.userId) {
        req.params.userId = req.params.id;
      }
      return authController.forceLogout(req, res, next);
    }
  );

  // Bans management endpoints (admin only)
  router.post('/bans', authenticate, requireRole('admin'), securityController.createBan);
  router.get('/bans', authenticate, requireRole('admin'), securityController.listBans);
  router.delete('/bans/:id', authenticate, requireRole('admin'), securityController.revokeBan);

  // AI & Biometrics Settings calibration endpoints (admin only)
  router.get('/settings/ai', authenticate, requireRole('admin'), securityController.getAiSettings);
  router.patch('/settings/ai', authenticate, requireRole('admin'), securityController.updateAiSettings);
  router.post('/settings/ai/reset', authenticate, requireRole('admin'), securityController.resetAiSettings);

  return router;
}

export const securityRoutes = createSecurityRouter();
