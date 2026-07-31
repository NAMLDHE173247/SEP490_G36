import { NextFunction, Request, RequestHandler, Response } from 'express';

export type AppRole = 'admin' | 'supervisor' | 'checker' | 'staff';
export const APP_ROLES: readonly AppRole[] = ['admin', 'supervisor', 'checker', 'staff'];

export function requireRoles(...allowedRoles: AppRole[]): RequestHandler {
  const allowed = new Set<string>(allowedRoles);
  return (req: Request, res: Response, next: NextFunction) => {
    const role = String((req as any).user?.role || '').toLowerCase();
    if (!allowed.has(role)) {
      res.status(403).json({ error: `Required role: ${allowedRoles.join(' or ')}` });
      return;
    }
    next();
  };
}

export const requireAdmin = requireRoles('admin');
export const requireManager = requireRoles('admin', 'supervisor');
export const requireAssignmentReviewer = requireRoles('admin', 'supervisor', 'checker');
export const requireCheckerOrAdmin = requireRoles('admin', 'checker');
export const requireStaff = requireRoles('staff');
