import { Request, Response, NextFunction } from 'express';
import { AuthService } from './service';
import { LoginInput } from './schema';
import { isCookieSecure } from '../../config/env';

export class AuthController {
  constructor(private authService = new AuthService()) {}

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { username, password } = req.body as LoginInput;
      const existingDeviceId = req.cookies?.staff_device_id;
      const userAgent = req.headers['user-agent'];

      const clientIp = (req.ip || req.socket.remoteAddress || '127.0.0.1').replace(/^.*:/, '');

      const result = await this.authService.login(
        username,
        password,
        clientIp,
        existingDeviceId,
        userAgent
      );

      const secure = isCookieSecure();

      // Set HttpOnly, Secure, SameSite=Strict cookies
      res.cookie('access_token', result.accessToken, {
        httpOnly: true,
        secure,
        sameSite: 'strict',
        maxAge: result.expiresIn * 1000,
        path: '/',
      });

      res.cookie('refresh_token', result.refreshToken, {
        httpOnly: true,
        secure,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/api/auth',
      });

      res.cookie('staff_device_id', result.deviceId, {
        httpOnly: true,
        secure,
        sameSite: 'strict',
        maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
        path: '/',
      });

      res.status(200).json({
        ok: true,
        user: result.user,
        token: result.accessToken,
        accessToken: result.accessToken,
        access_token: result.accessToken,
        data: {
          user: result.user,
          token: result.accessToken,
          accessToken: result.accessToken,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.id) {
        const clientIp = (req.ip || req.socket.remoteAddress || '127.0.0.1').replace(/^.*:/, '');
        const clientDeviceId = req.cookies?.staff_device_id;
        await this.authService.logout(req.user.id, clientIp, clientDeviceId);
      }

      // Clear all auth cookies
      res.clearCookie('access_token', { path: '/' });
      res.clearCookie('refresh_token', { path: '/api/auth' });

      res.status(200).json({ ok: true, message: 'Logged out successfully' });
    } catch (err) {
      next(err);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;
      const result = await this.authService.refresh(refreshToken);

      const secure = isCookieSecure();

      res.cookie('access_token', result.accessToken, {
        httpOnly: true,
        secure,
        sameSite: 'strict',
        maxAge: result.expiresIn * 1000,
        path: '/',
      });

      res.cookie('refresh_token', result.refreshToken, {
        httpOnly: true,
        secure,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/api/auth',
      });

      res.status(200).json({
        ok: true,
        message: 'Session refreshed',
        token: result.accessToken,
        accessToken: result.accessToken,
        access_token: result.accessToken,
      });
    } catch (err) {
      next(err);
    }
  };

  me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json({
        ok: true,
        user: req.user,
        data: req.user,
      });
    } catch (err) {
      next(err);
    }
  };

  forceLogout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const paramId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
      const targetUserId = paramId || req.user?.id;
      if (!targetUserId) {
        res.status(400).json({ ok: false, message: 'User ID is required' });
        return;
      }
      const clientIp = (req.ip || req.socket.remoteAddress || '127.0.0.1').replace(/^.*:/, '');
      const clientDeviceId = req.cookies?.staff_device_id;
      const reason = req.body?.reason;
      await this.authService.forceLogout(targetUserId, req.user, clientIp, clientDeviceId, reason);
      res.status(200).json({
        ok: true,
        message: `User ${targetUserId} force logged out successfully`,
      });
    } catch (err) {
      next(err);
    }
  };
}
