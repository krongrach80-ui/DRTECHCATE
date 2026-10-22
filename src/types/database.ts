export type UserRole = 'admin' | 'pt' | 'patient';
export type ExerciseType = 'exercise' | 'minigame';
export type CourseMode = 'monthly' | 'weekly';
export type FacePose = 'front' | 'left' | 'right' | 'nod';
export type CourseItemStatus = 'pending' | 'completed' | 'missed';
export type CaseTransferStatus = 'active' | 'completed' | 'cancelled';
export type FaceEnrollmentStatus = 'pending' | 'completed' | 'rejected';

export interface Profile {
  id: string; // references auth.users.id
  role: UserRole;
  username: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  force_logout_at: string | null;
  created_at: string;
}

export interface Patient {
  user_id: string;
  date_of_birth: string | null;
  sex: 'male' | 'female' | 'other' | null;
  chief_complaint: string | null;
  diagnosis: string | null;
  allergies: string | null;
  chronic_diseases: string | null;
  emergency_contact: string | null;
  history: Record<string, unknown>;
}

export interface PT {
  user_id: string;
  license_no: string;
  license_expiry: string | null;
  specialty: string | null;
}

export interface PatientPTAssignment {
  id: string;
  patient_id: string;
  pt_id: string;
  is_primary: boolean;
  created_at?: string;
}

export interface CaseTransfer {
  id: string;
  patient_id: string;
  from_pt_id: string;
  to_pt_id: string;
  start_date: string;
  end_date: string;
  created_by: string;
  status: CaseTransferStatus;
  created_at: string;
}

export interface Exercise {
  id: string;
  type: ExerciseType;
  title: string;
  body_area: string;
  description: string | null;
  media_path: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Course {
  id: string;
  patient_id: string;
  pt_id: string;
  mode: CourseMode;
  start_date: string;
  end_date: string;
  created_by: string;
  created_at: string;
}

export interface CourseItem {
  id: string;
  course_id: string;
  scheduled_date: string;
  exercise_id: string;
  status: CourseItemStatus;
  created_at: string;
}

export interface MedicalNote {
  id: string;
  patient_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export interface FaceTemplate {
  id: string;
  user_id: string;
  embedding: number[];
  pose: FacePose;
  model_version: string;
  enrollment_id: string;
  created_at: string;
}

export interface FaceEnrollment {
  id: string;
  user_id: string;
  status: FaceEnrollmentStatus;
  consent_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Consent {
  id: string;
  user_id: string;
  type: string;
  text_version: string;
  granted_at: string;
  revoked_at: string | null;
}

export interface KioskDevice {
  id: string;
  name: string;
  token_hash: string;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
}

export interface KioskChallenge {
  nonce: string;
  device_id: string;
  steps: string[];
  created_at: string;
  expires_at: string;
  is_used: boolean;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  ip: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface BannedIP {
  ip: string;
  reason: string | null;
  banned_by: string | null;
  created_at: string;
  expires_at: string | null;
}
