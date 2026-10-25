/**
 * packages/smart-biometric-core/src/types.ts
 * Master Prompt v4: Sovereign Isolated Medical-Grade Architecture
 * US HIPAA/NIST + UK NHS DCB0129 + China Tier-3A Smart Hospital AI Standard
 */

export type SmartRegistrationStatus =
  | 'face_registered_pending_info'
  | 'active'
  | 'archived';

export interface PrescribedExercise {
  exercise_id: string;
  name: string;
  target_joint: string;
  sets: number;
  reps: number;
  demo_url?: string;
  target_angle?: number;
  safety_warnings?: string;
}

export interface TherapySchedule {
  start_date?: string; // ISO date 'YYYY-MM-DD'
  startDate?: string;
  end_date?: string; // ISO date 'YYYY-MM-DD'
  endDate?: string;
  days_of_week?: string[]; // e.g. ['Mon', 'Wed', 'Fri']
  daysOfWeek?: string[];
  time_slot?: string; // e.g. '09:00 - 10:00'
  timeSlot?: string;
  assigned_kiosk_id?: string; // e.g. 'kiosk-01'
  kioskId?: string;
  include_minigame: boolean;
  modpack_name?: string;
  prescribed_exercises?: PrescribedExercise[];
  assigned_exercises?: PrescribedExercise[];
}

export interface RehabScoreEntry {
  session_id?: string;
  date?: string;
  timestamp?: string;
  completion_rate?: number;
  exercises_completed?: number;
  minigame_score?: number;
  total_score?: number;
  exercise_score?: {
    completed_reps: number;
    completed_sets: number;
    accuracy_percentage?: number;
  };
  quiz_score?: {
    score: number;
    total: number;
    time_taken_seconds?: number;
  };
  completed_at?: string;
}

export interface PatientRecordFile {
  patient_id: string; // Primary Key / HN
  hn: string;
  first_name: string;
  last_name: string;
  age: number;
  gender: string;
  phone?: string;
  initial_symptoms?: string;
  registration_status: SmartRegistrationStatus;
  registered_via: 'kiosk' | 'reception' | 'smart_onboarding';
  created_at: string;
  updated_at: string;

  // Biometrics
  biometrics: {
    face_vector: number[]; // 512-dim normalized embedding
    registered_face_url: string; // e.g. /uploads/patients/{patient_id}/profile_face.jpg
    confidence_score: number;
    model_version: string;
    enrolled_at: string;
  };

  // Therapy Schedule & Modpack Config
  schedule?: TherapySchedule | null;

  // Rehab & Game Scores
  daily_checklists: Record<string, boolean>;
  rehab_scores: RehabScoreEntry[];

  // Clinical Records (Append-only)
  clinical: {
    diagnosis: string;
    treatment_plan: string;
    progress_notes: Array<{
      author_id: string;
      author_name: string;
      note: string;
      created_at: string;
    }>;
  };
}

export interface BiometricMatchResult {
  isMatch: boolean;
  cosineSimilarity: number;
  euclideanDistance: number;
  similarityPercentage: number;
  matchedPatientId?: string;
  matchedPatientName?: string;
}

export interface SmartOnboardingPendingPatient {
  patient_id: string;
  hn: string;
  first_name: string;
  last_name: string;
  registration_status: SmartRegistrationStatus;
  photo_url: string;
  created_at: string;
}
