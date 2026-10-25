/**
 * apps/api/src/modules/face/repository.ts
 * Database & Storage repository for Face Enrollment & Biometrics
 */

import { getAdminClient } from '../../lib/supabase/adminClient';
import { logger } from '../../middleware/logger';
import { AppError } from '../../middleware/errorHandler';

export interface ConsentRecord {
  id: string;
  subject_id: string;
  type: string;
  text_version: string;
  revoked_at: string | null;
}

export interface EnrollmentTicketData {
  id: string;
  patient_id: string;
  kiosk_id: string;
  created_by: string;
  expires_at: string;
  used_at: string | null;
}

export interface IFaceEnrollmentRepository {
  getActiveConsent(patientId: string, consentId?: string): Promise<ConsentRecord | null>;
  isPatientAccessibleByPt(patientId: string, ptId: string): Promise<boolean>;
  getEnrollmentTicket(ticketId: string): Promise<EnrollmentTicketData | null>;
  findDuplicateFaceCandidate(
    probe: number[],
    excludePatientId: string,
    threshold: number
  ): Promise<{ patient_id: string; score: number } | null>;
  uploadBiometricImages(
    patientId: string,
    enrollmentId: string,
    images: Array<{ frameIndex: number; buffer: Buffer }>
  ): Promise<string[]>;
  deleteBiometricFiles(filePaths: string[]): Promise<void>;
  deletePatientBiometricStorage(patientId: string): Promise<number>;
  callEnrollFaceAtomic(params: {
    patientId: string;
    staffId: string;
    modelVersion: string;
    poses: string[];
    embeddings: number[][];
    consentId?: string | null;
    ticketId?: string | null;
  }): Promise<string>;
  rollbackEnrollment(enrollmentId: string, patientId: string): Promise<void>;
  deleteBiometrics(patientId: string): Promise<void>;
}

export class FaceEnrollmentRepository implements IFaceEnrollmentRepository {
  async getActiveConsent(patientId: string, consentId?: string): Promise<ConsentRecord | null> {
    try {
      const adminClient = getAdminClient();
      let query = adminClient
        .from('consents')
        .select('*')
        .eq('subject_type', 'patient')
        .eq('subject_id', patientId)
        .is('revoked_at', null);

      if (consentId) {
        query = query.eq('id', consentId);
      } else {
        query = query.order('created_at', { ascending: false }).limit(1);
      }

      const { data, error } = await query.maybeSingle();
      if (error) {
        logger.error({ error, patientId }, 'Failed to query consents in Supabase');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return data as ConsentRecord | null;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, patientId }, 'Unexpected error in getActiveConsent');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async isPatientAccessibleByPt(patientId: string, ptId: string): Promise<boolean> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient.rpc('is_patient_accessible_by_pt', {
        p_id: patientId,
        pt_uuid: ptId,
      });

      if (error) {
        logger.error({ error, patientId, ptId }, 'Failed to check patient accessibility by PT');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return Boolean(data);
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, patientId, ptId }, 'Unexpected error in isPatientAccessibleByPt');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async getEnrollmentTicket(ticketId: string): Promise<EnrollmentTicketData | null> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('enrollment_tickets')
        .select('*')
        .eq('id', ticketId)
        .maybeSingle();

      if (error) {
        logger.error({ error, ticketId }, 'Failed to query enrollment_tickets');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return data as EnrollmentTicketData | null;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, ticketId }, 'Unexpected error in getEnrollmentTicket');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async findDuplicateFaceCandidate(
    probe: number[],
    excludePatientId: string,
    threshold: number
  ): Promise<{ patient_id: string; score: number } | null> {
    try {
      const adminClient = getAdminClient();

      // 1. Fetch active enrollments excluding this patient
      const { data: enrollments, error: enrollError } = await adminClient
        .from('face_enrollments')
        .select('patient_id')
        .eq('status', 'active')
        .neq('patient_id', excludePatientId);

      if (enrollError) {
        logger.error({ error: enrollError }, 'Failed to query active enrollments for duplicate face check');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      if (!enrollments || enrollments.length === 0) {
        return null;
      }

      const otherPatientIds = Array.from(new Set(enrollments.map((e) => e.patient_id)));

      // 2. Query match_face_candidates RPC
      const { data: matches, error: matchError } = await adminClient.rpc('match_face_candidates', {
        probe: `[${probe.join(',')}]`,
        candidate_ids: otherPatientIds,
        k: 1,
      });

      if (matchError) {
        logger.error({ error: matchError }, 'Failed to check duplicate face via match_face_candidates');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      if (matches && matches.length > 0) {
        const top = matches[0] as { patient_id: string; score: number };
        if (top.score >= threshold) {
          return top;
        }
      }

      return null;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, excludePatientId }, 'Unexpected error in findDuplicateFaceCandidate');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async uploadBiometricImages(
    patientId: string,
    enrollmentId: string,
    images: Array<{ frameIndex: number; buffer: Buffer }>
  ): Promise<string[]> {
    const uploadedPaths: string[] = [];
    const adminClient = getAdminClient();

    for (const img of images) {
      const frameNum = String(img.frameIndex + 1).padStart(2, '0');
      const filePath = `${patientId}/${enrollmentId}/frame_${frameNum}.jpg`;

      const { error } = await adminClient.storage
        .from('biometric-data')
        .upload(filePath, img.buffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (error) {
        logger.error({ error, filePath }, 'Failed to upload biometric image frame');
        throw new AppError('Failed to store biometric image frame', 503, 'STORAGE_UNAVAILABLE');
      }

      uploadedPaths.push(filePath);
    }

    return uploadedPaths;
  }

  async deleteBiometricFiles(filePaths: string[]): Promise<void> {
    if (!filePaths || filePaths.length === 0) return;
    try {
      const adminClient = getAdminClient();
      const { error } = await adminClient.storage.from('biometric-data').remove(filePaths);
      if (error) {
        logger.warn({ error, filePaths }, 'Warning: Failed to delete biometric files in storage compensation');
      }
    } catch (err) {
      logger.warn({ err, filePaths }, 'Unexpected error during storage file deletion');
    }
  }

  async deletePatientBiometricStorage(patientId: string): Promise<number> {
    try {
      const adminClient = getAdminClient();
      const { data: files, error: listError } = await adminClient.storage
        .from('biometric-data')
        .list(patientId);

      if (listError || !files) {
        return 0;
      }

      let deletedCount = 0;
      const filePathsToRemove: string[] = [];

      for (const item of files) {
        if (item.id === null) {
          // It's a folder (enrollmentId subfolder)
          const { data: subFiles } = await adminClient.storage
            .from('biometric-data')
            .list(`${patientId}/${item.name}`);

          if (subFiles && subFiles.length > 0) {
            for (const sf of subFiles) {
              filePathsToRemove.push(`${patientId}/${item.name}/${sf.name}`);
            }
          }
        } else {
          filePathsToRemove.push(`${patientId}/${item.name}`);
        }
      }

      if (filePathsToRemove.length > 0) {
        const { error: removeError } = await adminClient.storage
          .from('biometric-data')
          .remove(filePathsToRemove);

        if (!removeError) {
          deletedCount = filePathsToRemove.length;
        }
      }

      return deletedCount;
    } catch (err) {
      logger.warn({ err, patientId }, 'Failed to clean patient biometric storage folder');
      return 0;
    }
  }

  async callEnrollFaceAtomic(params: {
    patientId: string;
    staffId: string;
    modelVersion: string;
    poses: string[];
    embeddings: number[][];
    consentId?: string | null;
    ticketId?: string | null;
  }): Promise<string> {
    try {
      const adminClient = getAdminClient();
      const vectorStrings = params.embeddings.map((vec) => `[${vec.join(',')}]`);

      const { data, error } = await adminClient.rpc('enroll_face_atomic', {
        p_patient_id: params.patientId,
        p_staff_id: params.staffId,
        p_model_version: params.modelVersion,
        p_poses: params.poses,
        p_embeddings: vectorStrings,
        p_consent_id: params.consentId || null,
        p_ticket_id: params.ticketId || null,
      });

      if (error) {
        logger.error({ error, patientId: params.patientId }, 'RPC enroll_face_atomic failed');
        throw new AppError(
          error.message || 'Database error during atomic face enrollment',
          400,
          'ENROLL_RPC_FAILED'
        );
      }

      return data as string;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, patientId: params.patientId }, 'Unexpected error in callEnrollFaceAtomic');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async deleteBiometrics(patientId: string): Promise<void> {
    try {
      const adminClient = getAdminClient();

      // 1. Delete templates
      const { error: err1 } = await adminClient
        .from('face_templates')
        .delete()
        .eq('patient_id', patientId);
      if (err1) {
        logger.error({ err1, patientId }, 'Failed to delete face_templates');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      // 2. Delete / revoke enrollments
      const { error: err2 } = await adminClient
        .from('face_enrollments')
        .delete()
        .eq('patient_id', patientId);
      if (err2) {
        logger.error({ err2, patientId }, 'Failed to delete face_enrollments');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      // 3. Reset patient registration_status to awaiting_face
      const { error: err3 } = await adminClient
        .from('patients')
        .update({
          registration_status: 'awaiting_face',
          updated_at: new Date().toISOString(),
        })
        .eq('id', patientId);
      if (err3) {
        logger.error({ err3, patientId }, 'Failed to reset patient status to awaiting_face');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      // 4. Delete storage files
      await this.deletePatientBiometricStorage(patientId);
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, patientId }, 'Unexpected error in deleteBiometrics');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async rollbackEnrollment(enrollmentId: string, patientId: string): Promise<void> {
    try {
      const adminClient = getAdminClient();
      await adminClient.from('face_templates').delete().eq('enrollment_id', enrollmentId);
      await adminClient.from('face_enrollments').delete().eq('id', enrollmentId);
      await adminClient
        .from('patients')
        .update({
          registration_status: 'awaiting_face',
          updated_at: new Date().toISOString(),
        })
        .eq('id', patientId);
    } catch (err) {
      logger.error({ err, enrollmentId, patientId }, 'Failed to rollback enrollment');
    }
  }
}

let currentFaceEnrollmentRepository: IFaceEnrollmentRepository = new FaceEnrollmentRepository();

export function setDefaultFaceEnrollmentRepository(repo: IFaceEnrollmentRepository): void {
  currentFaceEnrollmentRepository = repo;
}

export const defaultFaceEnrollmentRepository: IFaceEnrollmentRepository = new Proxy(
  {} as unknown as IFaceEnrollmentRepository,
  {
    get(_target, prop) {
      const val = Reflect.get(currentFaceEnrollmentRepository, prop);
      if (typeof val === 'function') {
        return (val as (...args: unknown[]) => unknown).bind(currentFaceEnrollmentRepository);
      }
      return val;
    },
    set(_target, prop, value) {
      return Reflect.set(currentFaceEnrollmentRepository, prop, value);
    },
  }
);
