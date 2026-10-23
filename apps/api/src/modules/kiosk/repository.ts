import crypto from 'crypto';
import { getAdminClient } from '../../lib/supabase/adminClient';

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

export interface AttemptEntry {
  key: string;
  type: 'ip' | 'kiosk' | 'global';
  timestamp: number;
}

export class KioskRepository {
  // In-memory cache for fast lookups, mirrored to PostgreSQL
  private pairingStore = new Map<string, PairingRecord>();
  // In-memory attempt log for test environments, mirrored to PostgreSQL audit_logs
  private attemptsLog: AttemptEntry[] = [];
  // In-memory devices store for test environments
  private devices: KioskDeviceRecord[] = [];
  // In-memory daily mission runs and steps
  private missionRuns = new Map<string, MissionRunRecord>();
  private missionSteps: MissionStepRecord[] = [];

  async getKioskById(kioskId: string): Promise<KioskDeviceRecord | null> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('kiosk_devices')
        .select('id, name, location, token_hash, pairing_code_hash, paired_at, is_active')
        .eq('id', kioskId)
        .maybeSingle();

      if (error || !data) {
        return this.devices.find((d) => d.id === kioskId) || null;
      }
      return data as KioskDeviceRecord;
    } catch {
      return this.devices.find((d) => d.id === kioskId) || null;
    }
  }

  async savePairingRecord(record: PairingRecord): Promise<void> {
    this.pairingStore.set(record.kioskId, { ...record });

    // Synchronize to PostgreSQL kiosk_devices table
    // Serializes HMAC, expiry, attempt count and lock status into pairing_code_hash metadata
    const metadataString = JSON.stringify({
      hmac: record.codeHash,
      expires_at: record.expiresAt.getTime(),
      failed_attempts: record.failedAttempts,
      is_locked: record.isLocked,
      is_used: record.isUsed,
    });

    try {
      const adminClient = getAdminClient();
      await adminClient
        .from('kiosk_devices')
        .update({
          pairing_code_hash: metadataString,
        })
        .eq('id', record.kioskId);
    } catch {
      // Non-blocking in mock/offline environment
    }
  }

  async getPairingRecord(kioskId: string): Promise<PairingRecord | null> {
    const cached = this.pairingStore.get(kioskId);
    if (cached) {
      return { ...cached };
    }

    // Load from PostgreSQL kiosk_devices
    const kiosk = await this.getKioskById(kioskId);
    if (kiosk?.pairing_code_hash) {
      try {
        const parsed = JSON.parse(kiosk.pairing_code_hash);
        const record: PairingRecord = {
          kioskId: kiosk.id,
          codeHash: parsed.hmac || kiosk.pairing_code_hash,
          expiresAt: new Date(parsed.expires_at || Date.now() + 10 * 60 * 1000),
          failedAttempts: parsed.failed_attempts || 0,
          isUsed: !!parsed.is_used || !!kiosk.paired_at,
          isLocked: !!parsed.is_locked,
          createdAt: new Date(),
        };
        this.pairingStore.set(kioskId, record);
        return record;
      } catch {
        const fallbackRecord: PairingRecord = {
          kioskId: kiosk.id,
          codeHash: kiosk.pairing_code_hash,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          failedAttempts: 0,
          isUsed: !!kiosk.paired_at,
          isLocked: false,
          createdAt: new Date(),
        };
        this.pairingStore.set(kioskId, fallbackRecord);
        return fallbackRecord;
      }
    }

    return null;
  }

  /**
   * Records a failed pairing attempt for a specific kiosk code in DB
   */
  async recordKioskCodeFailure(kioskId: string): Promise<number> {
    const record = await this.getPairingRecord(kioskId);
    if (!record) return 0;

    record.failedAttempts += 1;
    if (record.failedAttempts >= 3) {
      record.isLocked = true;
    }
    await this.savePairingRecord(record);

    // Also record in DB audit_logs
    try {
      const adminClient = getAdminClient();
      await adminClient.from('audit_logs').insert({
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
    } catch {
      // Fallback
    }

    return record.failedAttempts;
  }

  /**
   * Records an IP-level failure in DB
   */
  async recordIpFailure(ip: string): Promise<void> {
    const now = Date.now();
    this.attemptsLog.push({ key: ip, type: 'ip', timestamp: now });

    try {
      const adminClient = getAdminClient();
      await adminClient.from('audit_logs').insert({
        actor_type: 'kiosk',
        action: 'KIOSK_PAIR_FAIL_IP',
        entity: 'kiosk_devices',
        ip,
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch {
      // Fallback
    }
  }

  /**
   * Gets IP-level failure count in window from DB
   */
  async getIpFailureCount(ip: string, windowMs: number): Promise<number> {
    const cutoff = Date.now() - windowMs;

    // Check DB audit_logs
    try {
      const adminClient = getAdminClient();
      const cutoffIso = new Date(cutoff).toISOString();
      const { count } = await adminClient
        .from('audit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('action', 'KIOSK_PAIR_FAIL_IP')
        .eq('ip', ip)
        .gte('created_at', cutoffIso);

      if (typeof count === 'number' && count > 0) {
        return count;
      }
    } catch {
      // Fallback
    }

    return this.attemptsLog.filter((a) => a.type === 'ip' && a.key === ip && a.timestamp >= cutoff).length;
  }

  /**
   * Records a Global failure in DB
   */
  async recordGlobalFailure(): Promise<void> {
    const now = Date.now();
    this.attemptsLog.push({ key: 'global', type: 'global', timestamp: now });

    try {
      const adminClient = getAdminClient();
      await adminClient.from('audit_logs').insert({
        actor_type: 'kiosk',
        action: 'KIOSK_PAIR_FAIL_GLOBAL',
        entity: 'kiosk_devices',
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch {
      // Fallback
    }
  }

  /**
   * Gets Global failure count in window from DB
   */
  async getGlobalFailureCount(windowMs: number): Promise<number> {
    const cutoff = Date.now() - windowMs;

    try {
      const adminClient = getAdminClient();
      const cutoffIso = new Date(cutoff).toISOString();
      const { count } = await adminClient
        .from('audit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('action', 'KIOSK_PAIR_FAIL_GLOBAL')
        .gte('created_at', cutoffIso);

      if (typeof count === 'number' && count > 0) {
        return count;
      }
    } catch {
      // Fallback
    }

    return this.attemptsLog.filter((a) => a.type === 'global' && a.timestamp >= cutoff).length;
  }

  /**
   * Marks pairing code as used in DB
   */
  async markPairingUsed(kioskId: string, tokenHash: string): Promise<void> {
    const record = await this.getPairingRecord(kioskId);
    if (record) {
      record.isUsed = true;
      await this.savePairingRecord(record);
    }

    try {
      const adminClient = getAdminClient();
      await adminClient
        .from('kiosk_devices')
        .update({
          token_hash: tokenHash,
          pairing_code_hash: null, // Revoked once paired
          paired_at: new Date().toISOString(),
          is_active: true,
          last_seen_at: new Date().toISOString(),
        })
        .eq('id', kioskId);
    } catch {
      // Non-blocking
    }
  }

  // =========================================================================
  // FACE AUTHENTICATION & CHALLENGE STORE
  // =========================================================================
  private challenges = new Map<string, { nonce: string; device_id: string; steps: string[]; expires_at: Date; used_at: Date | null; created_at: Date }>();
  private faceTemplates: Array<{ id: string; patient_id: string; enrollment_id: string; embedding: number[]; pose: 'front' | 'left' | 'right' | 'nod'; model_version: string; created_at: string }> = [];
  private staffCalls: Array<{ id: string; kiosk_id: string; reason: string; created_at: string; handled_by: string | null; handled_at: string | null }> = [];
  private failedFaceAttempts = new Map<string, number>();
  private kioskSessions = new Map<string, { token: string; kiosk_id: string; patient_id: string; expires_at: Date; confirmed_at: Date | null; is_active: boolean; created_at: Date }>();

  async saveChallenge(nonce: string, kioskId: string, steps: string[], expiresAt: Date): Promise<void> {
    const record = {
      nonce,
      device_id: kioskId,
      steps,
      expires_at: expiresAt,
      used_at: null,
      created_at: new Date(),
    };
    this.challenges.set(nonce, record);

    try {
      const adminClient = getAdminClient();
      await adminClient.from('face_challenges').insert({
        nonce,
        device_id: kioskId,
        steps,
        expires_at: expiresAt.toISOString(),
      });
    } catch {
      // fallback
    }
  }

  async getChallenge(nonce: string): Promise<{ nonce: string; device_id: string; steps: string[]; expires_at: Date; used_at: Date | null; created_at: Date } | null> {
    const mem = this.challenges.get(nonce);
    if (mem) return mem;

    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('face_challenges')
        .select('*')
        .eq('nonce', nonce)
        .maybeSingle();

      if (!error && data) {
        return {
          nonce: data.nonce,
          device_id: data.device_id,
          steps: data.steps,
          expires_at: new Date(data.expires_at),
          used_at: data.used_at ? new Date(data.used_at) : null,
          created_at: new Date(data.created_at),
        };
      }
    } catch {
      // fallback
    }
    return null;
  }

  async markChallengeUsed(nonce: string): Promise<void> {
    const mem = this.challenges.get(nonce);
    const now = new Date();
    if (mem) {
      mem.used_at = now;
    }

    try {
      const adminClient = getAdminClient();
      await adminClient
        .from('face_challenges')
        .update({ used_at: now.toISOString() })
        .eq('nonce', nonce);
    } catch {
      // fallback
    }
  }

  async saveFaceTemplate(
    patientId: string,
    embedding: number[],
    pose: 'front' | 'left' | 'right' | 'nod' = 'front'
  ): Promise<void> {
    const template = {
      id: Math.random().toString(36).slice(2),
      patient_id: patientId,
      enrollment_id: Math.random().toString(36).slice(2),
      embedding,
      pose,
      model_version: 'adaface-ir50-v1',
      created_at: new Date().toISOString(),
    };
    this.faceTemplates.push(template);

    try {
      const adminClient = getAdminClient();
      await adminClient.from('face_templates').insert({
        id: template.id,
        patient_id: patientId,
        enrollment_id: template.enrollment_id,
        embedding: `[${embedding.join(',')}]`,
        pose,
        model_version: 'adaface-ir50-v1',
      });
    } catch {
      // fallback
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

      if (!error && data && Array.isArray(data) && data.length > 0) {
        return data as Array<{ patient_id: string; score: number }>;
      }
    } catch {
      // fallback
    }

    // In-Memory matching: Cosine similarity of probe against candidate templates
    const candidateSet = new Set(candidateIds);
    const scoresByPatient = new Map<string, number[]>();

    for (const t of this.faceTemplates) {
      if (candidateSet.has(t.patient_id)) {
        // Dot product between normalized vectors
        let dot = 0;
        for (let i = 0; i < probe.length; i++) {
          dot += probe[i] * t.embedding[i];
        }
        const existing = scoresByPatient.get(t.patient_id) || [];
        existing.push(dot);
        scoresByPatient.set(t.patient_id, existing);
      }
    }

    const results: Array<{ patient_id: string; score: number }> = [];
    for (const [patientId, scores] of scoresByPatient.entries()) {
      // Top 3 scores average
      scores.sort((a, b) => b - a);
      const top3 = scores.slice(0, 3);
      const avg = top3.reduce((sum, v) => sum + v, 0) / top3.length;
      results.push({ patient_id: patientId, score: avg });
    }

    results.sort((a, b) => b.score - a.score);
    return results;
  }

  async createStaffCall(kioskId: string, reason: string): Promise<{ id: string; kiosk_id: string; reason: string; created_at: string; handled_by: string | null; handled_at: string | null }> {
    const call = {
      id: Math.random().toString(36).slice(2),
      kiosk_id: kioskId,
      reason,
      created_at: new Date().toISOString(),
      handled_by: null,
      handled_at: null,
    };
    this.staffCalls.push(call);

    try {
      const adminClient = getAdminClient();
      await adminClient.from('staff_calls').insert({
        id: call.id,
        kiosk_id: kioskId,
        reason,
      });
    } catch {
      // fallback
    }

    return call;
  }

  getStaffCalls(kioskId?: string): Array<{ id: string; kiosk_id: string; reason: string; created_at: string; handled_by: string | null; handled_at: string | null }> {
    if (kioskId) {
      return this.staffCalls.filter((c) => c.kiosk_id === kioskId);
    }
    return this.staffCalls;
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
    const token = `ksession_${Math.random().toString(36).slice(2)}_${Date.now()}`;
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
      if (!error && data && data.length > 0) {
        return data as KioskDeviceRecord[];
      }
    } catch {
      // fallback
    }
    return [...this.devices];
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
      await adminClient.from('kiosk_devices').insert(record);
    } catch {
      // fallback
    }
    this.devices.push(record);
    return record;
  }

  async listStaffCalls(): Promise<Array<{ id: string; kiosk_id: string; reason: string; created_at: string; handled_by: string | null; handled_at: string | null }>> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('staff_calls')
        .select('id, kiosk_id, reason, created_at, handled_by, handled_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (!error && data && data.length > 0) {
        return data;
      }
    } catch {
      // fallback
    }
    return [...this.staffCalls].reverse();
  }

  async handleStaffCall(id: string, staffId: string): Promise<boolean> {
    const mem = this.staffCalls.find((c) => c.id === id);
    if (mem) {
      mem.handled_by = staffId;
      mem.handled_at = new Date().toISOString();
    }
    try {
      const adminClient = getAdminClient();
      await adminClient
        .from('staff_calls')
        .update({ handled_by: staffId, handled_at: new Date().toISOString() })
        .eq('id', id);
      return true;
    } catch {
      return !!mem;
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
    const key = `${patientId}:${courseId}:${runDate}`;
    let run = this.missionRuns.get(key);

    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('mission_runs')
        .select('*')
        .eq('patient_id', patientId)
        .eq('course_id', courseId)
        .eq('run_date', runDate)
        .maybeSingle();

      if (!error && data) {
        run = data as MissionRunRecord;
        this.missionRuns.set(key, run);
        return run;
      }
    } catch {
      // fallback
    }

    if (!run) {
      run = {
        id: crypto.randomUUID(),
        patient_id: patientId,
        course_id: courseId,
        run_date: runDate,
        status: 'pending',
        started_at: null,
        finished_at: null,
        pain_score: null,
        feedback: null,
        created_at: new Date().toISOString(),
      };

      try {
        const adminClient = getAdminClient();
        await adminClient.from('mission_runs').insert(run);
      } catch {
        // fallback
      }

      this.missionRuns.set(key, run);
    }

    return run;
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

    // Update parent mission run status to in_progress if currently pending
    for (const run of this.missionRuns.values()) {
      if (run.id === runId) {
        if (run.status === 'pending') {
          run.status = 'in_progress';
          run.started_at = new Date().toISOString();
        }
        break;
      }
    }

    try {
      const adminClient = getAdminClient();
      await adminClient.from('mission_steps').insert(step);
      await adminClient
        .from('mission_runs')
        .update({ status: 'in_progress', started_at: new Date().toISOString() })
        .eq('id', runId)
        .eq('status', 'pending');
    } catch {
      // fallback
    }

    this.missionSteps.push(step);
    return step;
  }

  async completeMissionRun(
    patientId: string,
    courseId: string,
    runDate: string,
    painScore?: number,
    feedback?: string
  ): Promise<MissionRunRecord | null> {
    const key = `${patientId}:${courseId}:${runDate}`;
    let run = this.missionRuns.get(key);

    if (!run) {
      run = await this.getOrCreateMissionRun(patientId, courseId, runDate);
    }

    const nowIso = new Date().toISOString();
    run.status = 'completed';
    run.finished_at = nowIso;
    if (painScore !== undefined) run.pain_score = painScore;
    if (feedback !== undefined) run.feedback = feedback;

    try {
      const adminClient = getAdminClient();
      await adminClient
        .from('mission_runs')
        .update({
          status: 'completed',
          finished_at: nowIso,
          pain_score: painScore ?? null,
          feedback: feedback ?? null,
        })
        .eq('id', run.id);
    } catch {
      // fallback
    }

    return run;
  }

  async getMissionRunByPatientAndCourse(
    patientId: string,
    courseId: string,
    runDate: string
  ): Promise<MissionRunRecord | null> {
    const key = `${patientId}:${courseId}:${runDate}`;
    const mem = this.missionRuns.get(key);
    if (mem) return mem;

    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('mission_runs')
        .select('*')
        .eq('patient_id', patientId)
        .eq('course_id', courseId)
        .eq('run_date', runDate)
        .maybeSingle();

      if (!error && data) {
        return data as MissionRunRecord;
      }
    } catch {
      // fallback
    }

    return null;
  }

  clearPairings(): void {
    this.pairingStore.clear();
    this.attemptsLog = [];
    this.challenges.clear();
    this.faceTemplates = [];
    this.staffCalls = [];
    this.failedFaceAttempts.clear();
    this.kioskSessions.clear();
    this.devices = [];
    this.missionRuns.clear();
    this.missionSteps = [];
  }
}

export interface MissionRunRecord {
  id: string;
  patient_id: string;
  course_id: string;
  run_date: string;
  status: 'pending' | 'in_progress' | 'completed';
  started_at: string | null;
  finished_at: string | null;
  pain_score?: number | null;
  feedback?: string | null;
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

export const defaultKioskRepository = new KioskRepository();

