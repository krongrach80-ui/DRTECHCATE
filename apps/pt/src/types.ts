/**
 * apps/pt/src/types.ts
 * Physical Therapist Portal View & State Definitions (System 11)
 * Architecture Invariant: ZERO Admin views or Security/Audit tabs allowed
 */

export type PtViewTab = 
  | 'reception'      // หน้าต้อนรับ (Reception desk: search/create, send to kiosk, check-in, live queue & staff calls)
  | 'patients'       // จัดการคนไข้ (My Patients & active delegated cases)
  | 'records'        // เวชระเบียน (Clinical records: append-only notes & versioned treatment results)
  | 'exercises'      // ท่ากายภาพ (Exercise catalog: view all, edit/delete only own)
  | 'schedule'       // ตารางนัด (Schedule planner: today's queue & calendar)
  | 'profile';       // ข้อมูลตัวเอง (PT profile: phone, bio, license, specialty)

export interface PtSessionState {
  id: string;
  username: string;
  full_name: string;
  role: 'pt';
  license_no?: string;
  specialty?: string;
}
