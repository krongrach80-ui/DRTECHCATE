/**
 * Shared types and constants across DrTech.Care packages
 */
export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
  };
}
