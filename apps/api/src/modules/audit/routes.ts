import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/requireRole';
import { AuditController } from './controller';

export function createAuditRouter(controller = new AuditController()): Router {
  const router = Router();

  /**
   * GET /api/audit
   * Admin-only compliance audit trail query endpoint.
   * Master Prompt v3 Section 5 (Line 160) & Section 10 (Line 306).
   * PT gets 403 Forbidden. Unauthenticated gets 401.
   */
  router.get('/', authenticate, requireRole('admin'), controller.getAuditLogs);

  return router;
}

export const auditRoutes = createAuditRouter();
