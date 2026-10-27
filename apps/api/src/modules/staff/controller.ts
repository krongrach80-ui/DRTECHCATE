import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../middleware/errorHandler';
import { StaffService, defaultStaffService } from './service';
import {
  CreateStaffSchema,
  UpdateStaffSchema,
  ResetPasswordSchema,
  StaffQuerySchema,
} from './schema';

export class StaffController {
  constructor(private staffService: StaffService = defaultStaffService) {}

  listStaff = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const filter = StaffQuerySchema.parse(req.query);
      const staffList = await this.staffService.listStaff(filter, req.user);

      res.status(200).json({
        ok: true,
        data: staffList,
      });
    } catch (err) {
      next(err);
    }
  };

  getStaffById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        throw new AppError('Staff ID is required', 400, 'BAD_REQUEST');
      }

      const profile = await this.staffService.getStaffById(id, req.user);

      res.status(200).json({
        ok: true,
        data: profile,
      });
    } catch (err) {
      next(err);
    }
  };

  createStaff = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const input = CreateStaffSchema.parse(req.body);
      const clientIp = (req.ip || req.socket.remoteAddress || '127.0.0.1').replace(/^.*:/, '');
      const clientDeviceId = req.cookies?.staff_device_id;

      const profile = await this.staffService.createStaff(
        input,
        req.user,
        clientIp,
        clientDeviceId
      );

      res.status(201).json({
        ok: true,
        data: profile,
      });
    } catch (err) {
      next(err);
    }
  };

  updateStaff = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        throw new AppError('Staff ID is required', 400, 'BAD_REQUEST');
      }

      const input = UpdateStaffSchema.parse(req.body);
      const clientIp = (req.ip || req.socket.remoteAddress || '127.0.0.1').replace(/^.*:/, '');
      const clientDeviceId = req.cookies?.staff_device_id;

      const updated = await this.staffService.updateStaff(
        id,
        input,
        req.user,
        clientIp,
        clientDeviceId
      );

      res.status(200).json({
        ok: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  };

  suspendStaff = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        throw new AppError('Staff ID is required', 400, 'BAD_REQUEST');
      }

      const clientIp = (req.ip || req.socket.remoteAddress || '127.0.0.1').replace(/^.*:/, '');
      const clientDeviceId = req.cookies?.staff_device_id;

      await this.staffService.suspendStaff(id, req.user, clientIp, clientDeviceId);

      res.status(200).json({
        ok: true,
        message: 'Staff member suspended',
      });
    } catch (err) {
      next(err);
    }
  };

  resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        throw new AppError('Staff ID is required', 400, 'BAD_REQUEST');
      }

      const { password } = ResetPasswordSchema.parse(req.body);
      const clientIp = (req.ip || req.socket.remoteAddress || '127.0.0.1').replace(/^.*:/, '');
      const clientDeviceId = req.cookies?.staff_device_id;

      await this.staffService.resetPassword(id, password, req.user, clientIp, clientDeviceId);

      res.status(200).json({
        ok: true,
        message: 'Password reset successfully',
      });
    } catch (err) {
      next(err);
    }
  };

  uploadAvatar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        throw new AppError('Staff ID is required', 400, 'BAD_REQUEST');
      }

      if (!req.file) {
        throw new AppError('No avatar file uploaded', 400, 'FILE_MISSING');
      }

      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedMimes.includes(req.file.mimetype)) {
        throw new AppError('Avatar must be a JPEG, PNG, or WebP image', 400, 'INVALID_FILE_TYPE');
      }

      const extension = req.file.mimetype.split('/')[1] || 'jpg';
      const clientIp = (req.ip || req.socket.remoteAddress || '127.0.0.1').replace(/^.*:/, '');
      const clientDeviceId = req.cookies?.staff_device_id;

      const avatarUrl = await this.staffService.uploadAvatar(
        id,
        req.file.buffer,
        req.file.mimetype,
        extension,
        req.user,
        clientIp,
        clientDeviceId
      );

      res.status(200).json({
        ok: true,
        avatar_url: avatarUrl,
      });
    } catch (err) {
      next(err);
    }
  };

  deleteStaff = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        throw new AppError('Staff ID is required', 400, 'BAD_REQUEST');
      }

      const clientIp = (req.ip || req.socket.remoteAddress || '127.0.0.1').replace(/^.*:/, '');
      const clientDeviceId = req.cookies?.staff_device_id;

      await this.staffService.deleteStaff(id, req.user, clientIp, clientDeviceId);

      res.status(200).json({
        ok: true,
        message: 'Staff deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  };
}

export const defaultStaffController = new StaffController();
