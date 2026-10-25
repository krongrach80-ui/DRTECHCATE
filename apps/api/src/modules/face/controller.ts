/**
 * apps/api/src/modules/face/controller.ts
 * Express Controllers for Face Enrollment & Biometric Deletion
 */

import { Request, Response, NextFunction } from 'express';
import { FaceEnrollmentService, defaultFaceEnrollmentService } from './service';
import { FaceEnrollInputSchema, KioskFaceEnrollSchema } from './schema';
import { AppError } from '../../middleware/errorHandler';

export class FaceEnrollmentController {
  constructor(private service: FaceEnrollmentService = defaultFaceEnrollmentService) {}

  /**
   * POST /api/face/enroll
   * Staff-driven (Admin / PT) face enrollment
   */
  enrollStaff = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const input = FaceEnrollInputSchema.parse(req.body);
      const result = await this.service.enrollStaff(input, req.user, req.ip);

      res.status(201).json({
        ok: true,
        ...result,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/kiosk/enroll
   * Kiosk-driven face enrollment
   */
  enrollKiosk = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const kioskDeviceId =
        (req.cookies && req.cookies.device_token) ||
        (req.headers['x-kiosk-id'] as string) ||
        req.body.kiosk_id ||
        'kiosk-terminal';

      const input = KioskFaceEnrollSchema.parse(req.body);
      const result = await this.service.enrollKiosk(input, kioskDeviceId, req.ip);

      res.status(201).json({
        ok: true,
        ...result,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * DELETE /api/face/:patientId
   * PDPA Biometric Deletion (Admin / PT)
   */
  deleteBiometrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const patientId = String(req.params.patientId || req.params.id);
      await this.service.deleteBiometrics(patientId, req.user, req.ip);

      res.status(200).json({
        ok: true,
        message: 'Patient biometric data successfully deleted according to PDPA erasure policy.',
        data: { patient_id: patientId },
      });
    } catch (err) {
      next(err);
    }
  };
}

export const defaultFaceEnrollmentController = new FaceEnrollmentController();
