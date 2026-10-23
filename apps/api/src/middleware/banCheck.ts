import { Request, Response, NextFunction } from 'express';

// In-memory maps for active bans (value -> expiresAt in ms or null for permanent)
const bannedIps = new Map<string, number | null>();
const bannedDevices = new Map<string, number | null>();
const bannedAccounts = new Map<string, number | null>();

/**
 * Checks whether an entry is active in the map, expiring it if past expiresAt.
 */
function isEntryActive(map: Map<string, number | null>, key: string): boolean {
  if (!map.has(key)) return false;
  const expiresAt = map.get(key);
  if (expiresAt !== null && expiresAt !== undefined && Date.now() >= expiresAt) {
    map.delete(key);
    return false;
  }
  return true;
}

export function isIpBanned(ip: string): boolean {
  return isEntryActive(bannedIps, ip);
}

export function isDeviceBanned(deviceId: string): boolean {
  return isEntryActive(bannedDevices, deviceId);
}

export function isAccountBanned(account: string): boolean {
  return isEntryActive(bannedAccounts, account.trim().toLowerCase());
}

export function addActiveBan(
  type: 'ip' | 'device' | 'account',
  value: string,
  expiresAtIso?: string | null
): void {
  const expiresAtMs = expiresAtIso ? new Date(expiresAtIso).getTime() : null;
  if (type === 'ip') {
    bannedIps.set(value, expiresAtMs);
  } else if (type === 'device') {
    bannedDevices.set(value, expiresAtMs);
  } else if (type === 'account') {
    bannedAccounts.set(value.trim().toLowerCase(), expiresAtMs);
  }
}

export function removeActiveBan(type: 'ip' | 'device' | 'account', value: string): void {
  if (type === 'ip') {
    bannedIps.delete(value);
  } else if (type === 'device') {
    bannedDevices.delete(value);
  } else if (type === 'account') {
    bannedAccounts.delete(value.trim().toLowerCase());
  }
}

export function syncActiveBans(
  bans: Array<{ type: string; value: string; expires_at?: string | null }>
): void {
  bannedIps.clear();
  bannedDevices.clear();
  bannedAccounts.clear();
  const now = Date.now();

  for (const b of bans) {
    const expiresAtMs = b.expires_at ? new Date(b.expires_at).getTime() : null;
    if (expiresAtMs !== null && expiresAtMs <= now) {
      continue; // Skip expired
    }
    if (b.type === 'ip') {
      bannedIps.set(b.value, expiresAtMs);
    } else if (b.type === 'device') {
      bannedDevices.set(b.value, expiresAtMs);
    } else if (b.type === 'account') {
      bannedAccounts.set(b.value.trim().toLowerCase(), expiresAtMs);
    }
  }
}

export function clearAllBans(): void {
  bannedIps.clear();
  bannedDevices.clear();
  bannedAccounts.clear();
}

/**
 * Hydrates in-memory active ban list directly from Postgres 'bans' table.
 * If this query fails during boot, the error propagates so server refuses to start (fail-closed).
 */
export async function syncBansFromDatabase(): Promise<void> {
  const { getAdminClient } = await import('../lib/supabase/adminClient');
  const adminClient = getAdminClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await adminClient
    .from('bans')
    .select('type, value, expires_at')
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`);

  if (error) {
    throw new Error(`FATAL: Failed to sync active bans from 'bans' table at startup: ${error.message}`);
  }

  syncActiveBans((data as Array<{ type: string; value: string; expires_at?: string | null }>) || []);
}

// Backward compatibility helpers for existing test suites
export function setBannedIps(ips: string[]): void {
  bannedIps.clear();
  ips.forEach((ip) => bannedIps.set(ip, null));
}

export function addBannedIp(ip: string): void {
  bannedIps.set(ip, null);
}

export function removeBannedIp(ip: string): void {
  bannedIps.delete(ip);
}

/**
 * BanCheck Middleware:
 * Master Prompt v3 Section 5 & Section 6:
 * Enforces active IP and device bans. Expired bans must NOT block requests.
 */
export function banCheck(req: Request, res: Response, next: NextFunction): void {
  const clientIp = (req.ip || req.socket.remoteAddress || '').replace(/^.*:/, '');
  const deviceId = req.cookies?.staff_device_id;

  // 1. Check IP ban
  if (clientIp && isIpBanned(clientIp)) {
    res.status(403).json({
      error: {
        code: 'ACCESS_DENIED',
        message: 'Access restricted by administrator',
      },
    });
    return;
  }

  // Also check raw req.ip if normalized stripped it
  if (req.ip && isIpBanned(req.ip)) {
    res.status(403).json({
      error: {
        code: 'ACCESS_DENIED',
        message: 'Access restricted by administrator',
      },
    });
    return;
  }

  // 2. Check Device ban
  if (deviceId && isDeviceBanned(deviceId)) {
    res.status(403).json({
      error: {
        code: 'ACCESS_DENIED',
        message: 'Access restricted by administrator (device banned)',
      },
    });
    return;
  }

  next();
}
