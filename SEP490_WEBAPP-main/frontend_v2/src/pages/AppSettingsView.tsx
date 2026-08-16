import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Settings, Sun, Moon, Bell, Monitor, Save, RotateCcw, Shield, Check, Volume2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const playAudioChime = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch { /* ignore */ }
};

export default function AppSettingsView() {
  const navigate = useNavigate();

  // Load preferences from localStorage or default
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('app_theme') as 'light' | 'dark') || 'light';
  });

  const [landingPage, setLandingPage] = useState<string>(() => {
    return localStorage.getItem('app_landing_page') || 'Dashboard';
  });

  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(() => {
    return Number(localStorage.getItem('app_auto_refresh') || 10);
  });

  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() => {
    return localStorage.getItem('app_notifications') !== 'false';
  });

  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    return localStorage.getItem('app_sound') === 'true';
  });

  const [compactMode, setCompactMode] = useState<boolean>(() => {
    return localStorage.getItem('app_compact_mode') === 'true';
  });

  const [saving, setSaving] = useState(false);

  // Live apply theme class to body whenever theme changes
  useEffect(() => {
    document.body.classList.toggle('dark-mode', theme === 'dark');
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Live apply compact mode to body
  useEffect(() => {
    document.body.classList.toggle('compact-mode', compactMode);
  }, [compactMode]);

  const handleSaveSettings = () => {
    setSaving(true);
    try {
      localStorage.setItem('app_theme', theme);
      localStorage.setItem('app_landing_page', landingPage);
      localStorage.setItem('app_auto_refresh', String(autoRefreshInterval));
      localStorage.setItem('app_notifications', String(notificationsEnabled));
      localStorage.setItem('app_sound', String(soundEnabled));
      localStorage.setItem('app_compact_mode', String(compactMode));

      document.body.classList.toggle('dark-mode', theme === 'dark');
      document.documentElement.setAttribute('data-theme', theme);
      document.body.classList.toggle('compact-mode', compactMode);

      if (soundEnabled) {
        playAudioChime();
      }

      toast.success('Đã lưu và áp dụng tất cả cài đặt hệ thống thành công!');
    } catch {
      toast.error('Lưu cài đặt thất bại.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (window.confirm('Bạn có chắc chắn muốn đặt lại tất cả cài đặt về mặc định?')) {
      setTheme('light');
      setLandingPage('Dashboard');
      setAutoRefreshInterval(10);
      setNotificationsEnabled(true);
      setSoundEnabled(false);
      setCompactMode(false);

      localStorage.removeItem('app_theme');
      localStorage.removeItem('app_landing_page');
      localStorage.removeItem('app_auto_refresh');
      localStorage.removeItem('app_notifications');
      localStorage.removeItem('app_sound');
      localStorage.removeItem('app_compact_mode');

      document.body.classList.remove('dark-mode');
      document.body.classList.remove('compact-mode');
      document.documentElement.setAttribute('data-theme', 'light');

      toast.success('Đã khôi phục cài đặt mặc định.');
    }
  };

  const handleGoToApiKeys = () => {
    window.dispatchEvent(new CustomEvent('lh-navigate-tab', { detail: 'API Keys' }));
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '8px 0 32px 0' }}>
      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        borderRadius: '16px',
        padding: '28px 32px',
        color: '#ffffff',
        boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.4)',
        marginBottom: '28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '14px',
            background: 'rgba(99, 102, 241, 0.2)',
            border: '1px solid rgba(99, 102, 241, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Settings size={30} color="#818cf8" />
          </div>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
              Cài đặt Hệ thống & Giao diện
            </h1>
            <p style={{ margin: '4px 0 0 0', opacity: 0.8, fontSize: '13.5px' }}>
              Tùy chỉnh cấu hình làm việc, thông báo và tần suất cập nhật hệ thống
            </p>
          </div>
        </div>

        <button
          onClick={handleGoToApiKeys}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
            color: '#ffffff',
            border: 'none',
            fontWeight: 700,
            fontSize: '13px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
          }}
        >
          <Shield size={16} />
          Kết nối AI API Keys
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Section 1: Display & Theme */}
        <section style={{
          background: 'var(--surface)',
          borderRadius: '16px',
          border: '1px solid var(--border)',
          padding: '24px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.04)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '14px' }}>
            <Monitor size={20} color="#6366f1" />
            <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
              Giao diện & Hiển thị
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                Chế độ hiển thị
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '12px',
                    borderRadius: '10px',
                    border: theme === 'light' ? '2px solid #6366f1' : '1px solid var(--border)',
                    background: theme === 'light' ? '#eef2ff' : 'var(--surface)',
                    color: theme === 'light' ? '#4338ca' : 'var(--text-main)',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  <Sun size={18} /> Sáng (Light)
                  {theme === 'light' && <Check size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '12px',
                    borderRadius: '10px',
                    border: theme === 'dark' ? '2px solid #6366f1' : '1px solid var(--border)',
                    background: theme === 'dark' ? '#1e293b' : 'var(--surface)',
                    color: theme === 'dark' ? '#818cf8' : 'var(--text-main)',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  <Moon size={18} /> Tối (Dark)
                  {theme === 'dark' && <Check size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                Trang mặc định khi mở ứng dụng
              </label>
              <select
                value={landingPage}
                onChange={(e) => setLandingPage(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  fontSize: '14px',
                  color: 'var(--text-main)',
                  background: 'var(--surface)'
                }}
              >
                <option value="Dashboard">Dashboard tổng quan</option>
                <option value="Chat">Trợ lý AI Chat</option>
                <option value="My Tasks">Task của tôi</option>
                <option value="Data Prep">Data Prep (Tiền xử lý)</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px' }}>
              <div>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', display: 'block' }}>Giao diện thu gọn</span>
                <small style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Tối ưu diện tích hiển thị danh sách task</small>
              </div>
              <input
                type="checkbox"
                checked={compactMode}
                onChange={(e) => setCompactMode(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#4f46e5' }}
              />
            </div>
          </div>
        </section>

        {/* Section 2: Notifications & Performance */}
        <section style={{
          background: 'var(--surface)',
          borderRadius: '16px',
          border: '1px solid var(--border)',
          padding: '24px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.04)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '14px' }}>
            <Bell size={20} color="#059669" />
            <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
              Thông báo & Hiệu năng
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                Tần suất làm mới dữ liệu tự động (Auto-refresh)
              </label>
              <select
                value={autoRefreshInterval}
                onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  fontSize: '14px',
                  color: 'var(--text-main)',
                  background: 'var(--surface)'
                }}
              >
                <option value={5}>Mỗi 5 giây (Nhanh)</option>
                <option value={10}>Mỗi 10 giây (Mặc định)</option>
                <option value={30}>Mỗi 30 giây (Tiết kiệm băng thông)</option>
                <option value={0}>Tắt tự động làm mới</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', display: 'block' }}>Thông báo Toast trên màn hình</span>
                <small style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Hiển thị thông báo khi có task mới hoặc kết quả train</small>
              </div>
              <input
                type="checkbox"
                checked={notificationsEnabled}
                onChange={(e) => setNotificationsEnabled(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#059669' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>Âm thanh thông báo</span>
                  {soundEnabled && <Volume2 size={14} color="#059669" />}
                </div>
                <small style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Phát âm thanh nhẹ khi hoàn thành tác vụ / lưu cài đặt</small>
              </div>
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => {
                  const nextVal = e.target.checked;
                  setSoundEnabled(nextVal);
                  if (nextVal) playAudioChime();
                }}
                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#059669' }}
              />
            </div>
          </div>
        </section>
      </div>

      {/* Action Footer */}
      <div style={{
        marginTop: '28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--surface)',
        padding: '16px 24px',
        borderRadius: '14px',
        border: '1px solid var(--border)',
        boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
      }}>
        <button
          type="button"
          onClick={handleReset}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text-muted)',
            fontSize: '13.5px',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          <RotateCcw size={16} /> Đặt lại mặc định
        </button>

        <button
          type="button"
          onClick={handleSaveSettings}
          disabled={saving}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 24px',
            borderRadius: '8px',
            background: '#4f46e5',
            color: '#ffffff',
            border: 'none',
            fontWeight: 700,
            fontSize: '14px',
            cursor: saving ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)'
          }}
        >
          <Save size={18} />
          {saving ? 'Đang lưu...' : 'Lưu cài đặt'}
        </button>
      </div>
    </div>
  );
}
