import express from 'express';
import { 
  register, 
  login, 
  getMe, 
  listUsers, 
  updateUserRole, 
  deleteUser, 
  googleRedirect, 
  googleCallback, 
  outlookRedirect, 
  outlookCallback, 
  mockConsentPage 
} from '../controllers/authController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/google/redirect', googleRedirect);
router.get('/google/callback', googleCallback);
router.get('/outlook/redirect', outlookRedirect);
router.get('/outlook/callback', outlookCallback);
router.get('/mock-consent', mockConsentPage);
router.get('/me', authMiddleware, getMe);
router.get('/users', authMiddleware, listUsers);
router.patch('/users/:id/role', authMiddleware, updateUserRole);
router.delete('/users/:id', authMiddleware, deleteUser);

export default router;
