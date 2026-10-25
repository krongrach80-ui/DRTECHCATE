import { Request, Response, NextFunction } from 'express';
import { SecurityService } from './service';
import { BanCreateSchema, BanQuerySchema } from './schema';
import { AppError } from '../../middleware/errorHandler';

export class SecurityController {
  constructor(private securityService = new SecurityService()) {}

  createBan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const input = BanCreateSchema.parse(req.body);
      const clientIp = (req.ip || req.socket.remoteAddress || '127.0.0.1').replace(/^.*:/, '');
      const clientDeviceId = req.cookies?.staff_device_id;

      const ban = await this.securityService.createBan(
        input,
        req.user,
        clientIp,
        clientDeviceId
      );

      res.status(201).json({
        ok: true,
        data: ban,
      });
    } catch (err) {
      next(err);
    }
  };

  listBans = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filter = BanQuerySchema.parse(req.query);
      const bans = await this.securityService.listBans(filter);

      res.status(200).json({
        ok: true,
        data: bans,
      });
    } catch (err) {
      next(err);
    }
  };

  revokeBan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        throw new AppError('Ban ID is required', 400, 'BAD_REQUEST');
      }

      const clientIp = (req.ip || req.socket.remoteAddress || '127.0.0.1').replace(/^.*:/, '');
      const clientDeviceId = req.cookies?.staff_device_id;

      await this.securityService.revokeBan(id, req.user, clientIp, clientDeviceId);

      res.status(200).json({
        ok: true,
        message: 'Ban removed successfully',
      });
    } catch (err) {
      next(err);
    }
  };

  getAiSettings = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.securityService.getAiSettings();
      res.status(200).json({
        ok: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  updateAiSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }
      const clientIp = (req.ip || req.socket.remoteAddress || '127.0.0.1').replace(/^.*:/, '');
      const clientDeviceId = req.cookies?.staff_device_id;
      const data = await this.securityService.updateAiSettings(
        req.body,
        req.user,
        clientIp,
        clientDeviceId
      );
      res.status(200).json({
        ok: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  resetAiSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }
      const clientIp = (req.ip || req.socket.remoteAddress || '127.0.0.1').replace(/^.*:/, '');
      const clientDeviceId = req.cookies?.staff_device_id;
      const data = await this.securityService.resetAiSettings(
        req.user,
        clientIp,
        clientDeviceId
      );
      res.status(200).json({
        ok: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  };
}
