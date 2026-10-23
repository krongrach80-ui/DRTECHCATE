/**
 * DrTech.Care Kiosk Daily Mission Engine - Types & State Definitions
 * Implements Master Prompt v3 Section 9 State Machine Specification
 */

export type KioskState =
  | 'IDLE'          // Floating DrTech screensaver, waiting for patient
  | 'PRESENT'       // Face detected (~1s stable) / screen tapped, logo slides up, mirror view
  | 'ASK_ACCOUNT'   // "มีประวัติแล้ว" / "ยังไม่มีประวัติ"
  | 'ENROLL'        // 10 frames enrollment loop
  | 'ENROLL_DONE'   // Enrollment completed successfully -> resets to IDLE
  | 'VERIFY'        // Biometric challenge & probe vector verification
  | 'CONFIRM'       // Privacy minimization identity check ("คุณ [ชื่อต้น] ใช่หรือไม่?")
  | 'LOGGED_IN'     // Fetching today's plan from GET /api/kiosk/plan
  | 'NO_PLAN'       // "วันนี้แพทย์ไม่ได้นัดหมายกายภาพ" -> 5s reset
  | 'CHECKLIST'     // 5s preview of prescribed exercises + minigame
  | 'STEP_PHYSIO'   // Active exercise rep/set guidance with mirror canvas
  | 'STEP_MINIGAME' // Cognitive / coordination minigame step
  | 'TICK'          // 3-second completion tick animation
  | 'COMPLETE'      // "ยินดีด้วย คุณฝึกเสร็จเรียบร้อยแล้ว" + PT notes
  | 'RESET'         // Complete memory wipe of all patient data, tokens, and stream
  | 'CALL_STAFF';   // Staff call triggered (manual or 3 failed verifies)

export interface PlanExerciseItem {
  id: string;
  title: string;
  description?: string | null;
  image_path?: string | null;
  target_sets: number;
  target_reps: number;
  target_duration_seconds?: number;
}

export interface MinigameQuestion {
  id: string;
  prompt: string;
  choices: string[];
  answer: string;
}

export interface TodayCoursePlan {
  courseId: string;
  patientId: string;
  patientFirstName: string;
  avatarUrl?: string | null;
  doctorNotes?: string | null;
  exercises: PlanExerciseItem[];
  includeMinigame: boolean;
  minigameTitle?: string;
  minigameQuestion?: MinigameQuestion | null;
}

export interface MissionEngineConfig {
  checklistDurationMs: number;
  tickDurationMs: number;
  idleTimeoutMs: number;
  confirmTimeoutMs: number;
  noPlanTimeoutMs: number;
  completeTimeoutMs: number;
}

export const DEFAULT_MISSION_CONFIG: MissionEngineConfig = {
  checklistDurationMs: 5000,
  tickDurationMs: 3000,
  idleTimeoutMs: 60000,
  confirmTimeoutMs: 30000,
  noPlanTimeoutMs: 5000,
  completeTimeoutMs: 15000,
};

export interface MissionContext {
  // Identity (Zero PII kept after RESET)
  patientId: string | null;
  patientFirstName: string | null;
  avatarUrl: string | null;

  // Plan & Progress
  plan: TodayCoursePlan | null;
  currentExerciseIndex: number;
  currentSet: number;
  currentRep: number;
  totalExercises: number;

  // Minigame
  minigameQuestion: MinigameQuestion | null;
  minigameSelectedChoice: string | null;
  minigameScore: number;

  // Status & Failure Counters
  failedVerifyCount: number;
  staffCallTicketId: string | null;
  staffCallStatus: 'calling' | 'handled' | null;
  enrollmentTicketId: string | null;
  enrollmentFramesCount: number;
  errorMessage: string | null;
}

export type KioskEvent =
  | { type: 'FACE_PRESENT' }
  | { type: 'TAP_SCREEN' }
  | { type: 'SELECT_HAS_ACCOUNT' }
  | { type: 'SELECT_NO_ACCOUNT'; ticketId?: string }
  | { type: 'VERIFY_SUCCESS'; patientId: string; patientFirstName: string; avatarUrl?: string | null }
  | { type: 'VERIFY_FAILED'; error?: string }
  | { type: 'CONFIRM_IDENTITY'; confirmed: boolean }
  | { type: 'PLAN_LOADED'; plan: TodayCoursePlan | null }
  | { type: 'CHECKLIST_START' }
  | { type: 'EXERCISE_STEP_DONE' }
  | { type: 'MINIGAME_ANSWER'; choice: string }
  | { type: 'TICK_FINISHED' }
  | { type: 'FINISH_MISSION' }
  | { type: 'TRIGGER_CALL_STAFF'; reason?: string; ticketId?: string }
  | { type: 'STAFF_CALL_HANDLED' }
  | { type: 'ENROLL_FRAME_CAPTURED' }
  | { type: 'ENROLL_COMPLETE' }
  | { type: 'TIMEOUT' }
  | { type: 'RESET_NOW' };
