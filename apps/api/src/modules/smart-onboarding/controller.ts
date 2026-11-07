/**
 * apps/api/src/modules/smart-onboarding/controller.ts
 * Smart Onboarding & Isolated Biometrics Express Controller
 * Master Prompt v4: Sovereign Isolated Medical-Grade Architecture
 */

import { Request, Response, NextFunction } from 'express';
import {
  SmartOnboardingService,
  defaultSmartOnboardingService,
} from './service';

export class SmartOnboardingController {
  constructor(private service: SmartOnboardingService = defaultSmartOnboardingService) {}

  createDraft = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.createDraftPatient(req.body);
      res.status(201).json({
        ok: true,
        data,
        patient_id: data.patient_id,
        hn: data.hn,
        registration_status: data.registration_status,
      });
    } catch (err) {
      next(err);
    }
  };

  cancelDraft = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const patientId = req.params.patientId || req.body.patient_id;
      const data = await this.service.cancelDraftPatient(patientId);
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  };

  savePrescription = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.savePrescription(req.body);
      res.status(201).json(data);
    } catch (err) {
      next(err);
    }
  };

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffRole = ((req.headers['x-staff-role'] || (req.user as any)?.role || '') as string).toLowerCase();
      // Server-side role authorization enforcement
      if (staffRole) {
        const isAllowed =
          staffRole === 'admin' ||
          staffRole === 'super_admin' ||
          staffRole === 'director' ||
          staffRole === 'pt' ||
          staffRole === 'therapist';

        if (!isAllowed) {
          res.status(403).json({
            ok: false,
            error: {
              code: 'FORBIDDEN',
              message: '⛔ Insufficient role permissions. Only Admin, Super Admin, and Physical Therapists can register new patients.',
            },
          });
          return;
        }
      }

      const data = await this.service.registerPatient(req.body);
      res.status(201).json({
        ok: true,
        data,
        patient_id: data.patient_id,
        hn: data.hn,
      });
    } catch (err) {
      next(err);
    }
  };

  checkDuplicate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const hn = req.query.hn as string | undefined;
      const full_name = (req.query.full_name || req.query.name) as string | undefined;
      const birth_date = req.query.birth_date as string | undefined;
      const exclude_patient_id = (req.query.exclude_patient_id || req.query.patient_id) as string | undefined;

      const result = await this.service.checkDuplicate({ hn, full_name, birth_date, exclude_patient_id });
      res.status(200).json({
        ok: true,
        data: result,
        ...result,
      });
    } catch (err) {
      next(err);
    }
  };

  pinLogin = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const { pin, hn, probe } = req.body;
      if (!pin) {
        res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'PIN is required' } });
        return;
      }
      const result = await this.service.pinLogin(pin, hn, probe);
      res.status(200).json({
        ok: true,
        ...result,
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: errMsg } });
    }
  };

  scanLogin = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const { probe, snapshot } = req.body;
      if (!probe || !Array.isArray(probe) || probe.length === 0) {
        res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Probe vector is required' } });
        return;
      }
      const result = await this.service.scanLogin(probe, snapshot);
      res.status(200).json({
        ok: true,
        ...result,
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: errMsg } });
    }
  };

  continuousFaceVerify = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const { patient_id, probe, session_id, exercise_id } = req.body;
      if (!patient_id || typeof patient_id !== 'string') {
        res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'patient_id is required' } });
        return;
      }
      if (!probe || !Array.isArray(probe) || probe.length !== 512) {
        res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Valid 512-dim probe vector is required' } });
        return;
      }
      const result = await this.service.continuousFaceVerify({
        patient_id,
        probe,
        session_id,
        exercise_id,
      });
      res.status(200).json({
        ok: true,
        ...result,
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: errMsg } });
    }
  };

  createPending = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { frames, model_version } = req.body;
      if (!frames || !Array.isArray(frames)) {
        res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Frames array is required' } });
        return;
      }
      const data = await this.service.createPendingAccount({ frames, model_version });
      res.status(201).json({
        ok: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  completeInfo = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { patient_id, first_name, last_name, age, gender, phone, initial_symptoms } = req.body;
      if (!patient_id || !first_name) {
        res.status(400).json({
          ok: false,
          error: { code: 'BAD_REQUEST', message: 'patient_id and first_name are required' },
        });
        return;
      }
      const data = await this.service.completePatientInfo(patient_id, {
        first_name,
        last_name: last_name || '',
        age: Number(age) || 0,
        gender: gender || 'unspecified',
        phone,
        initial_symptoms,
      });
      res.status(200).json({
        ok: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  listPending = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const list = this.service.listPendingPatients();
      res.status(200).json({
        ok: true,
        data: list,
      });
    } catch (err) {
      next(err);
    }
  };

  saveSchedule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Clinical role validation: admin, super_admin, director, pt, therapist allowed; unauthorized returns 403 Forbidden
      const staffRole = (req.user?.role || (req.headers['x-staff-role'] as string) || '').toLowerCase();
      const allowedRoles = ['admin', 'super_admin', 'director', 'pt', 'therapist'];
      if (staffRole && !allowedRoles.includes(staffRole)) {
        res.status(403).json({
          ok: false,
          error: { code: 'FORBIDDEN', message: 'Insufficient permissions: Only clinical staff (PT/Admin) can prescribe exercise courses' },
        });
        return;
      }

      const rawParam = req.params.patientId;
      const paramPatientId = Array.isArray(rawParam) ? rawParam[0] : rawParam;
      const patientId = req.body.patient_id || req.body.patientId || paramPatientId;
      const schedule = req.body.schedule || req.body;
      if (!patientId || !schedule) {
        res.status(400).json({
          ok: false,
          error: { code: 'BAD_REQUEST', message: 'patient_id and schedule are required' },
        });
        return;
      }
      const data = await this.service.saveSchedule(patientId, schedule);
      res.status(200).json({
        ok: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  getDailyPlan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawParam = req.params.patientId;
      const patientId = Array.isArray(rawParam) ? rawParam[0] : rawParam;
      const date = typeof req.query.date === 'string' ? req.query.date : undefined;
      const data = await this.service.getDailyPlan(patientId, date);
      res.status(200).json({
        ok: true,
        data,
        ...data,
      });
    } catch (err) {
      next(err);
    }
  };

  saveRehabScore = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { patient_id, score } = req.body;
      if (!patient_id || !score) {
        res.status(400).json({
          ok: false,
          error: { code: 'BAD_REQUEST', message: 'patient_id and score are required' },
        });
        return;
      }
      const isStaffOverride = Boolean(
        req.headers['x-staff-override'] === 'true' ||
        (req as any).user?.role === 'staff' ||
        (req as any).user?.role === 'admin' ||
        (req as any).user?.role === 'pt'
      );
      const data = await this.service.saveRehabScore(patient_id, score, isStaffOverride);
      res.status(200).json({
        ok: true,
        data,
      });
    } catch (err: any) {
      if (err.statusCode === 403 || err.code === 'NO_SCHEDULED_APPOINTMENT_TODAY') {
        res.status(403).json({
          ok: false,
          error: {
            code: 'NO_SCHEDULED_APPOINTMENT_TODAY',
            message: err.message,
          },
        });
        return;
      }
      next(err);
    }
  };

  deletePatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawParam = req.params.patientId;
      const patientId = Array.isArray(rawParam) ? rawParam[0] : rawParam;
      await this.service.deletePatient(patientId);
      res.status(200).json({
        ok: true,
        message: 'Patient permanently deleted from database and disk vault',
      });
    } catch (err) {
      next(err);
    }
  };

  getDossier = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawParam = req.params.patientId;
      const patientId = Array.isArray(rawParam) ? rawParam[0] : rawParam;
      const dossier = this.service.getPatientDossier(patientId);
      if (!dossier) {
        res.status(404).json({
          ok: false,
          error: { code: 'NOT_FOUND', message: `Patient dossier for ${patientId} not found` },
        });
        return;
      }
      res.status(200).json({
        ok: true,
        data: dossier,
      });
    } catch (err) {
      next(err);
    }
  };

  listDossiers = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.listAllDossiers();
      res.status(200).json({
        ok: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  getExercises = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getExercises();
      res.status(200).json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  };

  saveExercise = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.saveExercise(req.body);
      res.status(201).json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  };

  getModpacks = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getModpacks();
      res.status(200).json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  };

  saveModpack = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.saveModpack(req.body);
      res.status(201).json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  };

  getSchedule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawParam = req.params.patientId;
      const patientId = Array.isArray(rawParam) ? rawParam[0] : rawParam;
      const schedule = await this.service.getPatientSchedule(patientId);
      res.status(200).json({ ok: true, data: { schedule } });
    } catch (err) {
      next(err);
    }
  };

  deleteScheduleDate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawParam = req.params.patientId;
      const patientId = Array.isArray(rawParam) ? rawParam[0] : rawParam;
      const dateStr = req.params.dateStr as string;
      await this.service.deleteScheduleDate(patientId, dateStr);
      res.status(200).json({ ok: true, message: `ลบวันนัด ${dateStr} เรียบร้อยแล้ว` });
    } catch (err) {
      next(err);
    }
  };

  clearSchedule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawParam = req.params.patientId;
      const patientId = Array.isArray(rawParam) ? rawParam[0] : rawParam;
      await this.service.clearPatientSchedule(patientId);
      res.status(200).json({ ok: true, message: 'ล้างตารางนัดทั้งหมดของคนไข้เรียบร้อยแล้ว' });
    } catch (err) {
      next(err);
    }
  };
}

export const defaultSmartOnboardingController = new SmartOnboardingController();

