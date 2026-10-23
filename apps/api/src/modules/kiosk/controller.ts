import { Request, Response, NextFunction } from 'express';
import { KioskService } from './service';
import { PairKioskInput, CreatePairCodeInput } from './schema';
import { isCookieSecure } from '../../config/env';

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

      const secure = isCookieSecure();

      // Set HttpOnly device cookie (Master prompt: DB keeps hash only, JS doesn't hold token)
      res.cookie('kiosk_device_token', result.deviceToken, {
        httpOnly: true,
        secure,
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
  // DAILY MISSION HANDLERS (Master Prompt v3 Section 9 & 14, Item F6)
  // =========================================================================
  private async resolveKioskSession(req: Request): Promise<{ patient_id: string; kiosk_id: string } | null> {
    // 1. Strictly cookie only! (Item F6: reject reading x-kiosk-session header)
    const sessionToken = req.cookies?.kiosk_session;
    if (!sessionToken) {
      return null;
    }

    const kioskSession = await this.kioskService.getKioskSession(sessionToken);
    if (!kioskSession || !kioskSession.is_active || new Date() > kioskSession.expires_at) {
      return null;
    }

    // 2. Strict Kiosk Device Binding (Item F6: session must match the device cookie of that specific kiosk)
    const deviceTokenOrId =
      req.cookies?.kiosk_device_token ||
      req.cookies?.kiosk_device_id ||
      req.cookies?.kiosk_id;

    if (!deviceTokenOrId) {
      // Missing kiosk device cookie -> 401
      return null;
    }

    // Verify that this device token/id corresponds to kioskSession.kiosk_id
    const kioskDevice = await this.kioskService.verifyKioskDevice(deviceTokenOrId);
    if (!kioskDevice || kioskDevice.id !== kioskSession.kiosk_id) {
      // Session from kiosk 1 used at kiosk 2 (or spoofed/unmatched device) -> 401
      return null;
    }

    return {
      patient_id: kioskSession.patient_id,
      kiosk_id: kioskSession.kiosk_id,
    };
  }

  getPlan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const session = await this.resolveKioskSession(req);
      if (!session) {
        res.status(401).json({
          ok: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Active kiosk session and matching device cookie required',
          },
        });
        return;
      }

      const plan = await this.kioskService.getPlan(session.patient_id, session.kiosk_id);
      res.status(200).json({ ok: true, data: { plan } });
    } catch (err) {
      next(err);
    }
  };

  recordStep = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const session = await this.resolveKioskSession(req);
      if (!session) {
        res.status(401).json({
          ok: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Active kiosk session and matching device cookie required',
          },
        });
        return;
      }

      const result = await this.kioskService.recordStep(session.patient_id, req.body);
      res.status(201).json({ ok: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  finishMission = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const session = await this.resolveKioskSession(req);
      if (!session) {
        res.status(401).json({
          ok: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Active kiosk session and matching device cookie required',
          },
        });
        return;
      }

      const result = await this.kioskService.finishMission(session.patient_id, req.body);
      res.status(200).json({ ok: true, data: result });
    } catch (err) {
      next(err);
    }
  };
}
