import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/requireRole';
import { StaffController, defaultStaffController } from './controller';

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB maximum for avatar
});

export function createStaffRouter(controller: StaffController = defaultStaffController): Router {
  const router = Router();

  /**
   * Staff Management Routes
   * Master Prompt v3 Section 5 (Line 153) & Section 8.1 / 8.2:
   * - GET /api/staff: Admin only
   * - POST /api/staff: Admin only
   * - GET /api/staff/:id: Admin or Self
   * - PATCH /api/staff/:id: Admin or Self
   * - POST /api/staff/:id/suspend: Admin only
   * - POST /api/staff/:id/reset-password: Admin only
   * - POST /api/staff/:id/avatar: Admin or Self
   */
  router.get('/', authenticate, requireRole('admin'), controller.listStaff);
  router.post('/', authenticate, requireRole('admin'), controller.createStaff);

  router.get('/:id', authenticate, controller.getStaffById);
  router.patch('/:id', authenticate, controller.updateStaff);

  router.post('/:id/suspend', authenticate, requireRole('admin'), controller.suspendStaff);
  router.post('/:id/reset-password', authenticate, requireRole('admin'), controller.resetPassword);

  router.post('/:id/avatar', authenticate, avatarUpload.single('avatar'), controller.uploadAvatar);

  return router;
}

export const staffRoutes = createStaffRouter();
