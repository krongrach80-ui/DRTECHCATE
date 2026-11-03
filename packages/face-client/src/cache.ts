/**
 * packages/face-client/src/cache.ts
 * Biometric Vault & Local Cache Lifecycle Management
 * US NIST SP 800-63B Zero-Stale / Zero-Ghost Biometric Invariant
 * Sovereignty Standard: Only authoritative live Supabase data is trusted.
 */

export const BIOMETRIC_VAULT_VERSION_KEY = 'drtech_biometric_vault_version';
export const CURRENT_BIOMETRIC_VAULT_VERSION = 'v4_authoritative_live_supabase_strictly_sovereign';
export const RESILIENT_PATIENTS_CACHE_KEY = 'drtech_resilient_patients';

export interface CachePurgeResult {
  purgedCount: number;
  remainingCount: number;
  vaultUpgraded: boolean;
}

/**
 * Total purge of all local biometric caches, templates, and ghost profiles.
 * Strictly enforces that no biometric templates or vectors persist in client storage.
 */
export function purgeAllLocalBiometricCaches(): { purgedKeys: string[] } {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { purgedKeys: [] };
  }
  const purged: string[] = [];
  const storage = window.localStorage;

  const explicitKeys = [
    RESILIENT_PATIENTS_CACHE_KEY,
    'drtech_cached_patients',
    'drtech_local_face_vectors',
    'drtech_offline_patients',
  ];

  for (const k of explicitKeys) {
    if (storage.getItem(k) !== null) {
      storage.removeItem(k);
      purged.push(k);
    }
  }

  const keysToScan: string[] = [];
  if (typeof storage.key === 'function' && typeof storage.length === 'number') {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k) keysToScan.push(k);
    }
  }
  try {
    for (const k of Object.keys(storage)) {
      if (!keysToScan.includes(k)) keysToScan.push(k);
    }
  } catch {}

  for (const key of keysToScan) {
    if (
      key.startsWith('drtech_patient_record_') ||
      key.startsWith('drtech_face_vector_') ||
      key.startsWith('drtech_resilient_')
    ) {
      storage.removeItem(key);
      purged.push(key);
    }
  }

  storage.setItem(BIOMETRIC_VAULT_VERSION_KEY, CURRENT_BIOMETRIC_VAULT_VERSION);
  return { purgedKeys: purged };
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

      // Check age if timestamp is present: Purge if expired or if cache vault is outdated
      const cachedAt = p._cached_at || p.created_at;
      if (cachedAt && !isNaN(new Date(cachedAt).getTime())) {
        const age = now - new Date(cachedAt).getTime();
        if (age > maxAgeMs || isOutdated) {
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

/**
 * Reconciles local resilient patients cache against the authoritative list of active patients from Supabase.
 * Any patient entry whose ID or HN is absent from the live Supabase dataset is purged immediately.
 */
export function reconcileBiometricCacheWithLivePatients(
  livePatients: Array<{ id?: string; hn?: string }>
): { purgedCount: number; remainingCount: number } {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { purgedCount: 0, remainingCount: 0 };
  }

  const storage = window.localStorage;
  const raw = storage.getItem(RESILIENT_PATIENTS_CACHE_KEY);
  if (!raw) {
    return { purgedCount: 0, remainingCount: 0 };
  }

  try {
    const cachedList = JSON.parse(raw);
    if (!Array.isArray(cachedList)) {
      storage.removeItem(RESILIENT_PATIENTS_CACHE_KEY);
      return { purgedCount: 1, remainingCount: 0 };
    }

    const liveIdSet = new Set<string>();
    const liveHnSet = new Set<string>();

    for (const lp of livePatients) {
      if (lp.id) liveIdSet.add(lp.id);
      if (lp.hn) liveHnSet.add(lp.hn);
    }

    let purgedCount = 0;
    const reconciled = cachedList.filter((p: any) => {
      const pId = p.id || p.patient_id;
      const pHn = p.hn;
      const isLive = (pId && liveIdSet.has(pId)) || (pHn && liveHnSet.has(pHn));
      if (!isLive) {
        purgedCount++;
        if (pId) storage.removeItem(`drtech_patient_record_${pId}`);
        if (pHn) storage.removeItem(`drtech_patient_record_${pHn}`);
        return false;
      }
      return true;
    });

    if (purgedCount > 0) {
      storage.setItem(RESILIENT_PATIENTS_CACHE_KEY, JSON.stringify(reconciled));
    }

    return { purgedCount, remainingCount: reconciled.length };
  } catch {
    storage.removeItem(RESILIENT_PATIENTS_CACHE_KEY);
    return { purgedCount: 1, remainingCount: 0 };
  }
}

/**
 * Explicitly removes a patient by ID or HN from all client storage layers (localStorage & sessionStorage)
 * and dispatches a broadcast event for live UI components to refresh their in-memory state.
 */
export function removePatientFromLocalCache(patientIdOrHn: string): boolean {
  if (typeof window === 'undefined' || !window.localStorage || !patientIdOrHn) {
    return false;
  }

  const storage = window.localStorage;
  let didRemove = false;

  try {
    const raw = storage.getItem(RESILIENT_PATIENTS_CACHE_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        const filtered = list.filter((p: any) => {
          const match =
            p.id === patientIdOrHn ||
            p.patient_id === patientIdOrHn ||
            p.hn === patientIdOrHn;
          if (match) didRemove = true;
          return !match;
        });
        if (didRemove) {
          storage.setItem(RESILIENT_PATIENTS_CACHE_KEY, JSON.stringify(filtered));
        }
      }
    }

    storage.removeItem(`drtech_patient_record_${patientIdOrHn}`);

    if (typeof window.sessionStorage !== 'undefined') {
      const activeRaw = window.sessionStorage.getItem('drtech_active_patient');
      if (activeRaw) {
        try {
          const active = JSON.parse(activeRaw);
          if (
            active.id === patientIdOrHn ||
            active.patient_id === patientIdOrHn ||
            active.hn === patientIdOrHn
          ) {
            window.sessionStorage.removeItem('drtech_active_patient');
          }
        } catch {}
      }
    }

    window.dispatchEvent(
      new CustomEvent('patient-deleted', { detail: { patientId: patientIdOrHn } })
    );
  } catch {}

  return didRemove;
}
