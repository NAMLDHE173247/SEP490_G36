import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Eye, EyeOff } from 'lucide-react';
import '../styles/auth.css';

// SVG Icons
const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

const OutlookIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M1 4.5l10.5-2v19l-10.5-2v-15z" fill="#0078D4" />
    <path d="M11.5 2.5v19H23V2.5H11.5z" fill="#28A8EA" />
    <path d="M6 9.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5zm0 5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5z" fill="#FFF" />
  </svg>
);

function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, login } = useAuth();
  const [isLogin, setIsLogin] = useState(true);

  // Redirect to dashboard if user is already logged in
  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (location.pathname === '/register') {
      setIsLogin(false);
    } else {
      setIsLogin(true);
    }
    setRegisterSuccess(false);
    setErrorMsg('');
    setName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');

    // Check for redirect OAuth response parameters
    const params = new URLSearchParams(location.search);
    const redirectToken = params.get('token');
    const redirectUserStr = params.get('user');
    const redirectError = params.get('error');

    if (redirectError) {
      setErrorMsg(
        redirectError === 'google_auth_failed' ? 'Đăng nhập Google thất bại.' :
          redirectError === 'outlook_auth_failed' ? 'Đăng nhập Outlook thất bại.' :
            decodeURIComponent(redirectError)
      );
      navigate('/login', { replace: true });
    } else if (redirectToken && redirectUserStr) {
      try {
        const decodedUser = JSON.parse(decodeURIComponent(redirectUserStr));
        login(decodedUser, redirectToken);
        navigate('/dashboard', { replace: true });
      } catch (err) {
        console.error('Failed to parse redirect user details:', err);
        setErrorMsg('Lỗi đồng bộ thông tin đăng nhập.');
      }
    }
  }, [location]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    // --- REGISTER MODE ---
    if (!isLogin) {
      if (password !== confirmPassword) {
        setErrorMsg('Mật khẩu xác nhận không trùng khớp.');
        return;
      }
      try {
        await api.post('/auth/register', { name, email, password, role: 'staff' });
        setRegisterSuccess(true);
      } catch (error: any) {
        setErrorMsg(error.response?.data?.error || 'Đăng ký thất bại. Vui lòng thử lại.');
      }
      return;
    }

    // --- LOGIN MODE ---
    try {
      const res = await api.post('/auth/login', { email, password });
      login(res.data.user, res.data.token);
      navigate('/dashboard');
    } catch (error: any) {
      setErrorMsg(error.response?.data?.error || 'Đăng nhập thất bại. Vui lòng kiểm tra lại email/mật khẩu.');
    }
  };

  const handleSocialRedirect = (provider: 'google' | 'outlook') => {
    // Redirect browser to the backend OAuth initialization URL
    const baseUrl = api.defaults.baseURL || '/api';
    window.location.href = `${baseUrl}/auth/${provider}/redirect`;
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setRegisterSuccess(false);
    setErrorMsg('');
    setName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    navigate(isLogin ? '/register' : '/login', { replace: true });
  };

  // Show success message after registration
  if (registerSuccess) {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #10b981, #34d399)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px', boxShadow: '0 8px 24px rgba(16,185,129,0.3)'
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, margin: '0 auto 12px', color: 'var(--text-main)' }}>
            Đăng ký thành công!
          </h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '24px', fontSize: '14px' }}>
            Tài khoản của bạn đã được tạo với vai trò <strong>Staff</strong>.<br />
            Vui lòng chờ <strong>Admin phê duyệt</strong> trước khi đăng nhập.
          </p>
          <div style={{
            background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px',
            padding: '14px 18px', marginBottom: '24px', textAlign: 'left', fontSize: '13px'
          }}>
            <div style={{ fontWeight: 600, color: '#b45309', marginBottom: '6px' }}>⏳ Trạng thái: Chờ phê duyệt</div>
            <div style={{ color: '#92400e' }}>
              Admin sẽ xem xét và phê duyệt tài khoản của bạn. Bạn sẽ nhận thông báo khi tài khoản được kích hoạt.
            </div>
          </div>
          <button
            onClick={() => {
              setRegisterSuccess(false);
              setName('');
              setEmail('');
              setPassword('');
              setConfirmPassword('');
              navigate('/login', { replace: true });
            }}
            className="auth-btn"
          >
            Quay lại Đăng nhập
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ transition: 'all 0.4s ease' }}>
        <div className="auth-header">
          <h1 className="auth-title">{isLogin ? 'Welcome Back' : 'Create Account'}</h1>
          <p className="auth-subtitle">
            {isLogin ? 'Log in to your Learning Hub account' : 'Join Learning Hub today'}
          </p>
        </div>

        {/* Error message */}
        {errorMsg && (
          <div style={{
            background: errorMsg.includes('phê duyệt') ? '#fffbeb' : errorMsg.includes('vô hiệu') ? '#fef2f2' : '#fef2f2',
            border: `1px solid ${errorMsg.includes('phê duyệt') ? '#fde68a' : '#fca5a5'}`,
            borderRadius: '10px', padding: '12px 16px', marginBottom: '16px',
            fontSize: '13px', lineHeight: 1.5,
            color: errorMsg.includes('phê duyệt') ? '#92400e' : '#991b1b',
            display: 'flex', alignItems: 'flex-start', gap: '10px'
          }}>
            <span style={{ fontSize: '16px', marginTop: '1px' }}>
              {errorMsg.includes('phê duyệt') ? '⏳' : errorMsg.includes('vô hiệu') ? '🚫' : '⚠️'}
            </span>
            <span>{errorMsg}</span>
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>

          {/* Dynamic field for Registration only */}
          {!isLogin && (
            <div className="input-group">
              <label className="input-label">Full Name</label>
              <input
                type="text"
                className="input-field"
                placeholder="Your name"
                value={name}
                onChange={(e) => { setName(e.target.value); setErrorMsg(''); }}
                required={!isLogin}
              />
            </div>
          )}

          <div className="input-group">
            <label className="input-label">Email Address / Username</label>
            <input
              type="text"
              className="input-field"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErrorMsg(''); }}
              required
            />
          </div>

          <div className="input-group">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <label className="input-label">Password</label>
              {isLogin && (
                <a href="#" className="auth-link" style={{ fontSize: '13px', fontWeight: '500' }}>Forgot Password?</a>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? "text" : "password"}
                className="input-field"
                placeholder="**************"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setErrorMsg(''); }}
                required
                style={{ paddingRight: '40px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary, #64748b)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 0
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Confirm Password field for Registration only */}
          {!isLogin && (
            <div className="input-group">
              <label className="input-label">Confirm Password</label>
              <input
                type="password"
                className="input-field"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setErrorMsg(''); }}
                required={!isLogin}
              />
            </div>
          )}


          <button type="submit" className="auth-btn" style={{ marginTop: '16px' }}>
            {isLogin ? 'Log In' : 'Sign Up'}
          </button>
        </form>

        {isLogin && (
          <>
            <div className="auth-divider">or log in with</div>
            <div className="social-login">
              <button className="social-btn" type="button" onClick={() => handleSocialRedirect('google')}>
                <GoogleIcon />
                Google
              </button>
              <button className="social-btn" type="button" onClick={() => handleSocialRedirect('outlook')}>
                <OutlookIcon />
                Outlook
              </button>
            </div>
          </>
        )}

        <div className="auth-footer">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button
            onClick={toggleMode}
            className="auth-link"
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 'inherit' }}
          >
            {isLogin ? 'Sign up' : 'Log in'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Auth;
