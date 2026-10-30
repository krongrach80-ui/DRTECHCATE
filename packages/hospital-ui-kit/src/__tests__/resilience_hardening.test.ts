/**
 * packages/hospital-ui-kit/src/__tests__/resilience_hardening.test.ts
 *
 * Unit tests for Zero-Downtime Resilience:
 * - VoiceFeedbackController (cooldown guard, queue purge)
 * - ClinicalErrorBoundary & Offline Error Buffer
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  VoiceFeedbackController,
  recordOfflineErrorLog,
  getOfflineErrorLogs,
} from '../index';

describe('VoiceFeedbackController', () => {
  let controller: VoiceFeedbackController;
  let mockCancel: any;
  let mockSpeak: any;

  beforeEach(() => {
    mockCancel = vi.fn();
    mockSpeak = vi.fn();

    // Mock window.speechSynthesis
    (global as any).window = {
      speechSynthesis: {
        cancel: mockCancel,
        speak: mockSpeak,
      },
    };
    (global as any).SpeechSynthesisUtterance = class {
      public text: string;
      public lang: string = 'th-TH';
      public rate: number = 1.05;
      constructor(text: string) {
        this.text = text;
      }
    };

    controller = new VoiceFeedbackController({ minCooldownMs: 3500 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. permits speech on first invocation and purges existing queue', () => {
    const success = controller.speak('ครั้งที่ 1', 'rep_count');
    expect(success).toBe(true);
    expect(mockCancel).toHaveBeenCalled();
    expect(mockSpeak).toHaveBeenCalled();
  });

  it('2. suppresses subsequent speech within 3,500ms cooldown window', () => {
    const firstCall = controller.speak('ครั้งที่ 1', 'rep_count');
    expect(firstCall).toBe(true);

    // Immediate second call within 3,500ms
    const secondCall = controller.speak('ครั้งที่ 2', 'rep_count');
    expect(secondCall).toBe(false);
    expect(mockSpeak).toHaveBeenCalledTimes(1);
  });

  it('3. allows independent categories without blocking each other', () => {
    const repSpoken = controller.speak('ครั้งที่ 1', 'rep_count');
    expect(repSpoken).toBe(true);

    // Different category (e.g., coaching) is not blocked by rep_count cooldown
    const coachingSpoken = controller.speak('ระวังไหล่ยก', 'coaching_warning');
    expect(coachingSpoken).toBe(true);
    expect(mockSpeak).toHaveBeenCalledTimes(2);
  });

  it('4. cancels speech synthesis queue on cancel()', () => {
    controller.cancel();
    expect(mockCancel).toHaveBeenCalled();
  });

  it('5. resets cooldown history on reset()', () => {
    controller.speak('ครั้งที่ 1', 'rep_count');
    controller.reset();

    // Immediate repeat after reset is permitted
    const spokenAgain = controller.speak('ครั้งที่ 1', 'rep_count');
    expect(spokenAgain).toBe(true);
  });
});

describe('ClinicalErrorBoundary & Offline Diagnostics Buffer', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    (global as any).window = {
      localStorage: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
        clear: () => {
          for (const k of Object.keys(store)) delete store[k];
        },
      },
    };
  });

  it('1. records diagnostic error log to offline buffer', () => {
    recordOfflineErrorLog({
      timestamp: new Date().toISOString(),
      errorName: 'WebGLContextLostError',
      errorMessage: 'GPU device lost connection during pose tracking',
      componentStack: 'in DynamicExerciseSessionView',
    });

    const logs = getOfflineErrorLogs();
    expect(logs.length).toBe(1);
    expect(logs[0].errorName).toBe('WebGLContextLostError');
    expect(logs[0].errorMessage).toContain('GPU device lost');
  });

  it('2. caps offline error buffer at 50 records to prevent memory leak', () => {
    for (let i = 0; i < 60; i++) {
      recordOfflineErrorLog({
        timestamp: new Date().toISOString(),
        errorName: `Error_${i}`,
        errorMessage: `Test error ${i}`,
      });
    }

    const logs = getOfflineErrorLogs();
    expect(logs.length).toBe(50);
    // Most recent error is at index 0
    expect(logs[0].errorName).toBe('Error_59');
  });
});
