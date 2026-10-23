/**
 * apps/api/src/modules/records/controller.ts
 * Controller for Medical Notes & Versioned Treatment Results
 * Conforms to Master Prompt v3 System 9.
 */

import { Request, Response, NextFunction } from 'express';
import { RecordsService, defaultRecordsService } from './service';
import { CreateMedicalNoteInput, CreateTreatmentResultInput } from './schema';
import { UserSession } from '../../middleware/authenticate';

export class RecordsController {
  constructor(private service: RecordsService = defaultRecordsService) {}

  /**
   * GET /api/patients/:id/notes
   */
  getNotes = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const patientId = req.params.id as string;
      const user = req.user as UserSession;

      const notes = await this.service.getNotes(patientId, user);

      res.status(200).json({
        ok: true,
        data: notes,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/patients/:id/notes
   */
  createNote = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const patientId = req.params.id as string;
      const user = req.user as UserSession;
      const body = req.body as CreateMedicalNoteInput;

      const note = await this.service.createNote(patientId, body, user);

      res.status(201).json({
        ok: true,
        data: note,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/patients/:id/treatment-results
   */
  getTreatmentResults = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const patientId = req.params.id as string;
      const user = req.user as UserSession;

      const results = await this.service.getTreatmentResults(patientId, user);

      res.status(200).json({
        ok: true,
        data: results,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/patients/:id/treatment-results
   */
  createTreatmentResult = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const patientId = req.params.id as string;
      const user = req.user as UserSession;
      const body = req.body as CreateTreatmentResultInput;

      const result = await this.service.createTreatmentResult(patientId, body, user);

      res.status(201).json({
        ok: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Rejects any attempt to UPDATE or DELETE clinical records.
   * Master Prompt v3 System 9 Line 356: "ไม่สร้าง route แก้/ลบ"
   */
  rejectModification = (_req: Request, res: Response): void => {
    res.status(405).json({
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Clinical records are strictly append-only. Modification and deletion are prohibited by hospital policy and database constraints.',
      },
    });
  };
}

export const defaultRecordsController = new RecordsController();
