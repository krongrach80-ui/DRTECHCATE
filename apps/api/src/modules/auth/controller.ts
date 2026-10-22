import { Request, Response, NextFunction } from 'express';
import { AuthService } from './service';
import { LoginInput } from './schema';

export class AuthController {
  constructor(private authService = new AuthService()) {}

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { username, password } = req.body as LoginInput;
      const existingDeviceId = req.cookies?.staff_device_id;
      const userAgent = req.headers['user-agent'];

      const result = await this.authService.login(
        username,
        password,
        existingDeviceId,
        userAgent
      );

      const isProd = process.env.NODE_ENV === 'production';

      // Set HttpOnly, Secure, SameSite=Strict cookies
      res.cookie('access_token', result.accessToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'strict',
        maxAge: result.expiresIn * 1000,
        path: '/',
      });

      res.cookie('refresh_token', result.refreshToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/',
      });

      res.cookie('staff_device_id', result.deviceId, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'strict',
        maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
        path: '/',
      });

      res.status(200).json({
        ok: true,
        user: result.user,
      });
    } catch (err) {
      next(err);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.id) {
        await this.authService.logout(req.user.id);
      }

      // Clear all auth cookies
      res.clearCookie('access_token', { path: '/' });
      res.clearCookie('refresh_token', { path: '/' });

      res.status(200).json({ ok: true, message: 'Logged out successfully' });
    } catch (err) {
      next(err);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;
      const result = await this.authService.refresh(refreshToken);

      const isProd = process.env.NODE_ENV === 'production';

      res.cookie('access_token', result.accessToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'strict',
        maxAge: result.expiresIn * 1000,
        path: '/',
      });

      res.cookie('refresh_token', result.refreshToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      res.status(200).json({ ok: true, message: 'Session refreshed' });
    } catch (err) {
      next(err);
    }
  };

  me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json({
        ok: true,
        user: req.user,
      });
    } catch (err) {
      next(err);
    }
  };
}
