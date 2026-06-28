import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import axios from 'axios';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_please_change_in_production';
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
    const assignedRole = isAdmin && ['admin', 'supervisor', 'staff', 'reviewer', 'checker'].includes(role) ? role : 'staff';
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

    // Create token with role
    const token = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

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

    if (!['admin', 'supervisor', 'staff', 'reviewer', 'checker'].includes(role)) {
      res.status(400).json({ error: 'Role không hợp lệ. Chỉ chấp nhận admin, supervisor, staff, reviewer, checker.' });
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

export const googleRedirect = (_req: Request, res: Response) => {
  if (!GOOGLE_CLIENT_ID) {
    res.redirect(`/api/auth/mock-consent?provider=google`);
    return;
  }

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT_URI)}&response_type=code&scope=email%20profile&state=google&prompt=select_account`;
  res.redirect(googleAuthUrl);
};

export const outlookRedirect = (_req: Request, res: Response) => {
  if (!OUTLOOK_CLIENT_ID) {
    res.redirect(`/api/auth/mock-consent?provider=outlook`);
    return;
  }

  const outlookAuthUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${OUTLOOK_CLIENT_ID}&redirect_uri=${encodeURIComponent(OUTLOOK_REDIRECT_URI)}&response_type=code&scope=user.read&state=outlook&prompt=select_account`;
  res.redirect(outlookAuthUrl);
};

export const mockConsentPage = (req: Request, res: Response) => {
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
    const passwordHash = await bcrypt.hash('social-login-secure-password-9988', salt);
    user = new User({
      name,
      email,
      passwordHash,
      role: 'staff',
      status: 'active',
    });
    await user.save();
    console.log(`🌱 Created new social user via Redirect OAuth: ${email}`);
  } else if (user.status === 'pending') {
    user.status = 'active';
    await user.save();
    console.log(`🔓 Auto-approved existing pending user via Redirect OAuth: ${email}`);
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
      email = String(mock_email);
      name = email.split('@')[0];
    } else if (code && String(code).startsWith('mock-code-')) {
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
      email = String(mock_email);
      name = email.split('@')[0];
    } else if (code && String(code).startsWith('mock-code-')) {
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
