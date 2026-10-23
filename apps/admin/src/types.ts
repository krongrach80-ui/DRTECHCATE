/**
 * apps/admin/src/types.ts
 * Frontend Types for Admin Portal (Master Prompt v3 Section 8.1)
 */

export type AdminViewTab =
  | 'staff'
  | 'patients'
  | 'pts'
  | 'library'
  | 'schedule'
  | 'security';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
}
