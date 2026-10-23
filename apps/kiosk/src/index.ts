/**
 * DrTech.Care Kiosk Terminal Application Client & UI (System 12)
 * Communicates strictly with Express API (/api/kiosk/*)
 * Architecture Invariant: ZERO Supabase SDK imports or tokens
 */

export * from './App.js';
export * from './components/Header.js';
export * from './components/MirrorCanvas.js';
export * from './components/FloatingLogo.js';
export * from './components/PairingModal.js';
export * from './views/IdleView.js';
export * from './views/PresentView.js';
export * from './views/AskAccountView.js';
export * from './views/VerifyView.js';
export * from './views/ConfirmView.js';
export * from './views/NoPlanView.js';
export * from './views/ChecklistView.js';
export * from './views/PhysioStepView.js';
export * from './views/MinigameStepView.js';
export * from './views/TickView.js';
export * from './views/CompleteView.js';
export * from './views/CallStaffView.js';
export * from './views/EnrollView.js';

import {
  KioskPairingPayload,
  KioskPairingResult,
  BiometricChallenge,
  BiometricVerificationRequest,
  BiometricVerificationResult,
  StaffCallRequest,
  ApiResponse,
} from '../../../packages/shared/src/index.js';

export class KioskClient {
  private readonly baseUrl: string;
  private sessionToken: string | null = null;
  private kioskId: string | null = null;

  constructor(baseUrl: string = '/api/kiosk') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  public setSession(kioskId: string, token: string): void {
    this.kioskId = kioskId;
    this.sessionToken = token;
  }

  public clearSession(): void {
    this.kioskId = null;
    this.sessionToken = null;
  }

  public isPaired(): boolean {
    return this.kioskId !== null && this.sessionToken !== null;
  }

  public async pairKiosk(payload: KioskPairingPayload): Promise<KioskPairingResult> {
    const res = await fetch(`${this.baseUrl}/pair`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify(payload),
    });

    const json = (await res.json()) as ApiResponse<KioskPairingResult>;
    if (!res.ok || !json.ok || !json.data) {
      throw new Error(json.error?.message || `Kiosk pairing failed with HTTP ${res.status}`);
    }

    if (json.data.token) {
      this.setSession(json.data.kioskId, json.data.token);
    }
    return json.data;
  }

  public async requestBiometricChallenge(): Promise<BiometricChallenge> {
    const res = await fetch(`${this.baseUrl}/challenge`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({ kioskId: this.kioskId }),
    });

    const json = (await res.json()) as ApiResponse<BiometricChallenge>;
    if (!res.ok || !json.ok || !json.data) {
      throw new Error(json.error?.message || 'Failed to request liveness challenge');
    }
    return json.data;
  }

  public async verifyFace(req: BiometricVerificationRequest): Promise<BiometricVerificationResult> {
    const res = await fetch(`${this.baseUrl}/verify-face`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(req),
    });

    const json = (await res.json()) as ApiResponse<BiometricVerificationResult>;
    if (!res.ok || !json.ok || !json.data) {
      throw new Error(json.error?.message || 'Biometric verification request failed');
    }
    return json.data;
  }

  public async callStaff(req: StaffCallRequest): Promise<{ ticketId: string }> {
    const res = await fetch(`${this.baseUrl}/call-staff`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(req),
    });

    const json = (await res.json()) as ApiResponse<{ ticketId: string }>;
    if (!res.ok || !json.ok || !json.data) {
      throw new Error(json.error?.message || 'Failed to trigger staff assistance call');
    }
    return json.data;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    };
    if (this.sessionToken) {
      headers['Authorization'] = `Bearer ${this.sessionToken}`;
    }
    return headers;
  }
}
