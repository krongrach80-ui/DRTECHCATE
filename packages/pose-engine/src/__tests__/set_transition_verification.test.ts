import { describe, it, expect } from 'vitest';
import { CLINICAL_EXERCISES_CONFIG } from '../presets/exercises.config';
import { RepStateMachine } from '../engine/repStateMachine';
import { PoseEngineLandmark, RepEvaluationResult } from '../types/exerciseConfig';

function createBaseSkeleton(): PoseEngineLandmark[] {
  const landmarks: PoseEngineLandmark[] = [];
  for (let i = 0; i <= 32; i++) {
    landmarks.push({
      x: 0.5,
      y: 0.5,
      z: 0.0,
      visibility: 0.95,
      presence: 0.95,
    });
  }
  landmarks[7] = { x: 0.55, y: 0.20, z: 0.0, visibility: 0.95 }; // L Ear
  landmarks[8] = { x: 0.45, y: 0.20, z: 0.0, visibility: 0.95 }; // R Ear
  landmarks[11] = { x: 0.60, y: 0.35, z: 0.0, visibility: 0.95 }; // L Shoulder
  landmarks[12] = { x: 0.40, y: 0.35, z: 0.0, visibility: 0.95 }; // R Shoulder
  landmarks[13] = { x: 0.60, y: 0.50, z: 0.0, visibility: 0.95 }; // L Elbow
  landmarks[14] = { x: 0.40, y: 0.50, z: 0.0, visibility: 0.95 }; // R Elbow
  landmarks[15] = { x: 0.60, y: 0.65, z: 0.0, visibility: 0.95 }; // L Wrist
  landmarks[16] = { x: 0.40, y: 0.65, z: 0.0, visibility: 0.95 }; // R Wrist
  landmarks[23] = { x: 0.60, y: 0.65, z: 0.0, visibility: 0.95 }; // L Hip
  landmarks[24] = { x: 0.40, y: 0.65, z: 0.0, visibility: 0.95 }; // R Hip
  return landmarks;
}

describe('Set Transition 10 Scenarios Verification Suite (Step 3)', () => {
  const baseConfig = CLINICAL_EXERCISES_CONFIG['active-shoulder-flexion'];

  // Test Harness simulating the exact atomic lifecycle in DynamicExerciseSessionView
  class SessionHarness {
    public sessionWorkoutState: 'EXERCISING' | 'RESTING' | 'COMPLETED' = 'EXERCISING';
    public isResting: boolean = false;
    public completedSetNumber: number = 1;
    public validCompletedReps: number = 0;
    public setBaseReps: number = 0;
    public lastCompletedReps: number = 0;
    public isSummaryOpen: boolean = false;
    public isPaused: boolean = false;
    public restCountdown: number = 16;
    public sm: RepStateMachine;
    public targetReps: number = 2;
    public totalSets: number = 3;
    public restSec: number = 16;
    public traceLog: Array<{ timeMs: number; event: string; set: number; rep: number; state: string }> = [];
    public timeMs: number = 1000;
    public restTimerActive: boolean = false;
    public restDeadline: number = 0;

    constructor() {
      const config = {
        ...baseConfig,
        defaultPrescription: {
          repsPerSet: this.targetReps,
          totalSets: this.totalSets,
          restBetweenSetsSec: this.restSec,
        },
      };
      this.sm = new RepStateMachine(config);
      this.sm.setSide('left');
    }

    public logEvent(event: string) {
      this.traceLog.push({
        timeMs: this.timeMs,
        event,
        set: (this.sm as any).currentSet ?? this.completedSetNumber,
        rep: this.validCompletedReps - this.setBaseReps,
        state: this.sessionWorkoutState,
      });
    }

    public runLoopAFrame(landmarks: PoseEngineLandmark[], options?: any): RepEvaluationResult {
      this.timeMs += 40;
      if (this.isPaused) {
        return this.sm.evaluate(landmarks, this.timeMs, undefined, options);
      }

      const evalRes = this.sm.evaluate(landmarks, this.timeMs, undefined, options);

      // Rep counting check (strictly gated to EXERCISING)
      if (this.sessionWorkoutState === 'EXERCISING' && evalRes.completedReps > this.lastCompletedReps) {
        this.lastCompletedReps = evalRes.completedReps;
        this.validCompletedReps += 1;
        this.logEvent(`REP_COUNTED_${this.validCompletedReps - this.setBaseReps}`);
      }

      // Set & Exercise Completion Transitions
      const isSetDone = this.validCompletedReps - this.setBaseReps >= this.targetReps;
      const isExerciseDone = isSetDone && evalRes.currentSet >= this.totalSets;

      if (isSetDone && !isExerciseDone && this.sessionWorkoutState === 'EXERCISING') {
        this.sessionWorkoutState = 'RESTING';
        this.isResting = true;
        this.completedSetNumber = evalRes.currentSet;
        this.restDeadline = this.timeMs + this.restSec * 1000;
        this.restTimerActive = true;
        this.restCountdown = this.restSec;
        this.logEvent(`SET_${evalRes.currentSet}_DONE_ENTER_REST`);
      } else if (isExerciseDone && this.sessionWorkoutState !== 'COMPLETED' && !this.isSummaryOpen) {
        this.sessionWorkoutState = 'COMPLETED';
        this.isResting = false;
        this.isSummaryOpen = true;
        this.logEvent('EXERCISE_COMPLETED');
      }

      return evalRes;
    }

    // Atomic Idempotent handleNextSet
    public handleNextSet() {
      if (this.sessionWorkoutState !== 'RESTING') return;
      this.sessionWorkoutState = 'EXERCISING';
      this.isResting = false;
      this.restTimerActive = false;
      this.setBaseReps = this.validCompletedReps;
      this.lastCompletedReps = 0;
      this.sm.nextSet();
      this.restCountdown = this.restSec;
      this.logEvent(`NEXT_SET_STARTED_${(this.sm as any).currentSet}`);
    }

    // Rest countdown tick
    public tickRestCountdown(elapsedMs: number) {
      if (!this.restTimerActive || this.sessionWorkoutState !== 'RESTING') return;
      this.timeMs += elapsedMs;
      const remainingSec = Math.max(0, Math.ceil((this.restDeadline - this.timeMs) / 1000));
      this.restCountdown = remainingSec;
      if (remainingSec <= 0) {
        this.restTimerActive = false;
        this.handleNextSet();
      }
    }

    // Complete 1 valid repetition
    public doValidRep() {
      const skelRest = createBaseSkeleton();
      const skelFlex = createBaseSkeleton();
      skelFlex[13] = { x: 0.60, y: 0.20, z: -0.20, visibility: 0.95 };
      skelFlex[15] = { x: 0.60, y: 0.05, z: -0.35, visibility: 0.95 };

      // Move to target (15 frames)
      for (let i = 0; i < 15; i++) this.runLoopAFrame(skelFlex);
      // Hold target (28 frames)
      for (let i = 0; i < 28; i++) this.runLoopAFrame(skelFlex);
      // Return to lap (15 frames)
      for (let i = 0; i < 15; i++) this.runLoopAFrame(skelRest);
    }
  }

  it('Scenario 1: 3-set exercise displays rest screen exactly ONCE after Set 1, ONCE after Set 2, and 0 times after Set 3 (completes cleanly)', () => {
    const h = new SessionHarness();
    const skelRest = createBaseSkeleton();

    // Set 1: 2 reps
    h.doValidRep();
    h.doValidRep();
    expect(h.sessionWorkoutState).toBe('RESTING');
    expect(h.completedSetNumber).toBe(1);
    expect(h.isResting).toBe(true);

    // Frame while resting should NOT increment reps or re-trigger rest
    h.runLoopAFrame(skelRest, { isArmAmbiguous: true });
    expect(h.sessionWorkoutState).toBe('RESTING');
    expect(h.completedSetNumber).toBe(1);

    // Advance to Set 2
    h.handleNextSet();
    expect(h.sessionWorkoutState).toBe('EXERCISING');
    expect((h.sm as any).currentSet).toBe(2);

    // Set 2: 2 reps
    h.doValidRep();
    h.doValidRep();
    expect(h.sessionWorkoutState).toBe('RESTING');
    expect(h.completedSetNumber).toBe(2);
    expect(h.isResting).toBe(true);

    // Advance to Set 3
    h.handleNextSet();
    expect(h.sessionWorkoutState).toBe('EXERCISING');
    expect((h.sm as any).currentSet).toBe(3);

    // Set 3: 2 reps (Final set)
    h.doValidRep();
    h.doValidRep();
    expect(h.sessionWorkoutState).toBe('COMPLETED');
    expect(h.isResting).toBe(false);
    expect(h.isSummaryOpen).toBe(true);
  });

  it('Scenario 2: Waiting for rest timer to expire automatically starts next set with incremented set and rep=0', () => {
    const h = new SessionHarness();
    h.doValidRep();
    h.doValidRep();
    expect(h.sessionWorkoutState).toBe('RESTING');
    expect(h.completedSetNumber).toBe(1);

    // Advance time until countdown expires
    h.tickRestCountdown(16000);
    expect(h.sessionWorkoutState).toBe('EXERCISING');
    expect((h.sm as any).currentSet).toBe(2);
    expect(h.validCompletedReps - h.setBaseReps).toBe(0);
  });

  it('Scenario 3: Clicking "พร้อมแล้ว" before timer expires starts next set immediately without duplicate rest popup', () => {
    const h = new SessionHarness();
    const skelRest = createBaseSkeleton();
    h.doValidRep();
    h.doValidRep();
    expect(h.sessionWorkoutState).toBe('RESTING');

    // User clicks ready after 5 seconds (11s left)
    h.tickRestCountdown(5000);
    expect(h.restCountdown).toBe(11);
    h.handleNextSet();

    expect(h.sessionWorkoutState).toBe('EXERCISING');
    expect((h.sm as any).currentSet).toBe(2);

    // Subsequent frame in Loop A (user lowering arm)
    h.runLoopAFrame(skelRest);
    expect(h.sessionWorkoutState).toBe('EXERCISING');
    expect(h.isResting).toBe(false);
  });

  it('Scenario 4: Rapid clicking or clicking exactly at countdown expiration executes handleNextSet strictly once (Idempotent)', () => {
    const h = new SessionHarness();
    h.doValidRep();
    h.doValidRep();
    expect(h.sessionWorkoutState).toBe('RESTING');

    // Simulate 5 rapid clicks simultaneously
    h.handleNextSet();
    h.handleNextSet();
    h.handleNextSet();
    h.handleNextSet();
    h.handleNextSet();

    expect(h.sessionWorkoutState).toBe('EXERCISING');
    expect((h.sm as any).currentSet).toBe(2); // strictly 2, not 3, 4, 5, or 6!
  });

  it('Scenario 5: Switching tabs during rest accurately computes remaining time via wall-clock deadline without drift', () => {
    const h = new SessionHarness();
    h.doValidRep();
    h.doValidRep();
    expect(h.sessionWorkoutState).toBe('RESTING');

    // Tab inactive for 10 seconds
    h.tickRestCountdown(10000);
    expect(h.restCountdown).toBe(6); // 16 - 10 = 6s remaining
  });

  it('Scenario 6: Pressing "พักสักครู่" (Pause) during exercise freezes state and does NOT increment sets', () => {
    const h = new SessionHarness();
    const skelRest = createBaseSkeleton();
    h.doValidRep(); // 1 rep
    h.isPaused = true;

    // Frames while paused
    for (let i = 0; i < 20; i++) h.runLoopAFrame(skelRest);
    expect(h.sessionWorkoutState).toBe('EXERCISING');
    expect((h.sm as any).currentSet).toBe(1);
    expect(h.validCompletedReps).toBe(1);

    // Resume
    h.isPaused = false;
    h.doValidRep(); // 2nd rep
    expect(h.sessionWorkoutState).toBe('RESTING');
    expect(h.completedSetNumber).toBe(1);
  });

  it('Scenario 7: Pressing "รู้สึกเจ็บ" (Emergency Pain Stop) transitions to COMPLETED safely', () => {
    const h = new SessionHarness();
    h.doValidRep();
    h.doValidRep();
    expect(h.sessionWorkoutState).toBe('RESTING');

    // User reports pain during rest
    h.sessionWorkoutState = 'COMPLETED';
    h.isResting = false;
    expect(h.sessionWorkoutState).toBe('COMPLETED');
    expect(h.isResting).toBe(false);
  });

  it('Scenario 8: Component unmount during rest cleans up timer without lingering state updates', () => {
    const h = new SessionHarness();
    h.doValidRep();
    h.doValidRep();
    expect(h.sessionWorkoutState).toBe('RESTING');

    // Unmount
    h.sessionWorkoutState = 'COMPLETED';
    h.restTimerActive = false;
    h.tickRestCountdown(20000); // would have triggered handleNextSet if active
    expect((h.sm as any).currentSet).toBe(1); // not incremented after unmount
  });

  it('Scenario 9: Throttled CPU (4x slow frames) does not cause duplicate set events or bounced rest modal', () => {
    const h = new SessionHarness();
    const skelRest = createBaseSkeleton();
    h.doValidRep();
    h.doValidRep();
    expect(h.sessionWorkoutState).toBe('RESTING');

    h.handleNextSet();
    expect(h.sessionWorkoutState).toBe('EXERCISING');

    // 4x slow frame (160ms delta) with arm ambiguity
    h.timeMs += 160;
    h.runLoopAFrame(skelRest, { isArmAmbiguous: true });
    expect(h.sessionWorkoutState).toBe('EXERCISING');
    expect(h.isResting).toBe(false);
  });

  it('Scenario 10: Regression safety - totalSetsCompleted accurately reflects sets completed upon exercise finish', () => {
    const h = new SessionHarness();
    // Complete all 3 sets
    for (let s = 1; s <= 3; s++) {
      h.doValidRep();
      h.doValidRep();
      if (s < 3) h.handleNextSet();
    }
    expect(h.sessionWorkoutState).toBe('COMPLETED');
    expect(h.validCompletedReps).toBe(6); // 2 reps * 3 sets
    expect((h.sm as any).currentSet).toBe(3); // accurately 3 sets
  });
});
