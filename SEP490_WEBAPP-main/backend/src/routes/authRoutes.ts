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

router.post('/register', optionalAuthMiddleware, register);
router.post('/login', login);
router.get('/google/redirect', googleRedirect);
router.get('/google/callback', googleCallback);
router.get('/outlook/redirect', outlookRedirect);
router.get('/outlook/callback', outlookCallback);
router.get('/mock-consent', mockConsentPage);
router.get('/me', authMiddleware, getMe);
router.get('/users', authMiddleware, listUsers);
router.patch('/users/:id/role', authMiddleware, updateUserRole);
router.patch('/users/:id/status', authMiddleware, updateUserStatus);
router.delete('/users/:id', authMiddleware, deleteUser);

export default router;
