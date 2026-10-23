/**
 * apps/api/src/modules/kiosk/faceAuth.controller.ts
 * Kiosk Facial Authentication Controller per Master Prompt v3 Section 7.4
 * Separated cleanly from Kiosk Device Pairing Controller.
 */

import { Request, Response, NextFunction } from 'express';
import { KioskFaceAuthService } from './faceAuth.service';
import {
  ChallengeRequestInput,
  VerifyFaceInput,
  ConfirmIdentityInput,
} from './schema';

export class KioskFaceAuthController {
  constructor(private service = new KioskFaceAuthService()) {}

  /**
   * POST /api/kiosk/challenge
   */
  challenge = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { kiosk_id } = req.body as ChallengeRequestInput;
      const result = await this.service.createChallenge(kiosk_id);

      res.status(201).json({
        ok: true,
        nonce: result.nonce,
        steps: result.steps,
        expires_in_seconds: result.expiresInSeconds,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/kiosk/verify (and alias /verify-face)
   */
  verify = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.body as VerifyFaceInput;
      const clientIp = req.ip || '127.0.0.1';

      const result = await this.service.verifyFace(body, clientIp);

      res.status(200).json({
        ok: true,
        message: 'Face verified successfully',
        session_token: result.sessionToken,
        candidate: result.candidate,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/kiosk/confirm-identity
   */
  confirmIdentity = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { session_token, confirmed } = req.body as ConfirmIdentityInput;

      const result = await this.service.confirmIdentity(session_token, confirmed);

      res.status(200).json({
        ok: result.ok,
        confirmed: result.confirmed,
        patient: result.patient,
        message: result.message,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/kiosk/call-staff (Manual staff call trigger)
   */
  callStaff = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const kioskId = req.body.kiosk_id || req.body.kioskId;
      const reason = req.body.reason || 'Patient requested assistance at kiosk';

      const call = await this.service.createStaffCall(kioskId, reason);

      res.status(201).json({
        ok: true,
        message: 'Staff call initiated successfully',
        call_id: call.id,
      });
    } catch (err) {
      next(err);
    }
  };
}
