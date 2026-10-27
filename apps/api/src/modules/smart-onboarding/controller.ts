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

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
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

  pinLogin = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const { pin, hn } = req.body;
      if (!pin) {
        res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'PIN is required' } });
        return;
      }
      const result = await this.service.pinLogin(pin, hn);
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
      const patientId = req.body.patient_id || req.body.patientId;
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
      const data = this.service.getDailyPlan(patientId, date);
      res.status(200).json({
        ok: true,
        data,
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
      const data = await this.service.saveRehabScore(patient_id, score);
      res.status(200).json({
        ok: true,
        data,
      });
    } catch (err) {
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
      const data = this.service.listAllDossiers();
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
}

export const defaultSmartOnboardingController = new SmartOnboardingController();
