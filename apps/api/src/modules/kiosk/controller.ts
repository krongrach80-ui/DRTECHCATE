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

  listDevices = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const devices = await this.kioskService.listDevices();
      res.status(200).json({
        ok: true,
        data: devices,
      });
    } catch (err) {
      next(err);
    }
  };

  createDevice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, location } = req.body;
      if (!name) {
        res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Kiosk name is required' } });
        return;
      }
      const device = await this.kioskService.createDevice(name, location);
      res.status(201).json({
        ok: true,
        data: device,
      });
    } catch (err) {
      next(err);
    }
  };

  listStaffCalls = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const calls = await this.kioskService.listStaffCalls();
      res.status(200).json({
        ok: true,
        data: calls,
      });
    } catch (err) {
      next(err);
    }
  };

  handleStaffCall = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const paramId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const staffId = req.user?.id || 'unknown';
      await this.kioskService.handleStaffCall(paramId, staffId);
      res.status(200).json({
        ok: true,
        message: 'Staff call resolved',
      });
    } catch (err) {
      next(err);
    }
  };

  // =========================================================================
  // DAILY MISSION HANDLERS (Master Prompt v3 Section 9 & 14)
  // =========================================================================
  getPlan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const patientId = (req.query.patient_id as string) || '';
      const kioskId = req.query.kiosk_id as string | undefined;
      if (!patientId) {
        res.status(400).json({
          ok: false,
          error: { code: 'BAD_REQUEST', message: 'patient_id query parameter is required' },
        });
        return;
      }
      const plan = await this.kioskService.getPlan(patientId, kioskId);
      res.status(200).json({ ok: true, data: { plan } });
    } catch (err) {
      next(err);
    }
  };

  recordStep = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.kioskService.recordStep(req.body);
      res.status(201).json({ ok: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  finishMission = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.kioskService.finishMission(req.body);
      res.status(200).json({ ok: true, data: result });
    } catch (err) {
      next(err);
    }
  };
}
