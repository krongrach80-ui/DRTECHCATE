import { Router } from 'express';
import { AuthController } from './controller';
import { loginSchema } from './schema';
import { validateBody } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';

export function createAuthRouter(controller = new AuthController()): Router {
  const router = Router();

  // POST /api/auth/login (Public endpoint, protected by rateLimiter & csrfGuard)
  router.post('/login', validateBody(loginSchema), controller.login);

  // POST /api/auth/refresh (Session refresh using refresh token cookie)
  router.post('/refresh', controller.refresh);

  // POST /api/auth/logout (Authenticated session revocation)
  router.post('/logout', authenticate, controller.logout);

  // GET /api/auth/me (Returns active user profile)
  router.get('/me', authenticate, controller.me);

  // POST /api/auth/force-logout (Revoke active session via force_logout_at)
  router.post(['/force-logout', '/force-logout/:userId'], authenticate, controller.forceLogout);

  return router;
}

export const authRoutes = createAuthRouter();
