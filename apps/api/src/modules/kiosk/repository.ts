import crypto from 'crypto';
import { getAdminClient } from '../../lib/supabase/adminClient';
import { logger } from '../../middleware/logger';
import { AppError } from '../../middleware/errorHandler';

export interface PairingRecord {
  kioskId: string;
  codeHash: string; // HMAC-SHA256 hex string ONLY
  expiresAt: Date;
  failedAttempts: number;
  isUsed: boolean;
  isLocked: boolean;
  createdAt: Date;
}

export interface KioskDeviceRecord {
  id: string;
  name: string;
  location: string | null;
  token_hash: string;
  pairing_code_hash: string | null;
  paired_at: string | null;
  is_active: boolean;
}

export interface MissionRunRecord {
  id: string;
  patient_id: string;
  course_id: string;
  run_date: string;
  status: 'pending' | 'in_progress' | 'completed';
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface MissionStepRecord {
  id: string;
  run_id: string;
  step_type: 'exercise' | 'minigame' | 'rest';
  ref_id?: string | null;
  score?: unknown;
  completed_at: string;
  created_at: string;
}

export interface IKioskRepository {
  getKioskById(kioskId: string): Promise<KioskDeviceRecord | null>;
  getKioskByTokenHash(tokenHash: string): Promise<KioskDeviceRecord | null>;
  savePairingRecord(record: PairingRecord): Promise<void>;
  getPairingRecord(kioskId: string): Promise<PairingRecord | null>;
  recordKioskCodeFailure(kioskId: string): Promise<number>;
  recordIpFailure(ip: string): Promise<void>;
  getIpFailureCount(ip: string, windowMs: number): Promise<number>;
  recordGlobalFailure(): Promise<void>;
  getGlobalFailureCount(windowMs: number): Promise<number>;
  markPairingUsed(kioskId: string, tokenHash: string): Promise<void>;
  saveChallenge(nonce: string, kioskId: string, steps: string[], expiresAt: Date): Promise<void>;
  getChallenge(nonce: string): Promise<{ nonce: string; device_id: string; steps: string[]; expires_at: Date; used_at: Date | null; created_at: Date } | null>;
  markChallengeUsed(nonce: string): Promise<void>;
  saveFaceTemplate(patientId: string, embedding: number[], pose?: 'front' | 'left' | 'right' | 'nod'): Promise<void>;
  matchFaceCandidates(probe: number[], candidateIds: string[]): Promise<Array<{ patient_id: string; score: number }>>;
  createStaffCall(kioskId: string, reason: string): Promise<{ id: string; kiosk_id: string; reason: string; created_at: string; handled_by: string | null; handled_at: string | null }>;
  listStaffCalls(kioskId?: string): Promise<Array<{ id: string; kiosk_id: string; reason: string; created_at: string; handled_by: string | null; handled_at: string | null }>>;
  handleStaffCall(id: string, staffId: string): Promise<boolean>;
  createKioskSession(kioskId: string, patientId: string): Promise<{ token: string; kiosk_id: string; patient_id: string; expires_at: Date; confirmed_at: Date | null; is_active: boolean; created_at: Date }>;
  getKioskSession(token: string): Promise<{ token: string; kiosk_id: string; patient_id: string; expires_at: Date; confirmed_at: Date | null; is_active: boolean; created_at: Date } | null>;
  confirmKioskSession(token: string): Promise<{ token: string; kiosk_id: string; patient_id: string; expires_at: Date; confirmed_at: Date | null; is_active: boolean; created_at: Date } | null>;
  invalidateKioskSession(token: string): Promise<void>;
  listDevices(): Promise<KioskDeviceRecord[]>;
  createDevice(name: string, location?: string | null): Promise<KioskDeviceRecord>;
  getOrCreateMissionRun(patientId: string, courseId: string, runDate: string): Promise<MissionRunRecord>;
  recordMissionStep(runId: string, stepType: 'exercise' | 'minigame' | 'rest', refId?: string | null, score?: unknown): Promise<MissionStepRecord>;
  completeMissionRun(patientId: string, courseId: string, runDate: string): Promise<MissionRunRecord>;
  getMissionRunByPatientAndCourse(patientId: string, courseId: string, runDate: string): Promise<MissionRunRecord | null>;
  getFailedFaceAttempts(kioskId: string): number;
  incrementFailedFaceAttempts(kioskId: string): number;
  resetFailedFaceAttempts(kioskId: string): void;
  clearPairings(): void;
}

export class KioskRepository implements IKioskRepository {
  // Ephemeral in-memory state for active sessions & lockout counters
  private failedFaceAttempts = new Map<string, number>();
  private kioskSessions = new Map<string, { token: string; kiosk_id: string; patient_id: string; expires_at: Date; confirmed_at: Date | null; is_active: boolean; created_at: Date }>();
  private ephemeralStaffCalls: Array<{ id: string; kiosk_id: string; reason: string; created_at: string; handled_by: string | null; handled_at: string | null }> = [];

  async getKioskById(kioskId: string): Promise<KioskDeviceRecord | null> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('kiosk_devices')
        .select('id, name, location, token_hash, pairing_code_hash, paired_at, is_active')
        .eq('id', kioskId)
        .maybeSingle();

      if (error) {
        logger.error({ error, kioskId }, 'Failed to query kiosk_devices from Supabase');
        throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return (data as KioskDeviceRecord) || null;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, kioskId }, 'Database connection error in getKioskById');
      throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async getKioskByTokenHash(tokenHash: string): Promise<KioskDeviceRecord | null> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('kiosk_devices')
        .select('id, name, location, token_hash, pairing_code_hash, paired_at, is_active')
        .eq('token_hash', tokenHash)
        .maybeSingle();

      if (error) {
        logger.error({ error }, 'Database error in getKioskByTokenHash');
        return null;
      }

      return (data as KioskDeviceRecord) || null;
    } catch (err) {
      logger.error({ err }, 'Error in getKioskByTokenHash');
      return null;
    }
  }

  async savePairingRecord(record: PairingRecord): Promise<void> {
    const metadataString = JSON.stringify({
      hmac: record.codeHash,
      expires_at: record.expiresAt.getTime(),
      failed_attempts: record.failedAttempts,
      is_locked: record.isLocked,
      is_used: record.isUsed,
    });

    try {
      const adminClient = getAdminClient();
      const { error } = await adminClient
        .from('kiosk_devices')
        .update({
          pairing_code_hash: metadataString,
        })
        .eq('id', record.kioskId);

      if (error) {
        logger.error({ error, kioskId: record.kioskId }, 'Failed to update pairing_code_hash in Supabase');
        throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, kioskId: record.kioskId }, 'Database error in savePairingRecord');
      throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async getPairingRecord(kioskId: string): Promise<PairingRecord | null> {
    const kiosk = await this.getKioskById(kioskId);
    if (!kiosk || !kiosk.pairing_code_hash) {
      return null;
    }

    try {
      const parsed = JSON.parse(kiosk.pairing_code_hash);
      return {
        kioskId: kiosk.id,
        codeHash: parsed.hmac || kiosk.pairing_code_hash,
        expiresAt: new Date(parsed.expires_at || Date.now() + 10 * 60 * 1000),
        failedAttempts: parsed.failed_attempts || 0,
        isUsed: !!parsed.is_used || !!kiosk.paired_at,
        isLocked: !!parsed.is_locked,
        createdAt: new Date(),
      };
    } catch {
      return {
        kioskId: kiosk.id,
        codeHash: kiosk.pairing_code_hash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        failedAttempts: 0,
        isUsed: !!kiosk.paired_at,
        isLocked: false,
        createdAt: new Date(),
      };
    }
  }

  async recordKioskCodeFailure(kioskId: string): Promise<number> {
    const record = await this.getPairingRecord(kioskId);
    if (!record) return 0;

    record.failedAttempts += 1;
    if (record.failedAttempts >= 3) {
      record.isLocked = true;
    }
    await this.savePairingRecord(record);

    try {
      const adminClient = getAdminClient();
      const { error } = await adminClient.from('audit_logs').insert({
        actor_type: 'kiosk',
        action: 'KIOSK_PAIR_FAIL_CODE',
        entity: 'kiosk_devices',
        entity_id: kioskId,
        metadata: {
          kioskId,
          failedAttempts: record.failedAttempts,
          isLocked: record.isLocked,
          timestamp: new Date().toISOString(),
        },
      });

      if (error) {
        logger.error({ error, kioskId }, 'Failed to record kiosk code failure in audit_logs');
        throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, kioskId }, 'Database error in recordKioskCodeFailure');
      throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }

    return record.failedAttempts;
  }

  async recordIpFailure(ip: string): Promise<void> {
    try {
      const adminClient = getAdminClient();
      const { error } = await adminClient.from('audit_logs').insert({
        actor_type: 'kiosk',
        action: 'KIOSK_PAIR_FAIL_IP',
        entity: 'kiosk_devices',
        ip,
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });

      if (error) {
        logger.error({ error, ip }, 'Failed to record IP failure in audit_logs');
        throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, ip }, 'Database error in recordIpFailure');
      throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async getIpFailureCount(ip: string, windowMs: number): Promise<number> {
    const cutoffIso = new Date(Date.now() - windowMs).toISOString();

    try {
      const adminClient = getAdminClient();
      const { count, error } = await adminClient
        .from('audit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('action', 'KIOSK_PAIR_FAIL_IP')
        .eq('ip', ip)
        .gte('created_at', cutoffIso);

      if (error) {
        logger.error({ error, ip }, 'Failed to get IP failure count from Supabase');
        throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return count ?? 0;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, ip }, 'Database error in getIpFailureCount');
      throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async recordGlobalFailure(): Promise<void> {
    try {
      const adminClient = getAdminClient();
      const { error } = await adminClient.from('audit_logs').insert({
        actor_type: 'kiosk',
        action: 'KIOSK_PAIR_FAIL_GLOBAL',
        entity: 'kiosk_devices',
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });

      if (error) {
        logger.error({ error }, 'Failed to record global failure in audit_logs');
        throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err }, 'Database error in recordGlobalFailure');
      throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async getGlobalFailureCount(windowMs: number): Promise<number> {
    const cutoffIso = new Date(Date.now() - windowMs).toISOString();

    try {
      const adminClient = getAdminClient();
      const { count, error } = await adminClient
        .from('audit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('action', 'KIOSK_PAIR_FAIL_GLOBAL')
        .gte('created_at', cutoffIso);

      if (error) {
        logger.error({ error }, 'Failed to get global failure count from Supabase');
        throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return count ?? 0;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err }, 'Database error in getGlobalFailureCount');
      throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async markPairingUsed(kioskId: string, tokenHash: string): Promise<void> {
    try {
      const adminClient = getAdminClient();
      const { error } = await adminClient
        .from('kiosk_devices')
        .update({
          token_hash: tokenHash,
          pairing_code_hash: null, // Revoked once paired
          paired_at: new Date().toISOString(),
          is_active: true,
          last_seen_at: new Date().toISOString(),
        })
        .eq('id', kioskId);

      if (error) {
        logger.error({ error, kioskId }, 'Failed to mark pairing used in Supabase');
        throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, kioskId }, 'Database error in markPairingUsed');
      throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  // =========================================================================
  // FACE AUTHENTICATION & CHALLENGE STORE
  // =========================================================================

  async saveChallenge(nonce: string, kioskId: string, steps: string[], expiresAt: Date): Promise<void> {
    try {
      const adminClient = getAdminClient();
      const { error } = await adminClient.from('face_challenges').insert({
        nonce,
        device_id: kioskId,
        steps,
        expires_at: expiresAt.toISOString(),
      });

      if (error) {
        logger.error({ error, nonce, kioskId }, 'Failed to save challenge in Supabase');
        throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, nonce, kioskId }, 'Database error in saveChallenge');
      throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async getChallenge(nonce: string): Promise<{ nonce: string; device_id: string; steps: string[]; expires_at: Date; used_at: Date | null; created_at: Date } | null> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('face_challenges')
        .select('*')
        .eq('nonce', nonce)
        .maybeSingle();

      if (error) {
        logger.error({ error, nonce }, 'Failed to get challenge from Supabase');
        throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      if (!data) return null;

      return {
        nonce: data.nonce,
        device_id: data.device_id,
        steps: data.steps,
        expires_at: new Date(data.expires_at),
        used_at: data.used_at ? new Date(data.used_at) : null,
        created_at: new Date(data.created_at),
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, nonce }, 'Database error in getChallenge');
      throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async markChallengeUsed(nonce: string): Promise<void> {
    const now = new Date().toISOString();
    try {
      const adminClient = getAdminClient();
      const { error } = await adminClient
        .from('face_challenges')
        .update({ used_at: now })
        .eq('nonce', nonce);

      if (error) {
        logger.error({ error, nonce }, 'Failed to mark challenge used in Supabase');
        throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, nonce }, 'Database error in markChallengeUsed');
      throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async saveFaceTemplate(
    patientId: string,
    embedding: number[],
    pose: 'front' | 'left' | 'right' | 'nod' = 'front'
  ): Promise<void> {
    const id = crypto.randomUUID();
    const enrollmentId = crypto.randomUUID();

    try {
      const adminClient = getAdminClient();
      await adminClient.from('face_enrollments').upsert({
        id: enrollmentId,
        patient_id: patientId,
        status: 'active',
        model_version: 'adaface-ir50-v1',
      });

      const { error } = await adminClient.from('face_templates').insert({
        id,
        patient_id: patientId,
        enrollment_id: enrollmentId,
        embedding: `[${embedding.join(',')}]`,
        pose,
        model_version: 'adaface-ir50-v1',
      });

      if (error) {
        logger.error({ error, patientId }, 'Failed to save face template in Supabase');
        throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, patientId }, 'Database error in saveFaceTemplate');
      throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async matchFaceCandidates(
    probe: number[],
    candidateIds: string[]
  ): Promise<Array<{ patient_id: string; score: number }>> {
    if (!candidateIds || candidateIds.length === 0) {
      return [];
    }

    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient.rpc('match_face_candidates', {
        probe: `[${probe.join(',')}]`,
        candidate_ids: candidateIds,
        k: 10,
      });

      if (error) {
        logger.error({ error, candidateCount: candidateIds.length }, 'Failed to match face candidates via Supabase RPC');
        throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return (data as Array<{ patient_id: string; score: number }>) || [];
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, candidateCount: candidateIds.length }, 'Database error in matchFaceCandidates');
      throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async createStaffCall(kioskId: string, reason: string): Promise<{ id: string; kiosk_id: string; reason: string; created_at: string; handled_by: string | null; handled_at: string | null }> {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient.from('staff_calls').insert({
        id,
        kiosk_id: kioskId,
        reason,
        created_at: createdAt,
      }).select().single();

      if (error) {
        logger.error({ error, kioskId, reason }, 'Failed to create staff call in Supabase');
        throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      const record = data as { id: string; kiosk_id: string; reason: string; created_at: string; handled_by: string | null; handled_at: string | null };
      this.ephemeralStaffCalls.unshift(record);
      return record;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, kioskId }, 'Database error in createStaffCall');
      throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async listStaffCalls(kioskId?: string): Promise<Array<{ id: string; kiosk_id: string; reason: string; created_at: string; handled_by: string | null; handled_at: string | null }>> {
    try {
      const adminClient = getAdminClient();
      let query = adminClient
        .from('staff_calls')
        .select('id, kiosk_id, reason, created_at, handled_by, handled_at')
        .order('created_at', { ascending: false })
        .limit(50);

      if (kioskId) {
        query = query.eq('kiosk_id', kioskId);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error, kioskId }, 'Failed to list staff calls from Supabase');
        throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return (data as Array<{ id: string; kiosk_id: string; reason: string; created_at: string; handled_by: string | null; handled_at: string | null }>) || [];
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, kioskId }, 'Database error in listStaffCalls');
      throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  getStaffCalls(kioskId?: string): Array<{ id: string; kiosk_id: string; reason: string; created_at: string; handled_by: string | null; handled_at: string | null }> {
    return this.ephemeralStaffCalls.filter((s) => !kioskId || s.kiosk_id === kioskId);
  }

  async handleStaffCall(id: string, staffId: string): Promise<boolean> {
    const handledAt = new Date().toISOString();
    try {
      const adminClient = getAdminClient();
      const { error } = await adminClient
        .from('staff_calls')
        .update({ handled_by: staffId, handled_at: handledAt })
        .eq('id', id);

      if (error) {
        logger.error({ error, id, staffId }, 'Failed to handle staff call in Supabase');
        throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return true;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, id, staffId }, 'Database error in handleStaffCall');
      throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  getFailedFaceAttempts(kioskId: string): number {
    return this.failedFaceAttempts.get(kioskId) || 0;
  }

  incrementFailedFaceAttempts(kioskId: string): number {
    const current = this.getFailedFaceAttempts(kioskId);
    const updated = current + 1;
    this.failedFaceAttempts.set(kioskId, updated);
    return updated;
  }

  resetFailedFaceAttempts(kioskId: string): void {
    this.failedFaceAttempts.set(kioskId, 0);
  }

  async createKioskSession(kioskId: string, patientId: string): Promise<{ token: string; kiosk_id: string; patient_id: string; expires_at: Date; confirmed_at: Date | null; is_active: boolean; created_at: Date }> {
    const token = `ksession_${crypto.randomUUID()}_${Date.now()}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
    const session = {
      token,
      kiosk_id: kioskId,
      patient_id: patientId,
      expires_at: expiresAt,
      confirmed_at: null,
      is_active: true,
      created_at: new Date(),
    };
    this.kioskSessions.set(token, session);
    return session;
  }

  async getKioskSession(token: string): Promise<{ token: string; kiosk_id: string; patient_id: string; expires_at: Date; confirmed_at: Date | null; is_active: boolean; created_at: Date } | null> {
    const s = this.kioskSessions.get(token);
    if (!s || !s.is_active || s.expires_at < new Date()) {
      return null;
    }
    return s;
  }

  async confirmKioskSession(token: string): Promise<{ token: string; kiosk_id: string; patient_id: string; expires_at: Date; confirmed_at: Date | null; is_active: boolean; created_at: Date } | null> {
    const s = await this.getKioskSession(token);
    if (!s) return null;
    s.confirmed_at = new Date();
    return s;
  }

  async invalidateKioskSession(token: string): Promise<void> {
    const s = this.kioskSessions.get(token);
    if (s) {
      s.is_active = false;
    }
  }

  async listDevices(): Promise<KioskDeviceRecord[]> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('kiosk_devices')
        .select('id, name, location, token_hash, pairing_code_hash, paired_at, is_active')
        .order('name');

      if (error) {
        logger.error({ error }, 'Failed to list devices from Supabase');
        throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return (data as KioskDeviceRecord[]) || [];
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err }, 'Database error in listDevices');
      throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async createDevice(name: string, location?: string | null): Promise<KioskDeviceRecord> {
    const id = crypto.randomUUID();
    const tokenHash = crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex');
    const record: KioskDeviceRecord = {
      id,
      name,
      location: location || null,
      token_hash: tokenHash,
      pairing_code_hash: null,
      paired_at: null,
      is_active: false,
    };

    try {
      const adminClient = getAdminClient();
      const { error } = await adminClient.from('kiosk_devices').insert(record);

      if (error) {
        logger.error({ error, name }, 'Failed to create device in Supabase');
        throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return record;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, name }, 'Database error in createDevice');
      throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  // =========================================================================
  // 5. DAILY MISSION RUNS & MISSION STEPS (Master Prompt v3 Section 9 & 14)
  // =========================================================================

  async getOrCreateMissionRun(
    patientId: string,
    courseId: string,
    runDate: string
  ): Promise<MissionRunRecord> {
    try {
      const adminClient = getAdminClient();
      const { data: existing, error: selectError } = await adminClient
        .from('mission_runs')
        .select('*')
        .eq('patient_id', patientId)
        .eq('course_id', courseId)
        .eq('run_date', runDate)
        .maybeSingle();

      if (selectError) {
        logger.error({ error: selectError, patientId, courseId, runDate }, 'Failed to query mission_runs in Supabase');
        throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      if (existing) {
        return existing as MissionRunRecord;
      }

      const newRun: MissionRunRecord = {
        id: crypto.randomUUID(),
        patient_id: patientId,
        course_id: courseId,
        run_date: runDate,
        status: 'pending',
        started_at: null,
        finished_at: null,
        created_at: new Date().toISOString(),
      };

      const { data: inserted, error: insertError } = await adminClient
        .from('mission_runs')
        .insert(newRun)
        .select()
        .single();

      if (insertError) {
        logger.error({ error: insertError, patientId, courseId, runDate }, 'Failed to insert mission_run in Supabase');
        throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return inserted as MissionRunRecord;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, patientId, courseId, runDate }, 'Database error in getOrCreateMissionRun');
      throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async recordMissionStep(
    runId: string,
    stepType: 'exercise' | 'minigame' | 'rest',
    refId?: string,
    score?: unknown
  ): Promise<MissionStepRecord> {
    const step: MissionStepRecord = {
      id: crypto.randomUUID(),
      run_id: runId,
      step_type: stepType,
      ref_id: refId || null,
      score: score || null,
      completed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    try {
      const adminClient = getAdminClient();
      const { error: stepError } = await adminClient.from('mission_steps').insert(step);
      if (stepError) {
        logger.error({ error: stepError, runId, stepType }, 'Failed to insert mission_step in Supabase');
        throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      await adminClient
        .from('mission_runs')
        .update({ status: 'in_progress', started_at: new Date().toISOString() })
        .eq('id', runId)
        .eq('status', 'pending');

      return step;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, runId, stepType }, 'Database error in recordMissionStep');
      throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async completeMissionRun(
    patientId: string,
    courseId: string,
    runDate: string
  ): Promise<MissionRunRecord> {
    const nowIso = new Date().toISOString();

    try {
      const run = await this.getOrCreateMissionRun(patientId, courseId, runDate);

      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('mission_runs')
        .update({
          status: 'completed',
          finished_at: nowIso,
        })
        .eq('id', run.id)
        .select()
        .single();

      if (error) {
        logger.error({ error, runId: run.id }, 'Failed to complete mission_run in Supabase');
        throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return data as MissionRunRecord;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, patientId, courseId, runDate }, 'Database error in completeMissionRun');
      throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async getMissionRunByPatientAndCourse(
    patientId: string,
    courseId: string,
    runDate: string
  ): Promise<MissionRunRecord | null> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('mission_runs')
        .select('*')
        .eq('patient_id', patientId)
        .eq('course_id', courseId)
        .eq('run_date', runDate)
        .maybeSingle();

      if (error) {
        logger.error({ error, patientId, courseId, runDate }, 'Failed to get mission_run from Supabase');
        throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return (data as MissionRunRecord) || null;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, patientId, courseId, runDate }, 'Database error in getMissionRunByPatientAndCourse');
      throw new AppError('Kiosk service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  clearPairings(): void {
    this.failedFaceAttempts.clear();
    this.kioskSessions.clear();
    this.ephemeralStaffCalls = [];
  }
}

let _currentKioskRepo: IKioskRepository = new KioskRepository();
export const defaultKioskRepository: IKioskRepository = new Proxy({} as IKioskRepository, {
  get(_target, prop) {
    const val = Reflect.get(_currentKioskRepo, prop);
    return typeof val === 'function' ? (val as (...args: unknown[]) => unknown).bind(_currentKioskRepo) : val;
  },
  set(_target, prop, value) {
    return Reflect.set(_currentKioskRepo, prop, value);
  },
});
export const setDefaultKioskRepository = (repo: IKioskRepository) => {
  _currentKioskRepo = repo;
};
