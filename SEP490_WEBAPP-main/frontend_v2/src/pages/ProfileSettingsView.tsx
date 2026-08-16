import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import toast from 'react-hot-toast';
import { User, Shield, Key, Save, Lock, Mail, CheckCircle2, UserCheck, Sparkles } from 'lucide-react';

export default function ProfileSettingsView() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  React.useEffect(() => {
    if (user?.name) {
      setName(user.name);
    }
  }, [user?.name]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('Họ và tên không được để trống');
      return;
    }
    setSavingProfile(true);
    try {
      const res = await apiService.updateProfile({ name: trimmedName });
      const updatedName = res.user?.name || trimmedName;
      updateUser({ name: updatedName });
      toast.success('Cập nhật thông tin họ và tên thành công!');
    } catch (err: any) {
      console.error('Update profile error:', err);
      const errMsg = err?.response?.data?.error || err.message || 'Cập nhật thất bại. Vui lòng thử lại.';
      toast.error(errMsg);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      toast.error('Vui lòng nhập mật khẩu hiện tại');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Mật khẩu mới phải có ít nhất 6 ký tự');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Xác nhận mật khẩu mới không khớp');
      return;
    }
    setSavingPassword(true);
    try {
      const res = await apiService.changePassword({ currentPassword, newPassword });
      toast.success(res.message || 'Đổi mật khẩu thành công!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      const errorMsg = err?.response?.data?.error || 'Mật khẩu hiện tại không chính xác.';
      toast.error(errorMsg);
    } finally {
      setSavingPassword(false);
    }
  };

  const roleColors: Record<string, { bg: string; color: string; border: string }> = {
    admin: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
    supervisor: { bg: '#e0e7ff', color: '#3730a3', border: '#a5b4fc' },
    checker: { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
    staff: { bg: '#dcfce7', color: '#166534', border: '#86efac' },
  };

  const roleStyle = roleColors[user?.role || 'staff'] || roleColors.staff;

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '8px 0 32px 0' }}>
      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
        borderRadius: '16px',
        padding: '28px 32px',
        color: '#ffffff',
        boxShadow: '0 10px 25px -5px rgba(79, 70, 229, 0.3)',
        marginBottom: '28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.2)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid rgba(255, 255, 255, 0.4)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}>
            <User size={32} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
                {user?.name || 'Tài khoản'}
              </h1>
              <span style={{
                fontSize: '12px',
                fontWeight: 700,
                textTransform: 'uppercase',
                padding: '4px 10px',
                borderRadius: '99px',
                background: 'rgba(255,255,255,0.25)',
                color: '#ffffff',
                border: '1px solid rgba(255,255,255,0.3)',
                letterSpacing: '0.05em'
              }}>
                {user?.role || 'user'}
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', opacity: 0.9, fontSize: '14px' }}>
              {user?.email}
            </p>
          </div>
        </div>

        <div style={{
          background: 'rgba(255, 255, 255, 0.15)',
          padding: '10px 18px',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <Sparkles size={16} />
          <span>Hệ thống quản trị SEP490 Learning Hub</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Section 1: Profile Information */}
        <section style={{
          background: 'var(--surface)',
          borderRadius: '16px',
          border: '1px solid var(--border)',
          padding: '24px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.04)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '14px' }}>
            <UserCheck size={20} color="#4f46e5" />
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
              Thông tin cá nhân
            </h2>
          </div>

          <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                Họ và tên
              </label>
              <div style={{ position: 'relative' }}>
                <User size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nhập họ và tên..."
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 38px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    fontSize: '14px',
                    color: 'var(--text-main)',
                    background: 'var(--surface)',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                Địa chỉ Email
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="email"
                  value={user?.email || ''}
                  disabled
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 38px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-color)',
                    color: 'var(--text-muted)',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    cursor: 'not-allowed'
                  }}
                />
              </div>
              <small style={{ display: 'block', color: 'var(--text-muted)', fontSize: '11px', marginTop: '4px' }}>
                Email được cố định theo tài khoản đăng ký ban đầu.
              </small>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                Vai trò hệ thống
              </label>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '8px',
                background: roleStyle.bg,
                color: roleStyle.color,
                border: `1px solid ${roleStyle.border}`,
                fontWeight: 700,
                fontSize: '13px',
                textTransform: 'uppercase'
              }}>
                <Shield size={16} />
                {user?.role || 'STAFF'}
              </div>
            </div>

            <button
              type="submit"
              disabled={savingProfile}
              style={{
                marginTop: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '10px 20px',
                borderRadius: '8px',
                background: '#4f46e5',
                color: '#ffffff',
                border: 'none',
                fontWeight: 600,
                fontSize: '14px',
                cursor: savingProfile ? 'not-allowed' : 'pointer',
                opacity: savingProfile ? 0.7 : 1,
                boxShadow: '0 2px 4px rgba(79, 70, 229, 0.2)',
                transition: 'all 0.2s'
              }}
            >
              <Save size={16} />
              {savingProfile ? 'Đang lưu...' : 'Lưu thông tin'}
            </button>
          </form>
        </section>

        {/* Section 2: Change Password */}
        <section style={{
          background: 'var(--surface)',
          borderRadius: '16px',
          border: '1px solid var(--border)',
          padding: '24px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.04)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '14px' }}>
            <Key size={20} color="#059669" />
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
              Bảo mật & Mật khẩu
            </h2>
          </div>

          <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                Mật khẩu hiện tại
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Nhập mật khẩu hiện tại..."
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 38px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    fontSize: '14px',
                    color: 'var(--text-main)',
                    background: 'var(--surface)',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                Mật khẩu mới
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Ít nhất 6 ký tự..."
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 38px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    fontSize: '14px',
                    color: 'var(--text-main)',
                    background: 'var(--surface)',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                Xác nhận mật khẩu mới
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu mới..."
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 38px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    fontSize: '14px',
                    color: 'var(--text-main)',
                    background: 'var(--surface)',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingPassword}
              style={{
                marginTop: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '10px 20px',
                borderRadius: '8px',
                background: '#059669',
                color: '#ffffff',
                border: 'none',
                fontWeight: 600,
                fontSize: '14px',
                cursor: savingPassword ? 'not-allowed' : 'pointer',
                opacity: savingPassword ? 0.7 : 1,
                boxShadow: '0 2px 4px rgba(5, 150, 105, 0.2)',
                transition: 'all 0.2s'
              }}
            >
              <CheckCircle2 size={16} />
              {savingPassword ? 'Đang đổi...' : 'Đổi mật khẩu'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
