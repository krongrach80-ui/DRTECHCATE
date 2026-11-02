/**
 * packages/face-client/src/cache.ts
 * Biometric Vault & Local Cache Lifecycle Management
 * US NIST SP 800-63B Zero-Stale / Zero-Ghost Biometric Invariant
 */

export const BIOMETRIC_VAULT_VERSION_KEY = 'drtech_biometric_vault_version';
export const CURRENT_BIOMETRIC_VAULT_VERSION = 'v2_strict_biometric';
export const RESILIENT_PATIENTS_CACHE_KEY = 'drtech_resilient_patients';

export interface CachePurgeResult {
  purgedCount: number;
  remainingCount: number;
  vaultUpgraded: boolean;
}

/**
 * Purges stale biometric cache, expired embeddings, ghost profiles, and upgrades vault version.
 * Ensures the Kiosk local fallback never matches strangers against stale mock or corrupt embeddings.
 */
export function purgeStaleBiometricCache(options?: {
  force?: boolean;
  maxAgeMs?: number;
}): CachePurgeResult {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { purgedCount: 0, remainingCount: 0, vaultUpgraded: false };
  }

  const storage = window.localStorage;
  let purgedCount = 0;
  let remainingCount = 0;
  let vaultUpgraded = false;

  try {
    const currentVersion = storage.getItem(BIOMETRIC_VAULT_VERSION_KEY);
    const isOutdated = currentVersion !== CURRENT_BIOMETRIC_VAULT_VERSION;
    const force = options?.force === true || isOutdated;
    const maxAgeMs = options?.maxAgeMs ?? 86400000; // 24 hours

    if (force) {
      storage.setItem(BIOMETRIC_VAULT_VERSION_KEY, CURRENT_BIOMETRIC_VAULT_VERSION);
      vaultUpgraded = true;
    }

    const raw = storage.getItem(RESILIENT_PATIENTS_CACHE_KEY);
    if (!raw) {
      return { purgedCount: 0, remainingCount: 0, vaultUpgraded };
    }

    const patients = JSON.parse(raw);
    if (!Array.isArray(patients)) {
      storage.removeItem(RESILIENT_PATIENTS_CACHE_KEY);
      return { purgedCount: 1, remainingCount: 0, vaultUpgraded };
    }

    const now = Date.now();
    const validPatients = patients.filter((p: any) => {
      // Must be a valid object
      if (!p || typeof p !== 'object') {
        purgedCount++;
        return false;
      }

      // Filter out obvious test/ghost profiles
      const fullName = `${p.first_name || ''} ${p.last_name || ''}`.trim().toLowerCase();
      if (fullName.includes('ghost') || fullName === 'fake patient' || fullName === 'test patient') {
        purgedCount++;
        return false;
      }

      // Check age if timestamp is present
      const cachedAt = p._cached_at || p.created_at;
      if (cachedAt && !isNaN(new Date(cachedAt).getTime())) {
        const age = now - new Date(cachedAt).getTime();
        if (age > maxAgeMs && isOutdated) {
          purgedCount++;
          return false;
        }
      }

      // Check biometric vectors validity
      const hasFaceVector =
        (Array.isArray(p.biometrics?.face_vector) && p.biometrics.face_vector.length === 512) ||
        (Array.isArray(p.history?.face_vector) && p.history.face_vector.length === 512) ||
        (Array.isArray(p.history?.frontal_centroid) && p.history.frontal_centroid.length === 512);

      const hasFrames =
        (Array.isArray(p.frames) && p.frames.some((f: any) => f?.embedding?.length === 512)) ||
        (Array.isArray(p.history?.frames) && p.history.frames.some((f: any) => f?.embedding?.length === 512));

      if (!hasFaceVector && !hasFrames) {
        purgedCount++;
        return false;
      }

      return true;
    });

    remainingCount = validPatients.length;
    if (purgedCount > 0 || isOutdated) {
      storage.setItem(RESILIENT_PATIENTS_CACHE_KEY, JSON.stringify(validPatients));
    }
  } catch {
    // Fail-safe: clear corrupted cache
    try {
      storage.removeItem(RESILIENT_PATIENTS_CACHE_KEY);
      storage.setItem(BIOMETRIC_VAULT_VERSION_KEY, CURRENT_BIOMETRIC_VAULT_VERSION);
    } catch {}
  }

  return { purgedCount, remainingCount, vaultUpgraded };
}
