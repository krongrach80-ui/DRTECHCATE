/**
 * DrTech.Care Kiosk Daily Mission Engine - Pure State Machine Implementation
 * Spec: Master Prompt v3 Section 9 & Section 14
 * Invariant: Zero business logic in frontend shell (apps/kiosk)
 */

import {
  KioskState,
  KioskEvent,
  MissionContext,
  MissionEngineConfig,
  DEFAULT_MISSION_CONFIG,
  TodayCoursePlan,
} from './types.js';

export function createInitialContext(): MissionContext {
  return {
    patientId: null,
    patientFirstName: null,
    avatarUrl: null,
    plan: null,
    currentExerciseIndex: 0,
    currentSet: 1,
    currentRep: 0,
    totalExercises: 0,
    minigameQuestion: null,
    minigameSelectedChoice: null,
    minigameScore: 0,
    failedVerifyCount: 0,
    staffCallTicketId: null,
    staffCallStatus: null,
    enrollmentTicketId: null,
    enrollmentFramesCount: 0,
    errorMessage: null,
  };
}

export class KioskStateMachine {
  private state: KioskState = 'IDLE';
  private context: MissionContext = createInitialContext();
  private readonly config: MissionEngineConfig;
  private readonly listeners: Set<(state: KioskState, context: MissionContext) => void> = new Set();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendingNextStateAfterTick: KioskState | null = null;

  constructor(config: Partial<MissionEngineConfig> = {}) {
    this.config = { ...DEFAULT_MISSION_CONFIG, ...config };
  }

  public getState(): KioskState {
    return this.state;
  }

  public getContext(): Readonly<MissionContext> {
    return { ...this.context };
  }

  public subscribe(listener: (state: KioskState, context: MissionContext) => void): () => void {
    this.listeners.add(listener);
    listener(this.state, this.getContext());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const ctx = this.getContext();
    for (const listener of this.listeners) {
      listener(this.state, ctx);
    }
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private setTimer(ms: number, onTimeout: () => void): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      onTimeout();
    }, ms);
  }

  /**
   * Complete memory and credentials wipe (PDPA & Session Safety)
   * Guaranteed to reset state to IDLE and erase any patient data from context.
   */
  public reset(): void {
    this.clearTimer();
    this.pendingNextStateAfterTick = null;
    this.state = 'RESET';
    this.context = createInitialContext();
    this.notify();

    // Transition smoothly back to IDLE
    this.state = 'IDLE';
    this.notify();
  }

  public handleEvent(event: KioskEvent): void {
    switch (this.state) {
      case 'IDLE':
        if (event.type === 'FACE_PRESENT' || event.type === 'TAP_SCREEN') {
          this.transitionTo('PRESENT');
        }
        break;

      case 'PRESENT':
        if (event.type === 'TAP_SCREEN' || event.type === 'TIMEOUT') {
          this.transitionTo('ASK_ACCOUNT');
        }
        break;

      case 'ASK_ACCOUNT':
        if (event.type === 'SELECT_HAS_ACCOUNT') {
          this.transitionTo('VERIFY');
        } else if (event.type === 'SELECT_NO_ACCOUNT') {
          if (event.ticketId) {
            this.context.enrollmentTicketId = event.ticketId;
            this.context.enrollmentFramesCount = 0;
            this.transitionTo('ENROLL');
          } else {
            this.context.errorMessage = 'กรุณาติดต่อเคาน์เตอร์เพื่อลงทะเบียนบัตร หรือกดเรียกเจ้าหน้าที่';
            this.transitionTo('CALL_STAFF');
          }
        }
        break;

      case 'ENROLL':
        if (event.type === 'ENROLL_FRAME_CAPTURED') {
          this.context.enrollmentFramesCount += 1;
          this.notify();
          if (this.context.enrollmentFramesCount >= 10) {
            this.transitionTo('ENROLL_DONE');
          }
        } else if (event.type === 'ENROLL_COMPLETE') {
          this.transitionTo('ENROLL_DONE');
        }
        break;

      case 'ENROLL_DONE':
        if (event.type === 'TIMEOUT' || event.type === 'TAP_SCREEN') {
          this.reset();
        }
        break;

      case 'VERIFY':
        if (event.type === 'VERIFY_SUCCESS') {
          this.context.failedVerifyCount = 0;
          this.context.patientId = event.patientId;
          this.context.patientFirstName = event.patientFirstName;
          this.context.avatarUrl = event.avatarUrl || null;
          this.context.errorMessage = null;
          this.transitionTo('CONFIRM');
        } else if (event.type === 'VERIFY_FAILED') {
          this.context.failedVerifyCount += 1;
          this.context.errorMessage = event.error || 'ไม่พบข้อมูลใบหน้า กรุณาลองใหม่อีกครั้ง';
          if (this.context.failedVerifyCount >= 3) {
            // Automatic call staff on 3 failed scans (DoD 3)
            this.transitionTo('CALL_STAFF');
          } else {
            this.notify();
          }
        }
        break;

      case 'CONFIRM':
        if (event.type === 'CONFIRM_IDENTITY') {
          if (event.confirmed) {
            this.transitionTo('LOGGED_IN');
          } else {
            // Patient denied identity -> immediate session invalidation
            this.reset();
          }
        }
        break;

      case 'LOGGED_IN':
        if (event.type === 'PLAN_LOADED') {
          if (event.plan && event.plan.exercises && event.plan.exercises.length > 0) {
            this.setPlan(event.plan);
            this.transitionTo('CHECKLIST');
          } else {
            this.transitionTo('NO_PLAN');
          }
        }
        break;

      case 'NO_PLAN':
        if (event.type === 'TIMEOUT' || event.type === 'RESET_NOW' || event.type === 'TAP_SCREEN') {
          this.reset();
        }
        break;

      case 'CHECKLIST':
        if (event.type === 'CHECKLIST_START' || event.type === 'TIMEOUT') {
          this.transitionTo('STEP_PHYSIO');
        }
        break;

      case 'STEP_PHYSIO':
        if (event.type === 'EXERCISE_STEP_DONE') {
          // Advance exercise or prepare minigame
          const nextIndex = this.context.currentExerciseIndex + 1;
          if (nextIndex < this.context.totalExercises) {
            this.context.currentExerciseIndex = nextIndex;
            this.pendingNextStateAfterTick = 'STEP_PHYSIO';
          } else if (this.context.plan?.includeMinigame) {
            this.pendingNextStateAfterTick = 'STEP_MINIGAME';
          } else {
            this.pendingNextStateAfterTick = 'COMPLETE';
          }
          this.transitionTo('TICK');
        }
        break;

      case 'TICK':
        if (event.type === 'TICK_FINISHED' || event.type === 'TIMEOUT') {
          const next = this.pendingNextStateAfterTick || 'COMPLETE';
          this.pendingNextStateAfterTick = null;
          this.transitionTo(next);
        }
        break;

      case 'STEP_MINIGAME':
        if (event.type === 'MINIGAME_ANSWER') {
          this.context.minigameSelectedChoice = event.choice;
          const isCorrect = this.context.minigameQuestion?.answer === event.choice;
          if (isCorrect) {
            this.context.minigameScore += 10;
          }
          this.pendingNextStateAfterTick = 'COMPLETE';
          this.transitionTo('TICK');
        }
        break;

      case 'COMPLETE':
        if (event.type === 'FINISH_MISSION' || event.type === 'TIMEOUT') {
          this.reset();
        }
        break;

      case 'CALL_STAFF':
        if (event.type === 'STAFF_CALL_HANDLED' || event.type === 'RESET_NOW') {
          this.reset();
        }
        break;

      case 'RESET':
        this.reset();
        break;
    }

    // Global events applicable to multiple active states
    if (event.type === 'TRIGGER_CALL_STAFF') {
      this.context.staffCallTicketId = event.ticketId || null;
      this.context.staffCallStatus = 'calling';
      this.context.errorMessage = event.reason || 'คนไข้กดเรียกเจ้าหน้าที่กายภาพบำบัด';
      this.transitionTo('CALL_STAFF');
    } else if (event.type === 'RESET_NOW') {
      this.reset();
    }
  }

  private setPlan(plan: TodayCoursePlan): void {
    this.context.plan = plan;
    this.context.totalExercises = plan.exercises.length;
    this.context.currentExerciseIndex = 0;
    this.context.currentSet = 1;
    this.context.currentRep = 0;
    this.context.minigameQuestion = plan.minigameQuestion || null;
    this.context.minigameSelectedChoice = null;
    this.context.minigameScore = 0;
  }

  private transitionTo(newState: KioskState): void {
    this.clearTimer();
    this.state = newState;
    this.notify();

    // Auto-timeout configurations per section 9
    switch (newState) {
      case 'PRESENT':
        this.setTimer(2000, () => this.handleEvent({ type: 'TIMEOUT' }));
        break;
      case 'CHECKLIST':
        // Section 9: Checklist stays for 5 seconds then auto-advances
        this.setTimer(this.config.checklistDurationMs, () =>
          this.handleEvent({ type: 'TIMEOUT' })
        );
        break;
      case 'TICK':
        // Section 9: Tick checkmark stays for 3 seconds
        this.setTimer(this.config.tickDurationMs, () =>
          this.handleEvent({ type: 'TIMEOUT' })
        );
        break;
      case 'NO_PLAN':
        this.setTimer(this.config.noPlanTimeoutMs, () =>
          this.handleEvent({ type: 'TIMEOUT' })
        );
        break;
      case 'ENROLL_DONE':
        this.setTimer(3000, () => this.handleEvent({ type: 'TIMEOUT' }));
        break;
      case 'COMPLETE':
        this.setTimer(this.config.completeTimeoutMs, () =>
          this.handleEvent({ type: 'TIMEOUT' })
        );
        break;
      case 'CONFIRM':
        this.setTimer(this.config.confirmTimeoutMs, () =>
          this.handleEvent({ type: 'CONFIRM_IDENTITY', confirmed: false })
        );
        break;
      case 'ASK_ACCOUNT':
      case 'VERIFY':
      case 'STEP_PHYSIO':
      case 'STEP_MINIGAME':
      case 'CALL_STAFF':
        // General inactivity timeout: reset to screensaver
        this.setTimer(this.config.idleTimeoutMs, () =>
          this.handleEvent({ type: 'RESET_NOW' })
        );
        break;
    }
  }
}
