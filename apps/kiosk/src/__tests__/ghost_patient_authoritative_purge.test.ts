/**
 * apps/kiosk/src/__tests__/ghost_patient_authoritative_purge.test.ts
 *
 * RIGOROUS TEST SUITE: "GHOST PATIENT" ROOT-CAUSE PREVENTION
 * Validates:
 * 1. Stale/Ghost patient in localStorage missing in Supabase is rejected & purged immediately
 * 2. Biometric score ceiling invariant: Never displays 100% (strictly capped <= 98%)
 * 3. Cache vault upgrade to v3_live_supabase_authoritative and automatic purge
 * 4. reconcileBiometricCacheWithLivePatients wipes deleted accounts (P-4163, P-4061, P-6089, P-6169)
 * 5. Authoritative live Supabase data overlay onto patient profiles
 * 6. removePatientFromLocalCache cleans localStorage & sessionStorage on Admin delete
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CURRENT_BIOMETRIC_VAULT_VERSION,
  BIOMETRIC_VAULT_VERSION_KEY,
  RESILIENT_PATIENTS_CACHE_KEY,
  purgeStaleBiometricCache,
  reconcileBiometricCacheWithLivePatients,
  removePatientFromLocalCache,
} from '../../../../packages/face-client/src/cache';
import {
  calibrateCosineSimilarity,
  computeSimilarityPercentage,
} from '../../../../packages/smart-biometric-core/src/vectorMath';
import { defaultApiClient } from '../../../../packages/api-client/src/index';

describe('Ghost Patient Authoritative Purge & Live Biometric Verification', () => {
  const storageMap = new Map<string, string>();
  const sessionStorageMap = new Map<string, string>();

  const mockLocalStorage = {
    getItem: (key: string) => storageMap.get(key) || null,
    setItem: (key: string, val: string) => { storageMap.set(key, val); },
    removeItem: (key: string) => { storageMap.delete(key); },
    clear: () => { storageMap.clear(); },
  };

  const mockSessionStorage = {
    getItem: (key: string) => sessionStorageMap.get(key) || null,
    setItem: (key: string, val: string) => { sessionStorageMap.set(key, val); },
    removeItem: (key: string) => { sessionStorageMap.delete(key); },
    clear: () => { sessionStorageMap.clear(); },
  };

  beforeEach(() => {
    storageMap.clear();
    sessionStorageMap.clear();

    (global as any).window = {
      localStorage: mockLocalStorage,
      sessionStorage: mockSessionStorage,
      location: { pathname: '/kiosk', href: 'http://localhost/kiosk' },
      dispatchEvent: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Biometric score ceiling invariant: 1.0 raw cosine similarity never returns 100% (strictly capped <= 98%)', () => {
    // Exact identical face vector (raw cosine = 1.0)
    const at100 = calibrateCosineSimilarity(1.0);
    expect(at100).toBeLessThanOrEqual(0.985);

    const percent100 = computeSimilarityPercentage(at100, 1.0, { calibrated: true });
    expect(percent100).toBeLessThanOrEqual(98);
    expect(percent100).toBeGreaterThanOrEqual(95);

    // Near-identical vector (raw cosine = 0.95)
    const at95 = calibrateCosineSimilarity(0.95);
    expect(at95).toBeGreaterThanOrEqual(0.98);
    const percent95 = computeSimilarityPercentage(at95, 0.95, { calibrated: true });
    expect(percent95).toBe(98);
  });

  it('2. Biometric vault upgrades to v3_live_supabase_authoritative and forces stale cleanup', () => {
    mockLocalStorage.setItem(BIOMETRIC_VAULT_VERSION_KEY, 'v2_strict_biometric');
    mockLocalStorage.setItem(
      RESILIENT_PATIENTS_CACHE_KEY,
      JSON.stringify([
        {
          id: 'ghost-4163',
          hn: 'P-4163',
          first_name: 'พัทรดนย์',
          last_name: 'ผ่องอารมย์',
          created_at: new Date(Date.now() - 90000000).toISOString(), // >24h old
          biometrics: { face_vector: new Array(512).fill(0.1) },
        },
      ])
    );

    const res = purgeStaleBiometricCache({ force: true });
    expect(res.vaultUpgraded).toBe(true);
    expect(res.purgedCount).toBe(1);
    expect(mockLocalStorage.getItem(BIOMETRIC_VAULT_VERSION_KEY)).toBe(CURRENT_BIOMETRIC_VAULT_VERSION);
    expect(CURRENT_BIOMETRIC_VAULT_VERSION).toBe('v3_live_supabase_authoritative');
  });

  it('3. reconcileBiometricCacheWithLivePatients wipes deleted ghost profiles (P-4163, P-4061, P-6089, P-6169)', () => {
    mockLocalStorage.setItem(
      RESILIENT_PATIENTS_CACHE_KEY,
      JSON.stringify([
        { id: 'ghost-1', hn: 'P-4163', first_name: 'พัทรดนย์' },
        { id: 'ghost-2', hn: 'P-4061', first_name: 'พัทรดนย์' },
        { id: 'ghost-3', hn: 'P-6089', first_name: 'พัทรดนย์' },
        { id: 'ghost-4', hn: 'P-6169', first_name: 'พัทรดนย์' },
        { id: 'live-uuid-6202', hn: 'P-6202', first_name: 'ภานุวัฒน์', last_name: 'ดาวกระจาย' },
      ])
    );

    // Live Supabase only has P-6202
    const livePatients = [{ id: 'live-uuid-6202', hn: 'P-6202' }];
    const res = reconcileBiometricCacheWithLivePatients(livePatients);

    expect(res.purgedCount).toBe(4);
    expect(res.remainingCount).toBe(1);

    const remaining = JSON.parse(mockLocalStorage.getItem(RESILIENT_PATIENTS_CACHE_KEY)!);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].hn).toBe('P-6202');
    expect(remaining[0].first_name).toBe('ภานุวัฒน์');
  });

  it('4. removePatientFromLocalCache cleans localStorage and sessionStorage on Admin delete', () => {
    mockLocalStorage.setItem(
      RESILIENT_PATIENTS_CACHE_KEY,
      JSON.stringify([
        { id: 'patient-to-delete', hn: 'P-9999', first_name: 'ทดสอบ' },
        { id: 'patient-to-keep', hn: 'P-8888', first_name: 'คนไข้ดี' },
      ])
    );
    mockLocalStorage.setItem('drtech_patient_record_patient-to-delete', JSON.stringify({ note: 'secret' }));
    mockSessionStorage.setItem('drtech_active_patient', JSON.stringify({ id: 'patient-to-delete' }));

    const removed = removePatientFromLocalCache('patient-to-delete');
    expect(removed).toBe(true);

    const remaining = JSON.parse(mockLocalStorage.getItem(RESILIENT_PATIENTS_CACHE_KEY)!);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('patient-to-keep');

    expect(mockLocalStorage.getItem('drtech_patient_record_patient-to-delete')).toBeNull();
    expect(mockSessionStorage.getItem('drtech_active_patient')).toBeNull();
    expect((global as any).window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'patient-deleted' })
    );
  });

  it('5. scanLogin fallback refuses ghost patient in localStorage and purges them if absent from Supabase', async () => {
    // Setup ghost patient in localStorage
    const testProbe = new Array(512).fill(0.044194); // unit-normalized vector
    mockLocalStorage.setItem(
      RESILIENT_PATIENTS_CACHE_KEY,
      JSON.stringify([
        {
          id: 'ghost-4163',
          hn: 'P-4163',
          first_name: 'พัทรดนย์',
          last_name: 'ผ่องอารมย์',
          age: 21,
          frames: [{ pose: 'front', embedding: testProbe }],
        },
      ])
    );

    // Mock fetch to Supabase returning EMPTY (or only P-6202)
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/rest/v1/patients')) {
        // Only P-6202 exists in Supabase
        return {
          ok: true,
          status: 200,
          headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
          json: async () => [
            {
              id: 'live-uuid-6202',
              hn: 'P-6202',
              first_name: 'ภานุวัฒน์',
              last_name: 'ดาวกระจาย',
              age: 19,
              sex: 'male',
              registration_status: 'face_enrolled',
              history: {
                face_vector: new Array(512).fill(-0.044194), // opposite vector
              },
            },
          ],
        } as any;
      }
      return { ok: false, status: 404, headers: { get: () => null } } as any;
    });

    try {
      const scanRes = await defaultApiClient.smartOnboarding.scanLogin({
        probe: testProbe,
      });

      // Must NOT match ghost patient!
      expect(scanRes.matched).toBe(false);
      expect((scanRes as any).patient).toBeFalsy();

      // Ghost patient P-4163 MUST be purged from localStorage
      const cachedAfter = JSON.parse(mockLocalStorage.getItem(RESILIENT_PATIENTS_CACHE_KEY) || '[]');
      expect(cachedAfter.some((p: any) => p.hn === 'P-4163')).toBe(false);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('6. scanLogin matches live patient and ensures score is capped at <= 98%', async () => {
    const testProbe = new Array(512).fill(0.044194); // unit-normalized vector

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/rest/v1/patients')) {
        return {
          ok: true,
          status: 200,
          headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
          json: async () => [
            {
              id: 'live-uuid-6202',
              hn: 'P-6202',
              first_name: 'ภานุวัฒน์',
              last_name: 'ดาวกระจาย',
              age: 19,
              sex: 'male',
              registration_status: 'face_enrolled',
              history: {
                face_vector: testProbe, // matches probe
              },
            },
          ],
        } as any;
      }
      return { ok: false, status: 404, headers: { get: () => null } } as any;
    });

    try {
      const scanRes = await defaultApiClient.smartOnboarding.scanLogin({
        probe: testProbe,
      });

      expect(scanRes.matched).toBe(true);
      expect((scanRes as any).patient.hn).toBe('P-6202');
      expect((scanRes as any).patient.first_name).toBe('ภานุวัฒน์');
      expect((scanRes as any).similarityPercentage).toBeLessThanOrEqual(98);
      expect((scanRes as any).similarityPercentage).toBeGreaterThanOrEqual(80);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
