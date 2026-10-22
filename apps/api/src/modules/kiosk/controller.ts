import { Request, Response, NextFunction } from 'express';
import { KioskService } from './service';
import { PairKioskInput, CreatePairCodeInput } from './schema';

export class KioskController {
  constructor(private kioskService = new KioskService()) {}

  createPairCode = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { kiosk_id } = req.body as CreatePairCodeInput;
      const result = await this.kioskService.generatePairingCode(kiosk_id);

      res.status(201).json({
        ok: true,
        pairing_code: result.code,
        expires_in_seconds: result.expiresInSeconds,
      });
    } catch (err) {
      next(err);
    }
  };

  pair = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { kiosk_id, code } = req.body as PairKioskInput;
      const clientIp = req.ip || '127.0.0.1';

      const result = await this.kioskService.pairDevice(kiosk_id, code, clientIp);

      const isProd = process.env.NODE_ENV === 'production';

      // Set HttpOnly device cookie (Master prompt: DB keeps hash only, JS doesn't hold token)
      res.cookie('kiosk_device_token', result.deviceToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'strict',
        maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
        path: '/',
      });

      res.status(200).json({
        ok: true,
        message: 'Kiosk paired successfully',
        device: result.kiosk,
      });
    } catch (err) {
      next(err);
    }
  };
}
