/**
 * DrTech.Care Hospital Physical Therapy System
 * Shared Core Types, Enums, DTOs and Contracts
 * Zero external dependencies - safe for frontend and backend consumption
 */

export type UserRole = 'admin' | 'pt' | 'receptionist';

export interface UserProfile {
  id: string;
  username: string;
  role: UserRole;
  fullName: string;
  phoneNumber?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PatientSummary {
  id: string;
  hn: string;
  fullName: string;
  dateOfBirth?: string;
  gender?: 'M' | 'F' | 'OTHER';
  phone?: string;
  primaryPtId?: string;
  status: 'ACTIVE' | 'DISCHARGED' | 'ARCHIVED';
  createdAt: string;
}

export interface KioskDevice {
  id: string;
  name: string;
  location: string;
  ipAddress?: string;
  macAddress?: string;
  status: 'ACTIVE' | 'OFFLINE' | 'SUSPENDED';
  pairedAt?: string;
  lastHeartbeatAt?: string;
}

export interface KioskPairingPayload {
  kioskId: string;
  pairingCode: string;
  clientNonce: string;
}

export interface KioskPairingResult {
  paired: boolean;
  kioskId: string;
  kioskName: string;
  token?: string;
  expiresInSeconds?: number;
}

export interface BiometricChallenge {
  challengeId: string;
  kioskId: string;
  actionSequence: ('BLINK' | 'TURN_LEFT' | 'TURN_RIGHT' | 'NOD')[];
  expiresAt: string;
}

export interface BiometricVerificationRequest {
  challengeId: string;
  kioskId: string;
  framesCount: number;
  faceEmbeddingVector: number[]; // 512 dimensions
}

export interface BiometricVerificationResult {
  verified: boolean;
  patientId?: string;
  hn?: string;
  patientName?: string;
  confidenceScore?: number;
  matchType?: 'ACCEPT' | 'REJECT' | 'AMBIGUOUS';
}

export interface StaffCallRequest {
  kioskId: string;
  reason: 'FACE_FAILED_3_TIMES' | 'PATIENT_ASSISTANCE_NEEDED' | 'HARDWARE_ISSUE';
  notes?: string;
}

export interface MedicalNoteEntry {
  id: string;
  patientId: string;
  ptId: string;
  noteText: string;
  createdAt: string;
}

export interface TreatmentResultEntry {
  id: string;
  patientId: string;
  ptId: string;
  version: number;
  supersedesId?: string;
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  createdAt: string;
}

export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    ref?: string;
  };
}
