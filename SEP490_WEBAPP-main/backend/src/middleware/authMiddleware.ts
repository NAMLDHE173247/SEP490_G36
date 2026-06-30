import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';

const JWT_SECRET: string = process.env.JWT_SECRET ?? '';
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required. Refusing to start with an insecure fallback secret.');
}

function getRequestToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }

  // Native EventSource cannot attach an Authorization header. Keep query tokens
  // narrowly scoped to authenticated SSE endpoints instead of accepting them on
  // every API route (where they can leak through logs and browser history).
  if (req.method === 'GET' && (req.path.includes('/stream/') || req.path.endsWith('/events'))) {
    const queryToken = req.query.token || req.query.access_token;
    if (typeof queryToken === 'string' && queryToken.trim()) {
      return queryToken;
    }
  }

  return null;
}

async function attachUserFromToken(req: Request, token: string): Promise<boolean> {
  const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload & {
    userId?: string;
    _id?: string;
    id?: string;
    role?: string;
  };

  const userId = decoded.userId || decoded._id || decoded.id;
  if (!userId) {
    return false;
  }

  const user = await User.findById(userId).select('_id role status').lean();
  if (!user || user.status !== 'active') return false;

  // Database is authoritative. A role/status change takes effect immediately
  // instead of waiting for the old JWT to expire.
  (req as any).user = {
    ...decoded,
    id: String(user._id),
    _id: String(user._id),
    userId: String(user._id),
    role: user.role,
    status: user.status,
  };
  return true;
}

function attachPublicUser(req: Request): void {
  (req as any).user = {
    id: 'public',
    _id: 'public',
    userId: 'public',
    role: 'public',
  };
}

// Strict auth: only for routes that must require login.
export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = getRequestToken(req);
    if (!token) {
      res.status(401).json({ error: 'Authentication required. No token provided.' });
      return;
    }

    if (!(await attachUserFromToken(req, token))) {
      res.status(401).json({ error: 'Invalid token or inactive account.' });
      return;
    }
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token.' });
    return;
  }
};

// Optional auth: if no/invalid token, continue as "public" user.
export const optionalAuthMiddleware = async (req: Request, _res: Response, next: NextFunction) => {
  const token = getRequestToken(req);
  if (token) {
    try {
      if (await attachUserFromToken(req, token)) {
        return next();
      }
    } catch (error) {
      // Fall through to public user.
    }
  }

  attachPublicUser(req);
  next();
};
