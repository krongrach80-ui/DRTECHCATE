import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  filterActiveStaffCalls,
  formatSafeThaiDateTime,
  resolveKioskDisplayName,
  STAFF_CALL_DEDUPE_WINDOW_MS,
  STAFF_CALL_ACTIVE_WINDOW_MS,
  StaffCallRecord,
} from '../../../../packages/api-client/src/index.js';

describe('Staff Calls Deduplication, Stale Filtering and Consistent Formatting', () => {
  const baseTime = new Date('2026-11-08T15:14:00+07:00').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(baseTime);
  });

  it('verifies standard constants for deduplication and active windows', () => {
    expect(STAFF_CALL_DEDUPE_WINDOW_MS).toBe(10 * 60 * 1000); // 10 minutes
    expect(STAFF_CALL_ACTIVE_WINDOW_MS).toBe(2 * 60 * 60 * 1000); // 2 hours
  });

  describe('filterActiveStaffCalls', () => {
    it('classifies calls under 2 hours as activeCalls', () => {
      const calls: StaffCallRecord[] = [
        {
          id: 'call-1',
          kiosk_id: 'kiosk-01',
          reason: 'คนไข้กดเรียกเจ้าหน้าที่',
          created_at: new Date(baseTime - 15 * 60 * 1000).toISOString(), // 15 mins ago
          handled_by: null,
          handled_at: null,
        },
        {
          id: 'call-2',
          kiosk_id: 'kiosk-01',
          reason: 'สแกนหน้าไม่ผ่าน',
          created_at: new Date(baseTime - 90 * 60 * 1000).toISOString(), // 1.5 hours ago
          handled_by: null,
          handled_at: null,
        },
      ];

      const { activeCalls, staleCalls, handledCalls } = filterActiveStaffCalls(calls);
      expect(activeCalls).toHaveLength(2);
      expect(staleCalls).toHaveLength(0);
      expect(handledCalls).toHaveLength(0);
    });

    it('classifies unhandled calls older than 2 hours as staleCalls', () => {
      const calls: StaffCallRecord[] = [
        {
          id: 'call-stale-1',
          kiosk_id: 'kiosk-01',
          reason: 'รายการค้าง 3 วันที่แล้ว',
          created_at: new Date(baseTime - 3 * 24 * 60 * 60 * 1000).toISOString(),
          handled_by: null,
          handled_at: null,
        },
        {
          id: 'call-stale-2',
          kiosk_id: 'cc000000-0000-0000-0000-000000000001',
          reason: 'รายการค้าง 5 ชั่วโมงที่แล้ว',
          created_at: new Date(baseTime - 5 * 60 * 60 * 1000).toISOString(),
          handled_by: null,
          handled_at: null,
        },
      ];

      const { activeCalls, staleCalls, handledCalls } = filterActiveStaffCalls(calls);
      expect(activeCalls).toHaveLength(0);
      expect(staleCalls).toHaveLength(2);
      expect(handledCalls).toHaveLength(0);
    });

    it('classifies handled calls separately regardless of age', () => {
      const calls: StaffCallRecord[] = [
        {
          id: 'call-handled-recent',
          kiosk_id: 'kiosk-01',
          reason: 'เพิ่งรับเรื่อง',
          created_at: new Date(baseTime - 10 * 60 * 1000).toISOString(),
          handled_by: 'pt-01',
          handled_at: new Date(baseTime - 5 * 60 * 1000).toISOString(),
        },
        {
          id: 'call-handled-old',
          kiosk_id: 'kiosk-01',
          reason: 'รับเรื่องเมื่อวาน',
          created_at: new Date(baseTime - 24 * 60 * 60 * 1000).toISOString(),
          handled_by: 'pt-01',
          handled_at: new Date(baseTime - 23 * 60 * 60 * 1000).toISOString(),
        },
      ];

      const { activeCalls, staleCalls, handledCalls } = filterActiveStaffCalls(calls);
      expect(activeCalls).toHaveLength(0);
      expect(staleCalls).toHaveLength(0);
      expect(handledCalls).toHaveLength(2);
    });

    it('accurately partitions a mixed list of 5 stale calls and 1 fresh active call', () => {
      const calls: StaffCallRecord[] = [
        { id: '1', kiosk_id: 'kiosk-01', reason: 'เก่า 1', created_at: new Date(baseTime - 10000000).toISOString(), handled_at: null },
        { id: '2', kiosk_id: 'kiosk-01', reason: 'เก่า 2', created_at: new Date(baseTime - 20000000).toISOString(), handled_at: null },
        { id: '3', kiosk_id: 'kiosk-01', reason: 'เก่า 3', created_at: new Date(baseTime - 30000000).toISOString(), handled_at: null },
        { id: '4', kiosk_id: 'kiosk-01', reason: 'เก่า 4', created_at: new Date(baseTime - 40000000).toISOString(), handled_at: null },
        { id: '5', kiosk_id: 'kiosk-01', reason: 'เก่า 5', created_at: new Date(baseTime - 50000000).toISOString(), handled_at: null },
        { id: '6', kiosk_id: 'kiosk-01', reason: 'ใหม่เพิ่งกด', created_at: new Date(baseTime - 60000).toISOString(), handled_at: null },
      ];

      const { activeCalls, staleCalls, handledCalls } = filterActiveStaffCalls(calls);
      expect(activeCalls).toHaveLength(1);
      expect(activeCalls[0].id).toBe('6');
      expect(staleCalls).toHaveLength(5);
      expect(handledCalls).toHaveLength(0);
    });
  });

  describe('formatSafeThaiDateTime', () => {
    it('formats UTC ISO date into Thai Buddhist calendar format with Asia/Bangkok time', () => {
      // 2026-11-08T08:14:00Z is 15:14 in Asia/Bangkok (+07:00)
      const iso = '2026-11-08T08:14:00.000Z';
      const formatted = formatSafeThaiDateTime(iso);
      expect(formatted).toContain('8 พ.ย. 2569');
      expect(formatted).toContain('15:14');
    });

    it('returns "-" for null, undefined, or invalid dates safely without throwing', () => {
      expect(formatSafeThaiDateTime(null)).toBe('-');
      expect(formatSafeThaiDateTime(undefined)).toBe('-');
      expect(formatSafeThaiDateTime('')).toBe('-');
      expect(formatSafeThaiDateTime('invalid-date-string')).toBe('-');
    });
  });

  describe('resolveKioskDisplayName', () => {
    it('resolves standard kiosk ID cc000000... to Kiosk-01 (จุดคัดกรองหลัก)', () => {
      const name = resolveKioskDisplayName({ kiosk_id: 'cc000000-0000-0000-0000-000000000001' });
      expect(name).toBe('Kiosk-01 (จุดคัดกรองหลัก)');
    });

    it('resolves kiosk-01 to Kiosk-01 (จุดคัดกรองหลัก)', () => {
      const name = resolveKioskDisplayName({ kiosk_id: 'kiosk-01' });
      expect(name).toBe('Kiosk-01 (จุดคัดกรองหลัก)');
    });

    it('prioritizes device_name or kiosk_name if explicitly provided', () => {
      const name = resolveKioskDisplayName({ kiosk_id: 'kiosk-99', device_name: 'ตู้ Kiosk แผนกผู้ป่วยนอก ชั้น 2' });
      expect(name).toBe('ตู้ Kiosk แผนกผู้ป่วยนอก ชั้น 2');
    });

    it('falls back safely to Kiosk-01 (จุดคัดกรองหลัก) when kiosk_id is missing', () => {
      const name = resolveKioskDisplayName({});
      expect(name).toBe('Kiosk-01 (จุดคัดกรองหลัก)');
    });
  });
});
