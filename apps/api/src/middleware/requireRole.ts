import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

/**
 * Role-Based Access Control Middleware
 * Requires that req.user is populated by authenticate middleware
 * and has one of the allowed roles.
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
    }

    const userRole = (req.user.role || '').toLowerCase();
    const isDirectorOrAdmin = userRole === 'director' || userRole === 'superadmin' || userRole === 'admin';
    const hasRole = allowedRoles.includes(userRole) || (isDirectorOrAdmin && allowedRoles.includes('admin'));

    if (!hasRole) {
      return next(new AppError('Forbidden: insufficient permissions', 403, 'FORBIDDEN'));
    }

    next();
  };
}
