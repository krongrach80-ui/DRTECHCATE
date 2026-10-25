/**
 * packages/hospital-ui-kit/src/__tests__/hospital_ui_kit.test.ts
 * Master Prompt v5 Section 2 & 3: Hospital UI Kit & Deterministic Zero-Conflict Sync Guard Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SyncCoordinator } from '../syncCoordinator';
import { hospitalTheme } from '../theme';

describe('Hospital Clinical UI Kit & Sync Coordinator', () => {
  let coordinator: SyncCoordinator;

  beforeEach(() => {
    coordinator = SyncCoordinator.getInstance();
    coordinator.resetDirtyFields();
  });

  describe('1. Hospital Theme & Gradients Tokens', () => {
    it('should define clinical Deep Forest Teal sidebar gradient', () => {
      expect(hospitalTheme.colors.sidebarGradient).toBe(
        'linear-gradient(180deg, #063932 0%, #042924 100%)'
      );
    });

    it('should define Clinical Sky-Cyan active pill gradient and soft glow', () => {
      expect(hospitalTheme.colors.activePillGradient).toBe(
        'linear-gradient(90deg, #0EA5E9 0%, #0284C7 100%)'
      );
      expect(hospitalTheme.colors.activePillGlow).toBe('0 4px 14px rgba(14, 165, 233, 0.35)');
    });

    it('should define Medical Emerald-to-Blue primary action gradient', () => {
      expect(hospitalTheme.colors.primaryGradient).toBe(
        'linear-gradient(135deg, #10B981 0%, #059669 45%, #2563EB 100%)'
      );
    });

    it('should define Sterile Mint-White workspace background', () => {
      expect(hospitalTheme.colors.workspaceBg).toBe(
        'radial-gradient(circle at top left, #F0FDF9 0%, #F8FAFC 60%, #EFF6FF 100%)'
      );
    });

    it('should define exact status badge colors', () => {
      expect(hospitalTheme.colors.status.active.bg).toBe('#DCFCE7');
      expect(hospitalTheme.colors.status.active.text).toBe('#15803D');
      expect(hospitalTheme.colors.status.pending.bg).toBe('#FEF3C7');
      expect(hospitalTheme.colors.status.pending.text).toBe('#B45309');
      expect(hospitalTheme.colors.status.danger.bg).toBe('#FEE2E2');
      expect(hospitalTheme.colors.status.danger.text).toBe('#B91C1C');
    });
  });

  describe('2. Single-Flight Mutation Queue & Idempotency', () => {
    it('should acquire flight lock once and block concurrent flight attempts', () => {
      const lockKey = 'SAVE_SCHEDULE:patient-101';
      const acquiredFirst = coordinator.acquireFlightLock(lockKey);
      expect(acquiredFirst).toBe(true);

      // Duplicate inflight attempt must be rejected
      const acquiredSecond = coordinator.acquireFlightLock(lockKey);
      expect(acquiredSecond).toBe(false);

      // Releasing lock allows subsequent action
      coordinator.releaseFlightLock(lockKey);
      const acquiredThird = coordinator.acquireFlightLock(lockKey);
      expect(acquiredThird).toBe(true);
      coordinator.releaseFlightLock(lockKey);
    });

    it('should generate unique idempotency request IDs with timestamp and entropy', () => {
      const id1 = coordinator.generateRequestId('UPDATE_NOTE', 'p-1');
      const id2 = coordinator.generateRequestId('UPDATE_NOTE', 'p-1');
      expect(id1).not.toBe(id2);
      expect(id1).toContain('UPDATE_NOTE:p-1:');
    });
  });

  describe('3. Strict Patient-ID & Session Scoping (Drop Stale Events)', () => {
    it('should reject incoming events from mismatched patient IDs', () => {
      const activePatientId = 'patient-001';
      const incomingPatientId = 'patient-999';

      const shouldApply = coordinator.shouldApplyIncomingEvent(
        incomingPatientId,
        '2026-10-24T16:00:00Z',
        activePatientId
      );

      expect(shouldApply).toBe(false);
    });

    it('should accept incoming newer event and drop subsequent stale/older event', () => {
      const patientId = 'patient-002';

      // 1. First event at 16:00:00
      const first = coordinator.shouldApplyIncomingEvent(
        patientId,
        '2026-10-24T16:00:00Z',
        patientId
      );
      expect(first).toBe(true);

      // 2. Newer event at 16:05:00
      const newer = coordinator.shouldApplyIncomingEvent(
        patientId,
        '2026-10-24T16:05:00Z',
        patientId
      );
      expect(newer).toBe(true);

      // 3. Stale event at 16:02:00 (older than 16:05:00) -> MUST DROP
      const stale = coordinator.shouldApplyIncomingEvent(
        patientId,
        '2026-10-24T16:02:00Z',
        patientId
      );
      expect(stale).toBe(false);

      // 4. Equal timestamp event -> MUST DROP to avoid duplicate cycles
      const equal = coordinator.shouldApplyIncomingEvent(
        patientId,
        '2026-10-24T16:05:00Z',
        patientId
      );
      expect(equal).toBe(false);
    });
  });

  describe('4. Dirty / Focused Input Guard against Polling Overwrite', () => {
    it('should forbid background overwriting when field is dirty/focused', () => {
      const field = 'patient_diagnosis';
      expect(coordinator.canOverwriteField(field)).toBe(true);

      // User starts typing
      coordinator.markFieldDirty(field, true);
      expect(coordinator.canOverwriteField(field)).toBe(false);

      // User blurs / finishes
      coordinator.markFieldDirty(field, false);
      expect(coordinator.canOverwriteField(field)).toBe(true);
    });
  });
});
