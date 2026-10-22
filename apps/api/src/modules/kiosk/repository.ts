import { getAdminClient } from '../../lib/supabase/adminClient';

export interface PairingRecord {
  kioskId: string;
  codeHash: string; // SHA-256 hex string ONLY
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

export class KioskRepository {
  // In-memory store for active pairing sessions (synchronized with DB pairing_code_hash)
  private pairingStore = new Map<string, PairingRecord>();

  async getKioskById(kioskId: string): Promise<KioskDeviceRecord | null> {
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
  }

  async savePairingRecord(record: PairingRecord): Promise<void> {
    // Store in-memory session
    this.pairingStore.set(record.kioskId, { ...record });

    // Synchronize hash to Supabase kiosk_devices table
    try {
      const adminClient = getAdminClient();
      await adminClient
        .from('kiosk_devices')
        .update({
          pairing_code_hash: record.codeHash,
        })
        .eq('id', record.kioskId);
    } catch {
      // Non-blocking in offline/mock environment
    }
  }

  async getPairingRecord(kioskId: string): Promise<PairingRecord | null> {
    const record = this.pairingStore.get(kioskId);
    if (record) {
      return { ...record };
    }

    // Fallback: check if DB has a pairing_code_hash
    const kiosk = await this.getKioskById(kioskId);
    if (kiosk?.pairing_code_hash) {
      const fallbackRecord: PairingRecord = {
        kioskId: kiosk.id,
        codeHash: kiosk.pairing_code_hash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // Default 10 min
        failedAttempts: 0,
        isUsed: !!kiosk.paired_at,
        isLocked: false,
        createdAt: new Date(),
      };
      this.pairingStore.set(kioskId, fallbackRecord);
      return fallbackRecord;
    }

    return null;
  }

  async incrementFailedAttempts(kioskId: string): Promise<number> {
    const record = this.pairingStore.get(kioskId);
    if (!record) return 0;

    record.failedAttempts += 1;
    if (record.failedAttempts >= 3) {
      record.isLocked = true;
    }
    this.pairingStore.set(kioskId, record);
    return record.failedAttempts;
  }

  async markPairingUsed(kioskId: string, tokenHash: string): Promise<void> {
    const record = this.pairingStore.get(kioskId);
    if (record) {
      record.isUsed = true;
      this.pairingStore.set(kioskId, record);
    }

    // Update DB
    try {
      const adminClient = getAdminClient();
      await adminClient
        .from('kiosk_devices')
        .update({
          token_hash: tokenHash,
          pairing_code_hash: null, // Clear code once redeemed
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
  }
}
