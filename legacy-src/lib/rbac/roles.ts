import { UserRole } from '@/types/database';

export const ROLE_HOME_PATHS: Record<UserRole, string> = {
  admin: '/admin',
  pt: '/pt',
  patient: '/me',
};

export function isPathAllowedForRole(role: UserRole, pathname: string): boolean {
  if (pathname.startsWith('/admin') && role !== 'admin') {
    return false;
  }
  if (pathname.startsWith('/pt') && role !== 'pt') {
    return false;
  }
  if (pathname.startsWith('/me') && role !== 'patient') {
    return false;
  }
  return true;
}

export function getRedirectPathForRole(role: UserRole): string {
  return ROLE_HOME_PATHS[role] || '/login';
}
