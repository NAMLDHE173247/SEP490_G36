import axios from 'axios';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { Request, Response } from 'express';
import { sendTransactionalEmail } from '../services/emailService';

// ── In-memory OTP store ────────────────────────────────────────────────────────
// { email → { otp, expiresAt } }
// Entries are automatically purged after TTL check at verification time.
const otpStore = new Map<string, { otp: string; expiresAt: number; attempts: number }>();
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OTP_MAX_ATTEMPTS = 5;

const JWT_SECRET: string = process.env.JWT_SECRET ?? '';
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required. Refusing to start with an insecure fallback secret.');
}
const JWT_EXPIRES_IN = '7d';

export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ error: 'Please provide name, email, and password.' });
      return;
    }

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(400).json({ error: 'Email is already registered.' });
      return;
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // If caller is Admin, allow setting role and status: active.
    // Otherwise, force role: staff, status: pending.
    const callingUser = (req as any).user;
    const isAdmin = callingUser && callingUser.role === 'admin';
    const assignedRole = isAdmin && ['admin', 'supervisor', 'staff', 'checker'].includes(role) ? role : 'staff';
    const assignedStatus = isAdmin ? (req.body.status || 'active') : 'pending';

    // Create user
    const user = new User({
      name,
      email,
      passwordHash,
      role: assignedRole,
      status: assignedStatus,
    });
    await user.save();

    // Pending self-registrations must not receive a usable access token.
    const token = user.status === 'active'
      ? jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
      : null;

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Please provide email and password.' });
      return;
    }

    // Check user
    const user = await User.findOne({ email });
    if (!user) {
      res.status(401).json({ error: 'Email không tồn tại trong hệ thống.' });
      return;
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ error: 'Mật khẩu không chính xác.' });
      return;
    }

    // Check approval/activation status
    if (user.status === 'pending') {
      res.status(403).json({ error: 'Tài khoản của bạn đang chờ phê duyệt.' });
      return;
    }
    if (user.status === 'banned' || user.status === 'inactive') {
      res.status(403).json({ error: 'Tài khoản của bạn đã bị vô hiệu hóa.' });
      return;
    }

    // Update lastLogin time
    user.lastLogin = new Date();
    await user.save();

    // Create token with role
    const token = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    res.status(200).json({
      message: 'Logged in successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        lastLogin: user.lastLogin,
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const getMe = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const user = await User.findById(userId).select('-passwordHash');
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    res.status(200).json(user);
  } catch (error: any) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const listUsers = async (_req: Request, res: Response) => {
  try {
    const users = await User.find({})
      .select('_id name email role status createdAt lastLogin')
      .sort({ name: 1, email: 1 })
      .lean();

    res.status(200).json({
      users: users.map((user: any) => ({
        id: String(user._id),
        name: String(user.name || ''),
        email: String(user.email || ''),
        role: String(user.role || 'staff'),
        status: String(user.status || 'active'),
        createdAt: user.createdAt,
        lastLogin: user.lastLogin || null,
      })),
    });
  } catch (error: any) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const updateUserRole = async (req: Request, res: Response) => {
  try {
    const callingUser = (req as any).user;
    if (callingUser?.role !== 'admin') {
      res.status(403).json({ error: 'Quyền truy cập bị từ chối. Chỉ dành cho Admin.' });
      return;
    }

    const { id } = req.params;
    const { role } = req.body;

    if (!['admin', 'supervisor', 'staff', 'checker'].includes(role)) {
      res.status(400).json({ error: 'Role không hợp lệ. Chỉ chấp nhận admin, supervisor, staff, checker.' });
      return;
    }

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { $set: { role } },
      { new: true }
    ).select('-passwordHash');

    if (!updatedUser) {
      res.status(404).json({ error: 'Không tìm thấy người dùng.' });
      return;
    }

    res.status(200).json({
      message: 'Cập nhật vai trò thành công.',
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
      },
    });
  } catch (error: any) {
    console.error('Update user role error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const callingUser = (req as any).user;
    if (callingUser?.role !== 'admin') {
      res.status(403).json({ error: 'Quyền truy cập bị từ chối. Chỉ dành cho Admin.' });
      return;
    }

    const { id } = req.params;
    const deletedUser = await User.findByIdAndDelete(id);

    if (!deletedUser) {
      res.status(404).json({ error: 'Không tìm thấy người dùng.' });
      return;
    }

    res.status(200).json({
      message: 'Đã xóa tài khoản người dùng thành công.',
      deletedId: id,
    });
  } catch (error: any) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || '';

const OUTLOOK_CLIENT_ID = process.env.OUTLOOK_CLIENT_ID || '';
const OUTLOOK_CLIENT_SECRET = process.env.OUTLOOK_CLIENT_SECRET || '';
const OUTLOOK_REDIRECT_URI = process.env.OUTLOOK_REDIRECT_URI || '';

const FRONTEND_URL = process.env.FRONTEND_URL || '';

// The mock OAuth screens let anyone sign in as an arbitrary email without a real
// identity provider. That is a login bypass, so it is only allowed outside
// production (or with an explicit opt-in for controlled staging).
const ALLOW_MOCK_OAUTH = process.env.NODE_ENV !== 'production' || process.env.ALLOW_MOCK_OAUTH === 'true';

export const googleRedirect = (_req: Request, res: Response) => {
  if (!GOOGLE_CLIENT_ID) {
    if (!ALLOW_MOCK_OAUTH) {
      res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent('Google login chưa được cấu hình.')}`);
      return;
    }
    res.redirect(`/api/auth/mock-consent?provider=google`);
    return;
  }

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT_URI)}&response_type=code&scope=email%20profile&state=google&prompt=select_account`;
  res.redirect(googleAuthUrl);
};

export const outlookRedirect = (_req: Request, res: Response) => {
  if (!OUTLOOK_CLIENT_ID) {
    if (!ALLOW_MOCK_OAUTH) {
      res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent('Outlook login chưa được cấu hình.')}`);
      return;
    }
    res.redirect(`/api/auth/mock-consent?provider=outlook`);
    return;
  }

  const outlookAuthUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${OUTLOOK_CLIENT_ID}&redirect_uri=${encodeURIComponent(OUTLOOK_REDIRECT_URI)}&response_type=code&scope=user.read&state=outlook&prompt=select_account`;
  res.redirect(outlookAuthUrl);
};

export const mockConsentPage = (req: Request, res: Response) => {
  if (!ALLOW_MOCK_OAUTH) {
    res.status(404).json({ error: 'Not found.' });
    return;
  }
  const { provider } = req.query;
  const isGoogle = provider === 'google';
  const providerName = isGoogle ? 'Google' : 'Microsoft Outlook';
  const accentColor = isGoogle ? '#4285F4' : '#0078D4';

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Mock ${providerName} Sign-In</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          background-color: #0f172a;
          color: #f8fafc;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
        }
        .card {
          background-color: #1e293b;
          border: 1px solid #334155;
          border-radius: 16px;
          padding: 32px;
          width: 100%;
          max-width: 360px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
          text-align: center;
        }
        h2 {
          margin-top: 0;
          color: #f1f5f9;
          font-size: 22px;
          font-weight: 700;
          margin-bottom: 10px;
        }
        p {
          color: #94a3b8;
          font-size: 13px;
          margin-bottom: 24px;
          line-height: 1.5;
        }
        input {
          width: 100%;
          padding: 12px;
          border: 1px solid #475569;
          border-radius: 8px;
          background-color: #0f172a;
          color: #f8fafc;
          box-sizing: border-box;
          font-size: 14px;
          margin-bottom: 16px;
          outline: none;
        }
        input:focus {
          border-color: ${accentColor};
        }
        button {
          width: 100%;
          padding: 12px;
          border: none;
          border-radius: 8px;
          background-color: ${accentColor};
          color: white;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }
        button:hover {
          opacity: 0.9;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>Sign in with ${providerName}</h2>
        <p>This is a local simulation of the OAuth screen. Please enter your email to proceed.</p>
        <form action="/api/auth/${isGoogle ? 'google' : 'outlook'}/callback" method="GET">
          <input type="email" name="mock_email" placeholder="name@email.com" required />
          <button type="submit">Sign In</button>
        </form>
      </div>
    </body>
    </html>
  `);
};

const handleSocialCallbackUser = async (email: string, name: string) => {
  let user = await User.findOne({ email });
  if (!user) {
    const salt = await bcrypt.genSalt(10);
    // Social accounts authenticate via the provider, never via password. Use a
    // random unguessable secret so the account cannot be taken over with a
    // shared/known password through the normal login form.
    const randomPassword = crypto.randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(randomPassword, salt);
    user = new User({
      name,
      email,
      passwordHash,
      role: 'staff',
      status: 'pending',
    });
    await user.save();
    console.log(`🌱 Created new social user via Redirect OAuth: ${email}`);
  }

  if (user.status === 'pending') {
    throw new Error('Account is pending administrator approval.');
  }
  if (user.status === 'banned' || user.status === 'inactive') {
    throw new Error('Tài khoản của bạn đã bị vô hiệu hóa.');
  }

  user.lastLogin = new Date();
  await user.save();

  const token = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  return {
    token,
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      lastLogin: user.lastLogin,
    }
  };
};

export const googleCallback = async (req: Request, res: Response) => {
  try {
    const { code, mock_email } = req.query;

    let email = '';
    let name = '';

    if (mock_email) {
      if (!ALLOW_MOCK_OAUTH) {
        res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent('Mock OAuth bị vô hiệu hóa.')}`);
        return;
      }
      email = String(mock_email);
      name = email.split('@')[0];
    } else if (code && String(code).startsWith('mock-code-')) {
      if (!ALLOW_MOCK_OAUTH) {
        res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent('Mock OAuth bị vô hiệu hóa.')}`);
        return;
      }
      email = String(code).replace('mock-code-', '');
      name = email.split('@')[0];
    } else if (code) {
      try {
        const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: GOOGLE_REDIRECT_URI,
          grant_type: 'authorization_code',
        });
        const accessToken = tokenResponse.data.access_token;
        const profileResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        email = profileResponse.data.email || '';
        if (!email) {
          throw new Error('Không thể lấy thông tin email từ tài khoản Google.');
        }
        name = profileResponse.data.name || email.split('@')[0];
      } catch (err: any) {
        const detail = err.response?.data?.error_description || err.response?.data?.error || err.message;
        console.error('Google OAuth Exchange failed:', detail);
        res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent('Đăng nhập Google thất bại: ' + detail)}`);
        return;
      }
    } else {
      res.redirect(`${FRONTEND_URL}/login?error=no_code_provided`);
      return;
    }

    const authData = await handleSocialCallbackUser(email, name);
    res.redirect(`${FRONTEND_URL}/login?token=${authData.token}&user=${encodeURIComponent(JSON.stringify(authData.user))}`);
  } catch (error: any) {
    console.error('Google callback error:', error);
    res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent(error.message || 'google_auth_failed')}`);
  }
};

export const outlookCallback = async (req: Request, res: Response) => {
  try {
    const { code, mock_email } = req.query;

    let email = '';
    let name = '';

    if (mock_email) {
      if (!ALLOW_MOCK_OAUTH) {
        res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent('Mock OAuth bị vô hiệu hóa.')}`);
        return;
      }
      email = String(mock_email);
      name = email.split('@')[0];
    } else if (code && String(code).startsWith('mock-code-')) {
      if (!ALLOW_MOCK_OAUTH) {
        res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent('Mock OAuth bị vô hiệu hóa.')}`);
        return;
      }
      email = String(code).replace('mock-code-', '');
      name = email.split('@')[0];
    } else if (code) {
      try {
        const tokenResponse = await axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token', new URLSearchParams({
          code: String(code),
          client_id: OUTLOOK_CLIENT_ID,
          client_secret: OUTLOOK_CLIENT_SECRET,
          redirect_uri: OUTLOOK_REDIRECT_URI,
          grant_type: 'authorization_code',
        }).toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        const accessToken = tokenResponse.data.access_token;
        const profileResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        email = profileResponse.data.mail || profileResponse.data.userPrincipalName || '';
        if (!email) {
          throw new Error('Không thể lấy thông tin email từ tài khoản Microsoft.');
        }
        name = profileResponse.data.displayName || email.split('@')[0];
      } catch (err: any) {
        const detail = err.response?.data?.error_description || err.response?.data?.error || err.message;
        console.error('Outlook OAuth Exchange failed:', detail);
        res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent('Đăng nhập Outlook thất bại: ' + detail)}`);
        return;
      }
    } else {
      res.redirect(`${FRONTEND_URL}/login?error=no_code_provided`);
      return;
    }

    const authData = await handleSocialCallbackUser(email, name);
    res.redirect(`${FRONTEND_URL}/login?token=${authData.token}&user=${encodeURIComponent(JSON.stringify(authData.user))}`);
  } catch (error: any) {
    console.error('Outlook callback error:', error);
    res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent(error.message || 'outlook_auth_failed')}`);
  }
};

export const updateUserStatus = async (req: Request, res: Response) => {
  try {
    const callingUser = (req as any).user;
    if (callingUser?.role !== 'admin') {
      res.status(403).json({ error: 'Quyền truy cập bị từ chối. Chỉ dành cho Admin.' });
      return;
    }

    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'pending', 'banned', 'inactive'].includes(status)) {
      res.status(400).json({ error: 'Trạng thái không hợp lệ. Chỉ chấp nhận active, pending, banned, inactive.' });
      return;
    }

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { $set: { status } },
      { new: true }
    ).select('-passwordHash');

    if (!updatedUser) {
      res.status(404).json({ error: 'Không tìm thấy người dùng.' });
      return;
    }

    res.status(200).json({
      message: 'Cập nhật trạng thái thành công.',
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        status: updatedUser.status,
      },
    });
  } catch (error: any) {
    console.error('Update user status error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// ── Forgot Password — Step 1: Request OTP ─────────────────────────────────────
export const requestPasswordResetOtp = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'Vui lòng cung cấp địa chỉ email.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    // Always respond with the same message to avoid user enumeration
    if (!user) {
      res.status(200).json({ message: 'Nếu email tồn tại, mã OTP đã được gửi.' });
      return;
    }

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    otpStore.set(normalizedEmail, { otp, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });

    // Never log the OTP: logs are a common exfiltration path for account takeover.

    // Send email (non-blocking; failure is logged but not surfaced to user)
    void sendTransactionalEmail({
      to: normalizedEmail,
      subject: '[SEP490] Mã xác thực đặt lại mật khẩu',
      text: `Xin chào ${user.name},\n\nMã OTP đặt lại mật khẩu của bạn là: ${otp}\n\nMã có hiệu lực trong 10 phút. Không chia sẻ mã này với bất kỳ ai.\n\nNếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.\n\n— SEP490 Learning Hub`,
    }).then((result) => {
      if (!result.sent && result.reason !== 'email_not_configured') {
        console.warn('[OTP Email] Delivery failed:', result.reason);
      }
    });

    res.status(200).json({ message: 'Nếu email tồn tại, mã OTP đã được gửi.' });
  } catch (error: any) {
    console.error('requestPasswordResetOtp error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// ── Forgot Password — Step 2: Verify OTP & Reset Password ────────────────────
export const verifyOtpAndResetPassword = async (req: Request, res: Response) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      res.status(400).json({ error: 'Vui lòng cung cấp email, mã OTP và mật khẩu mới.' });
      return;
    }
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const entry = otpStore.get(normalizedEmail);

    if (!entry) {
      res.status(400).json({ error: 'Mã OTP không hợp lệ hoặc đã hết hạn.' });
      return;
    }
    if (Date.now() > entry.expiresAt) {
      otpStore.delete(normalizedEmail);
      res.status(400).json({ error: 'Mã OTP đã hết hạn. Vui lòng yêu cầu mã mới.' });
      return;
    }
    // Bound the number of guesses so a 6-digit OTP cannot be brute-forced
    // within its 10-minute lifetime.
    if (entry.attempts >= OTP_MAX_ATTEMPTS) {
      otpStore.delete(normalizedEmail);
      res.status(429).json({ error: 'Bạn đã nhập sai OTP quá nhiều lần. Vui lòng yêu cầu mã mới.' });
      return;
    }
    if (entry.otp !== String(otp).trim()) {
      entry.attempts += 1;
      otpStore.set(normalizedEmail, entry);
      res.status(400).json({ error: 'Mã OTP không chính xác.' });
      return;
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      res.status(400).json({ error: 'Không tìm thấy tài khoản.' });
      return;
    }

    // Hash and update password
    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    await user.save();

    // Invalidate OTP immediately
    otpStore.delete(normalizedEmail);

    res.status(200).json({ message: 'Mật khẩu đã được đặt lại thành công. Vui lòng đăng nhập lại.' });
  } catch (error: any) {
    console.error('verifyOtpAndResetPassword error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId || (req as any).user?.id || (req as any).user?._id;
    const { name } = req.body;

    if (!userId || userId === 'public') {
      res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ.' });
      return;
    }

    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'Tên người dùng không được để trống.' });
      return;
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { name: name.trim() } },
      { new: true }
    ).select('-passwordHash');

    if (!user) {
      res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
      return;
    }

    res.status(200).json({
      message: 'Cập nhật thông tin tài khoản thành công.',
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error: any) {
    console.error('updateProfile error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const changePassword = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId || (req as any).user?.id || (req as any).user?._id;
    const { currentPassword, newPassword } = req.body;

    if (!userId || userId === 'public') {
      res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ.' });
      return;
    }

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới.' });
      return;
    }

    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
      return;
    }

    let isMatch = false;
    if (user.passwordHash) {
      isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    }

    if (!isMatch) {
      res.status(400).json({ error: 'Mật khẩu hiện tại không chính xác.' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    await user.save();
    res.status(200).json({ message: 'Đổi mật khẩu thành công.' });
  } catch (error: any) {
    console.error('changePassword error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

