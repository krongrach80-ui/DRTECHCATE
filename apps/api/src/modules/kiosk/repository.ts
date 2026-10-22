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

  async getKioskById(kioskId: string): Promise<KioskDeviceRecord | null> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('kiosk_devices')
        .select('id, name, location, token_hash, pairing_code_hash, paired_at, is_active')
        .eq('id', kioskId)
        .maybeSingle();

      if (error || !data) {
        return null;
      }
      return data as KioskDeviceRecord;
    } catch {
      return null;
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
        action: 'KIOSK_PAIR_FAIL_CODE',
        target_table: 'kiosk_devices',
        target_id: kioskId,
        details: {
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
        action: 'KIOSK_PAIR_FAIL_IP',
        target_table: 'bans',
        details: {
          ip,
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
        .contains('details', { ip })
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
        action: 'KIOSK_PAIR_FAIL_GLOBAL',
        target_table: 'kiosk_devices',
        details: {
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

  clearPairings(): void {
    this.pairingStore.clear();
    this.attemptsLog = [];
  }
}
