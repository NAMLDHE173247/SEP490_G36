import express from 'express';
import rateLimit from 'express-rate-limit';
import { requireAdmin, requireUserDirectoryReader } from '../middleware/rbac';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/authMiddleware';
import { 
  login, 
  getMe, 
  register, 
  listUsers, 
  deleteUser, 
  updateUserRole, 
  googleRedirect, 
  googleCallback, 
  mockConsentPage,
  outlookRedirect, 
  outlookCallback, 
  updateUserStatus, 
  requestPasswordResetOtp,
  verifyOtpAndResetPassword,
} from '../controllers/authController';

const router = express.Router();

// Throttle credential-guessing endpoints. Keyed by IP; brute-force of
// passwords and 6-digit OTPs is otherwise unbounded within the OTP TTL.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.' },
});


router.get('/me', authMiddleware, getMe);
router.post('/login', authLimiter, login);
router.get('/mock-consent', mockConsentPage);
router.get('/google/redirect', googleRedirect);
router.get('/google/callback', googleCallback);
router.get('/outlook/redirect', outlookRedirect);
router.get('/outlook/callback', outlookCallback);
router.post('/register', optionalAuthMiddleware, register);
router.post('/forgot-password', authLimiter, requestPasswordResetOtp);
router.delete('/users/:id', authMiddleware, requireAdmin, deleteUser);
router.post('/reset-password', authLimiter, verifyOtpAndResetPassword);
router.get('/users', authMiddleware, requireUserDirectoryReader, listUsers);
router.patch('/users/:id/role', authMiddleware, requireAdmin, updateUserRole);
router.patch('/users/:id/status', authMiddleware, requireAdmin, updateUserStatus);
export default router;
