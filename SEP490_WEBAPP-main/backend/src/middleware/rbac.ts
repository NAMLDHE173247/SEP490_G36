import { Request, Response, NextFunction } from 'express';

type Role = 'admin' | 'supervisor' | 'checker' | 'staff' | string;

function getRole(req: Request): string {
  return String((req as any).user?.role || '');
}

/**
 * Build an Express guard that only lets the listed roles through.
 * Centralizes the role checks that were previously copy-pasted across route
 * files, so the RBAC boundary lives in one place.
 */
export function requireRole(roles: Role[], message: string): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    if (!roles.includes(getRole(req))) {
      res.status(403).json({ error: message });
      return;
    }
    next();
  };
}

export const requireAdmin = requireRole(['admin'], 'Admin role required.');

export const requireManager = requireRole(['admin', 'supervisor'], 'Admin or supervisor role required.');

export const requireAdjudicator = requireRole(
  ['admin', 'supervisor', 'checker'],
  'Admin, supervisor, or checker role required.',
);

export const requireStaff = requireRole(['staff'], 'Staff role required.');

export const requireUserDirectoryReader = requireRole(
  ['admin', 'supervisor'],
  'Admin or supervisor role required.',
);
