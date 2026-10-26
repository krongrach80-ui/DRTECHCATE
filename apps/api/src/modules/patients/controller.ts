import { Request, Response, NextFunction } from 'express';
import { PatientService, defaultPatientService } from './service';
import {
  CreatePatientSchema,
  UpdatePatientSchema,
  PatientQuerySchema,
  SendToKioskSchema,
  CheckinSchema,
} from './schema';
import { AppError } from '../../middleware/errorHandler';

export class PatientController {
  constructor(private service: PatientService = defaultPatientService) {}

  createPatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const input = CreatePatientSchema.parse(req.body);
      const patient = await this.service.createPatient(input, req.user, req.ip);
      res.status(201).json({ ok: true, data: patient });
    } catch (err) {
      next(err);
    }
  };

  listPatients = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const filter = PatientQuerySchema.parse(req.query);
      const result = await this.service.listPatients(filter, req.user);
      res.status(200).json({ ok: true, data: result.patients, ...result });
    } catch (err) {
      next(err);
    }
  };

  getPatientById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const id = String(req.params.id);
      const patient = await this.service.getPatientById(id, req.user, req.ip);
      res.status(200).json({ ok: true, data: patient });
    } catch (err) {
      next(err);
    }
  };

  updatePatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const id = String(req.params.id);
      const input = UpdatePatientSchema.parse(req.body);
      const patient = await this.service.updatePatient(id, input, req.user, req.ip);
      res.status(200).json({ ok: true, data: patient });
    } catch (err) {
      next(err);
    }
  };

  sendToKiosk = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const id = String(req.params.id);
      const input = SendToKioskSchema.parse(req.body);
      const ticket = await this.service.sendToKiosk(id, input.kiosk_id, req.user, req.ip);
      res.status(201).json({ ok: true, data: ticket });
    } catch (err) {
      next(err);
    }
  };

  checkin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const id = String(req.params.id);
      const input = CheckinSchema.parse(req.body);
      const checkin = await this.service.checkin(id, input.kiosk_id || null, req.user, req.ip);
      res.status(200).json({ ok: true, data: checkin });
    } catch (err) {
      next(err);
    }
  };

  archivePatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const id = String(req.params.id);
      const patient = await this.service.archivePatient(id, req.user, req.ip);
      res.status(200).json({ ok: true, data: patient });
    } catch (err) {
      next(err);
    }
  };

  deleteBiometrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const id = String(req.params.id || req.params.patientId);
      await this.service.deleteBiometrics(id, req.user, req.ip);
      res.status(200).json({
        ok: true,
        message: 'Patient biometric data successfully deleted according to PDPA erasure policy.',
      });
    } catch (err) {
      next(err);
    }
  };
}

export const defaultPatientController = new PatientController();
