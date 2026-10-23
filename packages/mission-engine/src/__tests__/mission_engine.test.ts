import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KioskStateMachine } from '../machine.js';
import { TodayCoursePlan } from '../types.js';

describe('[UNIT] DrTech.Care Kiosk State Machine (Section 9 Specification)', () => {
  let machine: KioskStateMachine;

  const mockPlan: TodayCoursePlan = {
    courseId: 'course-101',
    patientId: 'patient-999',
    patientFirstName: 'วิชัย',
    avatarUrl: 'https://example.com/avatar.jpg',
    doctorNotes: 'ระวังอาการปวดเข่าซ้ายขณะเกร็งกล้ามเนื้อ',
    exercises: [
      {
        id: 'ex-1',
        title: 'Quad Sets เกร็งกล้ามเนื้อต้นขา',
        target_sets: 3,
        target_reps: 10,
        target_duration_seconds: 30,
      },
      {
        id: 'ex-2',
        title: 'Straight Leg Raise ยกขาตรง',
        target_sets: 2,
        target_reps: 15,
      },
    ],
    includeMinigame: true,
    minigameTitle: 'เกมทดสอบความจำสี',
    minigameQuestion: {
      id: 'q-1',
      prompt: 'สีใดตรงกับภาพเมื่อสักครู่?',
      choices: ['สีแดง', 'สีน้ำเงิน', 'สีเขียว', 'สีเหลือง'],
      answer: 'สีน้ำเงิน',
    },
  };

  beforeEach(() => {
    vi.useFakeTimers();
    machine = new KioskStateMachine({
      checklistDurationMs: 5000,
      tickDurationMs: 3000,
      idleTimeoutMs: 60000,
      confirmTimeoutMs: 30000,
      noPlanTimeoutMs: 5000,
      completeTimeoutMs: 15000,
    });
  });

  it('1. Initializes in IDLE state with clean empty context', () => {
    expect(machine.getState()).toBe('IDLE');
    const ctx = machine.getContext();
    expect(ctx.patientId).toBeNull();
    expect(ctx.patientFirstName).toBeNull();
    expect(ctx.failedVerifyCount).toBe(0);
    expect(ctx.plan).toBeNull();
  });

  it('2. Transitions from IDLE -> PRESENT on face detection or tap screen', () => {
    machine.handleEvent({ type: 'FACE_PRESENT' });
    expect(machine.getState()).toBe('PRESENT');

    // Auto timeout advances to ASK_ACCOUNT after presentation
    vi.advanceTimersByTime(2000);
    expect(machine.getState()).toBe('ASK_ACCOUNT');
  });

  it('3. ASK_ACCOUNT: User with account transitions to VERIFY', () => {
    machine.handleEvent({ type: 'TAP_SCREEN' });
    expect(machine.getState()).toBe('PRESENT');
    machine.handleEvent({ type: 'TAP_SCREEN' });
    expect(machine.getState()).toBe('ASK_ACCOUNT');

    machine.handleEvent({ type: 'SELECT_HAS_ACCOUNT' });
    expect(machine.getState()).toBe('VERIFY');
  });

  it('4. ASK_ACCOUNT: User with enrollment ticket transitions to ENROLL', () => {
    machine.handleEvent({ type: 'TAP_SCREEN' });
    machine.handleEvent({ type: 'TAP_SCREEN' });

    machine.handleEvent({ type: 'SELECT_NO_ACCOUNT', ticketId: 'ticket-12345' });
    expect(machine.getState()).toBe('ENROLL');
    expect(machine.getContext().enrollmentTicketId).toBe('ticket-12345');

    // Capture 10 frames
    for (let i = 0; i < 9; i++) {
      machine.handleEvent({ type: 'ENROLL_FRAME_CAPTURED' });
      expect(machine.getState()).toBe('ENROLL');
    }
    machine.handleEvent({ type: 'ENROLL_FRAME_CAPTURED' }); // 10th frame
    expect(machine.getState()).toBe('ENROLL_DONE');

    // Auto timeout resets to IDLE
    vi.advanceTimersByTime(3000);
    expect(machine.getState()).toBe('IDLE');
  });

  it('5. VERIFY: 3 failed scans automatically transitions to CALL_STAFF (DoD 3)', () => {
    machine.handleEvent({ type: 'TAP_SCREEN' });
    machine.handleEvent({ type: 'TAP_SCREEN' });
    machine.handleEvent({ type: 'SELECT_HAS_ACCOUNT' });
    expect(machine.getState()).toBe('VERIFY');

    // Attempt 1 fail
    machine.handleEvent({ type: 'VERIFY_FAILED', error: 'ไม่พบใบหน้า' });
    expect(machine.getState()).toBe('VERIFY');
    expect(machine.getContext().failedVerifyCount).toBe(1);

    // Attempt 2 fail
    machine.handleEvent({ type: 'VERIFY_FAILED', error: 'แสงน้อย' });
    expect(machine.getState()).toBe('VERIFY');
    expect(machine.getContext().failedVerifyCount).toBe(2);

    // Attempt 3 fail -> Automatic staff call!
    machine.handleEvent({ type: 'VERIFY_FAILED', error: 'มุมไม่ตรง' });
    expect(machine.getState()).toBe('CALL_STAFF');
  });

  it('6. VERIFY -> CONFIRM: Successful verification reveals only first name and avatar', () => {
    machine.handleEvent({ type: 'TAP_SCREEN' });
    machine.handleEvent({ type: 'TAP_SCREEN' });
    machine.handleEvent({ type: 'SELECT_HAS_ACCOUNT' });

    machine.handleEvent({
      type: 'VERIFY_SUCCESS',
      patientId: 'patient-999',
      patientFirstName: 'สมชาย',
      avatarUrl: 'https://avatar.cdn/p1.png',
    });

    expect(machine.getState()).toBe('CONFIRM');
    const ctx = machine.getContext();
    expect(ctx.patientFirstName).toBe('สมชาย');
    expect(ctx.avatarUrl).toBe('https://avatar.cdn/p1.png');
    // Ensure last name / HN are NOT present in context
    expect((ctx as Record<string, unknown>).hn).toBeUndefined();
    expect((ctx as Record<string, unknown>).last_name).toBeUndefined();
  });

  it('7. CONFIRM: Patient denial ("ไม่ใช่ฉัน") immediately wipes session and resets', () => {
    machine.handleEvent({ type: 'TAP_SCREEN' });
    machine.handleEvent({ type: 'TAP_SCREEN' });
    machine.handleEvent({ type: 'SELECT_HAS_ACCOUNT' });
    machine.handleEvent({
      type: 'VERIFY_SUCCESS',
      patientId: 'patient-999',
      patientFirstName: 'สมชาย',
    });

    expect(machine.getState()).toBe('CONFIRM');
    machine.handleEvent({ type: 'CONFIRM_IDENTITY', confirmed: false });

    expect(machine.getState()).toBe('IDLE');
    expect(machine.getContext().patientId).toBeNull();
    expect(machine.getContext().patientFirstName).toBeNull();
  });

  it('8. Complete Daily Mission Flow: CHECKLIST -> STEP_PHYSIO -> TICK -> MINIGAME -> COMPLETE -> RESET', () => {
    // 1. Confirm identity
    machine.handleEvent({ type: 'TAP_SCREEN' });
    machine.handleEvent({ type: 'TAP_SCREEN' });
    machine.handleEvent({ type: 'SELECT_HAS_ACCOUNT' });
    machine.handleEvent({
      type: 'VERIFY_SUCCESS',
      patientId: 'patient-999',
      patientFirstName: 'วิชัย',
    });
    machine.handleEvent({ type: 'CONFIRM_IDENTITY', confirmed: true });
    expect(machine.getState()).toBe('LOGGED_IN');

    // 2. Load plan
    machine.handleEvent({ type: 'PLAN_LOADED', plan: mockPlan });
    expect(machine.getState()).toBe('CHECKLIST');

    // 3. 5-second preview then auto-start physio (Section 9)
    vi.advanceTimersByTime(5000);
    expect(machine.getState()).toBe('STEP_PHYSIO');
    expect(machine.getContext().currentExerciseIndex).toBe(0);

    // 4. Finish Exercise 1 -> TICK (3s checkmark) -> Exercise 2
    machine.handleEvent({ type: 'EXERCISE_STEP_DONE' });
    expect(machine.getState()).toBe('TICK');
    vi.advanceTimersByTime(3000);
    expect(machine.getState()).toBe('STEP_PHYSIO');
    expect(machine.getContext().currentExerciseIndex).toBe(1);

    // 5. Finish Exercise 2 -> TICK -> STEP_MINIGAME
    machine.handleEvent({ type: 'EXERCISE_STEP_DONE' });
    expect(machine.getState()).toBe('TICK');
    vi.advanceTimersByTime(3000);
    expect(machine.getState()).toBe('STEP_MINIGAME');

    // 6. Answer minigame -> TICK -> COMPLETE
    machine.handleEvent({ type: 'MINIGAME_ANSWER', choice: 'สีน้ำเงิน' });
    expect(machine.getContext().minigameScore).toBe(10);
    expect(machine.getState()).toBe('TICK');
    vi.advanceTimersByTime(3000);
    expect(machine.getState()).toBe('COMPLETE');

    // 7. Finish mission -> RESET -> IDLE
    machine.handleEvent({ type: 'FINISH_MISSION' });
    expect(machine.getState()).toBe('IDLE');

    // Ensure 100% memory wipe
    const ctx = machine.getContext();
    expect(ctx.patientId).toBeNull();
    expect(ctx.patientFirstName).toBeNull();
    expect(ctx.avatarUrl).toBeNull();
    expect(ctx.plan).toBeNull();
  });

  it('9. When patient has no plan today -> NO_PLAN -> 5s auto-reset to IDLE', () => {
    machine.handleEvent({ type: 'TAP_SCREEN' });
    machine.handleEvent({ type: 'TAP_SCREEN' });
    machine.handleEvent({ type: 'SELECT_HAS_ACCOUNT' });
    machine.handleEvent({
      type: 'VERIFY_SUCCESS',
      patientId: 'patient-999',
      patientFirstName: 'วิชัย',
    });
    machine.handleEvent({ type: 'CONFIRM_IDENTITY', confirmed: true });
    expect(machine.getState()).toBe('LOGGED_IN');

    // No plan today
    machine.handleEvent({ type: 'PLAN_LOADED', plan: null });
    expect(machine.getState()).toBe('NO_PLAN');

    // 5-second countdown to reset
    vi.advanceTimersByTime(5000);
    expect(machine.getState()).toBe('IDLE');
    expect(machine.getContext().patientId).toBeNull();
  });

  it('10. Emergency Call Staff can be triggered anytime and resets on handle', () => {
    machine.handleEvent({ type: 'TAP_SCREEN' });
    machine.handleEvent({
      type: 'TRIGGER_CALL_STAFF',
      reason: 'คนไข้รู้สึกเวียนศีรษะ',
      ticketId: 'call-99',
    });

    expect(machine.getState()).toBe('CALL_STAFF');
    expect(machine.getContext().staffCallTicketId).toBe('call-99');

    // Staff resolves call
    machine.handleEvent({ type: 'STAFF_CALL_HANDLED' });
    expect(machine.getState()).toBe('IDLE');
  });
});
