import express from 'express';
import { 
  register, 
  login, 
  getMe, 
  listUsers, 
  updateUserRole, 
  updateUserStatus, 
  deleteUser, 
  googleRedirect, 
  googleCallback, 
  outlookRedirect, 
  outlookCallback, 
  mockConsentPage 
} from '../controllers/authController';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/authMiddleware';

const router = express.Router();
const requireAdmin: express.RequestHandler = (req, res, next) => {
  if ((req as any).user?.role !== 'admin') {
    res.status(403).json({ error: 'Admin role required.' });
    return;
  }
  next();
};
const requireUserDirectoryReader: express.RequestHandler = (req, res, next) => {
  if (!['admin', 'supervisor'].includes(String((req as any).user?.role || ''))) {
    res.status(403).json({ error: 'Admin or supervisor role required.' });
    return;
  }
  next();
};

router.post('/register', optionalAuthMiddleware, register);
router.post('/login', login);
router.get('/google/redirect', googleRedirect);
router.get('/google/callback', googleCallback);
router.get('/outlook/redirect', outlookRedirect);
router.get('/outlook/callback', outlookCallback);
router.get('/mock-consent', mockConsentPage);
router.get('/me', authMiddleware, getMe);
router.get('/users', authMiddleware, requireUserDirectoryReader, listUsers);
router.patch('/users/:id/role', authMiddleware, requireAdmin, updateUserRole);
router.patch('/users/:id/status', authMiddleware, requireAdmin, updateUserStatus);
router.delete('/users/:id', authMiddleware, requireAdmin, deleteUser);

export default router;
