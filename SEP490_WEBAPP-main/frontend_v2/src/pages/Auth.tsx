import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Eye, EyeOff, Mail, KeyRound, Lock, ArrowLeft, CheckCircle2 } from 'lucide-react';
import '../styles/auth.css';

// ── SVG Icons ────────────────────────────────────────────────────────────────
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

// ── Types ────────────────────────────────────────────────────────────────────
type ForgotStep = 'idle' | 'enter-email' | 'enter-otp' | 'enter-new-password' | 'success';

const OTP_COUNTDOWN_SEC = 600; // 10 minutes

// ── Component ────────────────────────────────────────────────────────────────
function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, login } = useAuth();
  const [isLogin, setIsLogin] = useState(true);

  // Redirect if already logged in
  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  // ── Normal login/register state ──────────────────────────────────────────
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // ── Forgot-password state ────────────────────────────────────────────────
  const [forgotStep, setForgotStep] = useState<ForgotStep>('idle');
  const [forgotEmail, setForgotEmail] = useState('');
  const [otpValue, setOtpValue] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotInfo, setForgotInfo] = useState('');
  const [countdown, setCountdown] = useState(OTP_COUNTDOWN_SEC);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // OTP refs for digit-by-digit input
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);

  // ── Countdown timer ──────────────────────────────────────────────────────
  const startCountdown = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setCountdown(OTP_COUNTDOWN_SEC);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, []);

  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // ── OAuth redirect handling ──────────────────────────────────────────────
  useEffect(() => {
    if (location.pathname === '/register') setIsLogin(false);
    else setIsLogin(true);
    setRegisterSuccess(false);
    setErrorMsg('');
    setName(''); setEmail(''); setPassword(''); setConfirmPassword('');

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
      } catch {
        setErrorMsg('Lỗi đồng bộ thông tin đăng nhập.');
      }
    }
  }, [location]);

  // ── Login / Register submit ──────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!isLogin) {
      if (password !== confirmPassword) { setErrorMsg('Mật khẩu xác nhận không trùng khớp.'); return; }
      try {
        await api.post('/auth/register', { name, email, password, role: 'staff' });
        setRegisterSuccess(true);
      } catch (error: any) {
        setErrorMsg(error.response?.data?.error || 'Đăng ký thất bại. Vui lòng thử lại.');
      }
      return;
    }

    try {
      const res = await api.post('/auth/login', { email, password });
      login(res.data.user, res.data.token);
      navigate('/dashboard');
    } catch (error: any) {
      setErrorMsg(error.response?.data?.error || 'Đăng nhập thất bại. Vui lòng kiểm tra lại email/mật khẩu.');
    }
  };

  const handleSocialRedirect = (provider: 'google' | 'outlook') => {
    const baseUrl = api.defaults.baseURL || '/api';
    window.location.href = `${baseUrl}/auth/${provider}/redirect`;
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setRegisterSuccess(false); setErrorMsg('');
    setName(''); setEmail(''); setPassword(''); setConfirmPassword('');
    navigate(isLogin ? '/register' : '/login', { replace: true });
  };

  // ── Forgot password handlers ─────────────────────────────────────────────
  const resetForgotState = () => {
    setForgotStep('idle');
    setForgotEmail(''); setOtpValue(''); setOtpDigits(['', '', '', '', '', '']);
    setNewPassword(''); setConfirmNewPassword('');
    setForgotError(''); setForgotInfo('');
    if (countdownRef.current) clearInterval(countdownRef.current);
  };

  const handleForgotEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(''); setForgotLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: forgotEmail });
      setForgotInfo('Mã OTP đã được gửi đến email của bạn.');
      setForgotStep('enter-otp');
      startCountdown();
    } catch (error: any) {
      setForgotError(error.response?.data?.error || 'Có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (countdown > 0) return;
    setForgotError(''); setForgotLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: forgotEmail });
      setForgotInfo('Mã OTP mới đã được gửi lại.');
      setOtpDigits(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
      startCountdown();
    } catch (error: any) {
      setForgotError(error.response?.data?.error || 'Không thể gửi lại OTP. Thử lại sau.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleOtpDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...otpDigits];
    next[index] = digit;
    setOtpDigits(next);
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
    // auto-advance when all filled
    if (next.every(d => d !== '')) setOtpValue(next.join(''));
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      const digits = pasted.split('');
      setOtpDigits(digits);
      setOtpValue(pasted);
      otpRefs.current[5]?.focus();
      e.preventDefault();
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otpDigits.join('');
    if (code.length !== 6) { setForgotError('Vui lòng nhập đủ 6 chữ số OTP.'); return; }
    setForgotError(''); setForgotLoading(true);
    try {
      // Validate OTP silently (just advance if no error)
      await api.post('/auth/reset-password', {
        email: forgotEmail,
        otp: code,
        newPassword: '__probe__',
      });
    } catch (error: any) {
      const msg: string = error.response?.data?.error || '';
      // Backend returns specific error for wrong OTP vs wrong password
      if (msg.includes('6 ký tự') || msg.includes('mật khẩu mới')) {
        // probe passed OTP check, only password was invalid → advance step
        setForgotStep('enter-new-password');
        setForgotError('');
        setForgotLoading(false);
        return;
      }
      setForgotError(msg || 'Mã OTP không hợp lệ. Vui lòng thử lại.');
      setForgotLoading(false);
      return;
    }
    setForgotLoading(false);
    // If no error at all (shouldn't happen with probe), advance anyway
    setForgotStep('enter-new-password');
  };

  const handleNewPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) { setForgotError('Mật khẩu phải có ít nhất 6 ký tự.'); return; }
    if (newPassword !== confirmNewPassword) { setForgotError('Mật khẩu xác nhận không khớp.'); return; }
    setForgotError(''); setForgotLoading(true);
    try {
      await api.post('/auth/reset-password', {
        email: forgotEmail,
        otp: otpDigits.join(''),
        newPassword,
      });
      setForgotStep('success');
    } catch (error: any) {
      setForgotError(error.response?.data?.error || 'Có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setForgotLoading(false);
    }
  };

  // ── Register success screen ──────────────────────────────────────────────
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
          <h2 style={{ fontSize: '22px', fontWeight: 700, margin: '0 auto 12px', color: 'var(--text-main)' }}>Đăng ký thành công!</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '24px', fontSize: '14px' }}>
            Tài khoản của bạn đã được tạo với vai trò <strong>Staff</strong>.<br />
            Vui lòng chờ <strong>Admin phê duyệt</strong> trước khi đăng nhập.
          </p>
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '14px 18px', marginBottom: '24px', textAlign: 'left', fontSize: '13px' }}>
            <div style={{ fontWeight: 600, color: '#b45309', marginBottom: '6px' }}>⏳ Trạng thái: Chờ phê duyệt</div>
            <div style={{ color: '#92400e' }}>Admin sẽ xem xét và phê duyệt tài khoản của bạn.</div>
          </div>
          <button onClick={() => { setRegisterSuccess(false); setName(''); setEmail(''); setPassword(''); setConfirmPassword(''); navigate('/login', { replace: true }); }} className="auth-btn">
            Quay lại Đăng nhập
          </button>
        </div>
      </div>
    );
  }

  // ── Forgot password: Enter Email ─────────────────────────────────────────
  if (forgotStep === 'enter-email') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <button onClick={resetForgotState} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 600, marginBottom: '24px', padding: 0 }}>
            <ArrowLeft size={16} /> Quay lại Đăng nhập
          </button>
          <div className="auth-header">
            <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 8px 24px rgba(79,70,229,0.3)' }}>
              <Mail size={26} color="white" />
            </div>
            <h1 className="auth-title">Quên Mật Khẩu</h1>
            <p className="auth-subtitle">Nhập email để nhận mã OTP xác thực</p>
          </div>

          {forgotError && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#991b1b', display: 'flex', gap: '8px', alignItems: 'flex-start' }}><span>⚠️</span><span>{forgotError}</span></div>}

          <form className="auth-form" onSubmit={handleForgotEmailSubmit}>
            <div className="input-group">
              <label className="input-label">Email đã đăng ký</label>
              <input
                id="forgot-email"
                type="email"
                className="input-field"
                placeholder="your@email.com"
                value={forgotEmail}
                onChange={(e) => { setForgotEmail(e.target.value); setForgotError(''); }}
                required
                autoFocus
              />
            </div>
            <button type="submit" className="auth-btn" disabled={forgotLoading} style={{ marginTop: '8px' }}>
              {forgotLoading ? 'Đang gửi...' : 'Gửi mã OTP'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Forgot password: Enter OTP ───────────────────────────────────────────
  if (forgotStep === 'enter-otp') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <button onClick={() => { setForgotStep('enter-email'); setForgotError(''); setOtpDigits(['', '', '', '', '', '']); if (countdownRef.current) clearInterval(countdownRef.current); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 600, marginBottom: '24px', padding: 0 }}>
            <ArrowLeft size={16} /> Quay lại
          </button>
          <div className="auth-header">
            <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 8px 24px rgba(79,70,229,0.3)' }}>
              <KeyRound size={26} color="white" />
            </div>
            <h1 className="auth-title">Nhập mã OTP</h1>
            <p className="auth-subtitle">Mã đã được gửi đến <strong style={{ color: 'var(--text-main)' }}>{forgotEmail}</strong></p>
          </div>

          {forgotInfo && <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#166534', display: 'flex', gap: '8px', alignItems: 'center' }}><span>✅</span><span>{forgotInfo}</span></div>}
          {forgotError && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#991b1b', display: 'flex', gap: '8px', alignItems: 'flex-start' }}><span>⚠️</span><span>{forgotError}</span></div>}

          <form className="auth-form" onSubmit={handleOtpSubmit}>
            {/* OTP digit boxes */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', margin: '8px 0 4px' }} onPaste={handleOtpPaste}>
              {otpDigits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { otpRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpDigitChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  style={{
                    width: '52px', height: '60px', borderRadius: '12px', border: `2px solid ${digit ? 'var(--primary)' : 'var(--border)'}`,
                    background: digit ? 'rgba(79,70,229,0.05)' : '#fff', fontSize: '24px', fontWeight: 700,
                    textAlign: 'center', color: 'var(--text-main)', outline: 'none', transition: 'all 0.2s',
                    boxShadow: digit ? '0 0 0 3px rgba(79,70,229,0.12)' : 'none'
                  }}
                  autoFocus={i === 0}
                />
              ))}
            </div>

            {/* Countdown */}
            <div style={{ textAlign: 'center', fontSize: '13px', color: countdown > 0 ? 'var(--text-muted)' : '#ef4444', marginTop: '4px' }}>
              {countdown > 0
                ? <span>Mã hết hạn sau <strong style={{ color: countdown < 60 ? '#ef4444' : 'var(--primary)' }}>{formatCountdown(countdown)}</strong></span>
                : <span>Mã đã hết hạn.</span>
              }
            </div>

            <button type="submit" className="auth-btn" disabled={forgotLoading || otpDigits.join('').length !== 6} style={{ marginTop: '8px' }}>
              {forgotLoading ? 'Đang xác thực...' : 'Xác nhận OTP'}
            </button>

            {/* Resend */}
            <div style={{ textAlign: 'center', marginTop: '8px' }}>
              <button type="button" onClick={handleResendOtp} disabled={countdown > 0 || forgotLoading}
                style={{ background: 'none', border: 'none', cursor: countdown > 0 ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 600, color: countdown > 0 ? 'var(--text-muted)' : 'var(--primary)', padding: 0, textDecoration: countdown > 0 ? 'none' : 'underline' }}>
                {forgotLoading ? 'Đang gửi...' : 'Gửi lại mã OTP'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ── Forgot password: New Password ────────────────────────────────────────
  if (forgotStep === 'enter-new-password') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <button onClick={() => { setForgotStep('enter-otp'); setForgotError(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 600, marginBottom: '24px', padding: 0 }}>
            <ArrowLeft size={16} /> Quay lại
          </button>
          <div className="auth-header">
            <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 8px 24px rgba(79,70,229,0.3)' }}>
              <Lock size={26} color="white" />
            </div>
            <h1 className="auth-title">Mật khẩu mới</h1>
            <p className="auth-subtitle">Đặt mật khẩu mới cho tài khoản của bạn</p>
          </div>

          {forgotError && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#991b1b', display: 'flex', gap: '8px', alignItems: 'flex-start' }}><span>⚠️</span><span>{forgotError}</span></div>}

          <form className="auth-form" onSubmit={handleNewPasswordSubmit}>
            <div className="input-group">
              <label className="input-label">Mật khẩu mới</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  className="input-field"
                  placeholder="Ít nhất 6 ký tự"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setForgotError(''); }}
                  required
                  style={{ paddingRight: '40px' }}
                  autoFocus
                />
                <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary, #64748b)', display: 'flex', alignItems: 'center', padding: 0 }}>
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div className="input-group">
              <label className="input-label">Xác nhận mật khẩu</label>
              <input
                id="confirm-new-password"
                type="password"
                className="input-field"
                placeholder="Nhập lại mật khẩu"
                value={confirmNewPassword}
                onChange={(e) => { setConfirmNewPassword(e.target.value); setForgotError(''); }}
                required
              />
            </div>
            {/* Password strength hints */}
            {newPassword.length > 0 && (
              <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '-8px' }}>
                <span style={{ color: newPassword.length >= 6 ? '#16a34a' : '#94a3b8' }}>
                  {newPassword.length >= 6 ? '✓' : '○'} Ít nhất 6 ký tự
                </span>
                {confirmNewPassword.length > 0 && (
                  <span style={{ color: newPassword === confirmNewPassword ? '#16a34a' : '#ef4444' }}>
                    {newPassword === confirmNewPassword ? '✓ Mật khẩu khớp' : '✗ Mật khẩu chưa khớp'}
                  </span>
                )}
              </div>
            )}
            <button type="submit" className="auth-btn" disabled={forgotLoading} style={{ marginTop: '8px' }}>
              {forgotLoading ? 'Đang cập nhật...' : 'Đặt lại mật khẩu'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Forgot password: Success ─────────────────────────────────────────────
  if (forgotStep === 'success') {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'linear-gradient(135deg, #10b981, #34d399)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', boxShadow: '0 8px 24px rgba(16,185,129,0.3)', animation: 'successPop 0.4s cubic-bezier(0.34,1.56,0.64,1)' }}>
            <CheckCircle2 size={36} color="white" />
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '12px' }}>Đặt lại thành công!</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.6, marginBottom: '28px' }}>
            Mật khẩu của bạn đã được cập nhật.<br />Vui lòng đăng nhập bằng mật khẩu mới.
          </p>
          <button
            className="auth-btn"
            onClick={() => { resetForgotState(); navigate('/login', { replace: true }); }}
          >
            Đăng nhập ngay
          </button>
        </div>
      </div>
    );
  }

  // ── Main Login / Register UI ─────────────────────────────────────────────
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
            background: errorMsg.includes('phê duyệt') ? '#fffbeb' : '#fef2f2',
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
          {!isLogin && (
            <div className="input-group">
              <label className="input-label">Full Name</label>
              <input type="text" className="input-field" placeholder="Your name" value={name} onChange={(e) => { setName(e.target.value); setErrorMsg(''); }} required={!isLogin} />
            </div>
          )}

          <div className="input-group">
            <label className="input-label">Email Address / Username</label>
            <input type="text" className="input-field" placeholder="your@email.com" value={email} onChange={(e) => { setEmail(e.target.value); setErrorMsg(''); }} required />
          </div>

          <div className="input-group">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <label className="input-label">Password</label>
              {isLogin && (
                <button
                  type="button"
                  onClick={() => { setForgotEmail(email); setForgotStep('enter-email'); setForgotError(''); }}
                  className="auth-link"
                  style={{ fontSize: '13px', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Forgot Password?
                </button>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                className="input-field"
                placeholder="**************"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setErrorMsg(''); }}
                required
                style={{ paddingRight: '40px' }}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary, #64748b)', display: 'flex', alignItems: 'center', padding: 0 }}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {!isLogin && (
            <div className="input-group">
              <label className="input-label">Confirm Password</label>
              <input type="password" className="input-field" placeholder="••••••••" value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setErrorMsg(''); }} required={!isLogin} />
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
              <button className="social-btn" type="button" onClick={() => handleSocialRedirect('google')}><GoogleIcon /> Google</button>
              <button className="social-btn" type="button" onClick={() => handleSocialRedirect('outlook')}><OutlookIcon /> Outlook</button>
            </div>
          </>
        )}

        <div className="auth-footer">
          {isLogin ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={toggleMode} className="auth-link" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 'inherit' }}>
            {isLogin ? 'Sign up' : 'Log in'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Auth;
