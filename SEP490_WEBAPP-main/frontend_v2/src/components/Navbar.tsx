import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Activity, User, Settings, CreditCard, Shield, LogOut, Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { stage4Api } from '../services/stage4Api';

function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  // GPU Connection Widget states
  const [inputUrl, setInputUrl] = useState('');
  const [connectedUrl, setConnectedUrl] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [urlHistory, setUrlHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [gpuStats, setGpuStats] = useState<any>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setNotificationOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    const loadNotifications = async () => {
      const currentVersionId = localStorage.getItem('current_version_id') || '';
      let versionIds = currentVersionId ? [currentVersionId] : [];
      try {
        const versionRes = await apiService.listDatasetVersions();
        const activeVersionIds = (versionRes.data || [])
          .filter((version: any) => Number(version.prepareResumeStep || 1) > 1 || Number(version.labelingTasks || 0) > 0)
          .map((version: any) => String(version.id))
          .slice(0, 8);
        versionIds = Array.from(new Set([...versionIds, ...activeVersionIds]));
      } catch {
        // Keep notification polling alive even if the version list fails.
      }

      try {
        const [globalRes, ...responses] = await Promise.all([
          stage4Api.listMyNotifications().catch(() => ({ notifications: [] })),
          ...versionIds.map((versionId) =>
            stage4Api.listNotifications(versionId).catch(() => ({ notifications: [] }))
          ),
        ]);
        const merged = [
          ...(globalRes.notifications || []),
          ...responses.flatMap((res) => res.notifications || []),
        ];
        const unique = Array.from(new Map(merged.map((note: any) => [String(note._id || `${note.message}-${note.createdAt}`), note])).values());
        unique.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        setNotifications(unique);
      } catch (error) {
        console.error('Failed to load notifications', error);
      }
    };

    loadNotifications();
    const intervalId = window.setInterval(loadNotifications, 10000);
    return () => window.clearInterval(intervalId);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    try {
      const h = JSON.parse(localStorage.getItem('gpu_url_history') || '[]');
      setUrlHistory(Array.isArray(h) ? h : []);
    } catch { /* ignore */ }

    const wasDisconnected = localStorage.getItem('gpu_disconnected') === 'true';
    if (wasDisconnected) return;

    const fetchConfig = async () => {
      try {
        const data = await apiService.getGpuConfig();
        if (data.gpuUrl && data.configured) {
          setInputUrl(data.gpuUrl);
          setConnectedUrl(data.gpuUrl);
          const { isOk, data: statsData } = await apiService.checkGpuStatus();
          setConnectionStatus(isOk ? 'connected' : 'error');
          if (isOk) setGpuStats(statsData);
        }
      } catch (err) {
        console.error('Failed to load GPU config', err);
      }
    };
    fetchConfig();
  }, [user]);

  // Polling GPU status every 5 seconds if connected
  useEffect(() => {
    let interval: any;
    if (connectionStatus === 'connected') {
      interval = setInterval(async () => {
        const { isOk, data: statsData } = await apiService.checkGpuStatus();
        if (isOk) {
          setGpuStats(statsData);
        } else {
          setConnectionStatus('error');
          setGpuStats(null);
        }
      }, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [connectionStatus]);

  const handleConnect = async () => {
    const url = inputUrl.trim();
    if (!url) return;
    setConnectionStatus('connecting');
    setShowHistory(false);
    try {
      await apiService.updateGpuConfig(url);
      const { isOk, data: statsData } = await apiService.checkGpuStatus();
      if (isOk) {
        setConnectedUrl(url);
        setConnectionStatus('connected');
        setGpuStats(statsData);
        localStorage.removeItem('gpu_disconnected');
        setUrlHistory(prev => {
          const next = [url, ...prev.filter(u => u !== url)].slice(0, 5);
          localStorage.setItem('gpu_url_history', JSON.stringify(next));
          return next;
        });
      } else {
        setConnectionStatus('error');
      }
    } catch {
      setConnectionStatus('error');
    }
  };

  const handleDisconnect = async () => {
    setConnectedUrl('');
    setInputUrl('');
    setConnectionStatus('idle');
    setGpuStats(null);
    localStorage.setItem('gpu_disconnected', 'true');
    try {
      await apiService.updateGpuConfig('');
    } catch { /* ignore */ }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  const unreadNotificationCount = notifications.filter((note: any) => !note.readAt).length;

  const toggleNotifications = async () => {
    const nextOpen = !notificationOpen;
    setNotificationOpen(nextOpen);
    if (!nextOpen || unreadNotificationCount === 0) return;

    const versionIds = Array.from(new Set(
      notifications
        .filter((note: any) => !note.readAt && note.datasetVersionId)
        .map((note: any) => String(note.datasetVersionId))
    ));
    if (!versionIds.length) return;
    setNotifications(prev => prev.map((note: any) => ({ ...note, readAt: note.readAt || new Date().toISOString() })));
    await Promise.all(versionIds.map((versionId) => stage4Api.markNotificationsRead(versionId).catch(() => null)));
  };

  // Hide header on login and register pages
  if (['/login', '/register'].includes(location.pathname)) {
    return null;
  }

  return (
    <header className="header" style={{ position: 'sticky', top: 0, zIndex: 50, width: '100%' }}>
      {/* Left: Logo */}
      <div className="logo-container" onClick={() => navigate(user ? '/dashboard' : '/')} style={{ cursor: 'pointer' }}>
        <img src="/logo.png" alt="Logo" className="app-logo" />
        <div className="logo-text">
          <span className="logo-title">Learning Hub</span>
          <span className="logo-subtitle">AI-Powered Education</span>
        </div>
      </div>

      {user ? (
        <>
          {/* Middle: Resources (Only shown when logged in) */}
          <div style={{ display: 'flex', alignItems: 'center', flex: 1, justifyContent: 'center' }}>
            {gpuStats ? (
              <div className="resources-pill">
                <div className="resources-item">
                  <span className="status-dot"></span>
                  <Activity size={16} className="icon-blue" />
                  <span>Util: {Math.round(gpuStats.gpu_util || 0)}%</span>
                </div>
                <div className="divider"></div>
                <div className="resources-item">
                  <span className="vram-text">VRAM:</span>
                  <span className="vram-value">
                    {((gpuStats.vram_used_mb || 0) / 1024).toFixed(1)} / {((gpuStats.vram_total_mb || 1024) / 1024).toFixed(1)} GB
                  </span>
                  <div className="progress-bar-container">
                    <div className="progress-bar-fill" style={{ width: `${Math.min(100, ((gpuStats.vram_used_mb || 0) / Math.max(1, gpuStats.vram_total_mb || 1)) * 100)}%` }}></div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="resources-pill" style={{ opacity: 0.6 }}>
                <div className="resources-item">
                  <span className="status-dot" style={{ background: '#cbd5e1', boxShadow: 'none' }}></span>
                  <Activity size={16} className="icon-blue" style={{ filter: 'grayscale(100%)' }} />
                  <span>Offline</span>
                </div>
                <div className="divider"></div>
                <div className="resources-item">
                  <span className="vram-text">VRAM:</span>
                  <span className="vram-value">-- / -- GB</span>
                  <div className="progress-bar-container">
                    <div className="progress-bar-fill" style={{ width: '0%', background: '#cbd5e1' }}></div>
                  </div>
                </div>
              </div>
            )}

            {/* GPU Connection widget - Only for Admin / Supervisor */}
            {(user.role === 'admin' || user.role === 'supervisor') ? (
              <div className="gpu-widget-container" style={{ maxWidth: '350px', marginLeft: '16px', position: 'relative' }}>
                {connectionStatus === 'connected' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '8px', padding: '6px 12px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', color: '#047857', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }} title={connectedUrl}>
                      {connectedUrl}
                    </span>
                    <button onClick={handleDisconnect} style={{ fontSize: '12px', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 600 }} title="Ngắt kết nối GPU">
                      Ngắt
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      title={connectionStatus === 'connecting' ? 'Đang kết nối...' : connectionStatus === 'error' ? 'Kết nối thất bại' : 'Chưa kết nối GPU'}
                      style={{
                        width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                        background: connectionStatus === 'connecting' ? '#fbbf24' : connectionStatus === 'error' ? '#f87171' : '#cbd5e1'
                      }}
                    />
                    <div style={{ position: 'relative', flex: 1, minWidth: '180px' }}>
                      <input
                        type="text"
                        value={inputUrl}
                        onChange={(e) => { setInputUrl(e.target.value); if (connectionStatus === 'error') setConnectionStatus('idle'); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); }}
                        disabled={connectionStatus === 'connecting'}
                        style={{ width: '100%', boxSizing: 'border-box', background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '12px', padding: '8px 12px', borderRadius: '6px', fontFamily: 'monospace', paddingRight: '24px', color: '#334155' }}
                        placeholder="https://xyz.ngrok.app"
                      />
                      {urlHistory.length > 0 && connectionStatus !== 'connecting' && (
                        <button
                          onClick={() => setShowHistory(v => !v)}
                          style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', fontSize: '12px', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                        >▼</button>
                      )}
                    </div>
                    {showHistory && (
                      <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowHistory(false)} />
                        <div style={{ position: 'absolute', top: '100%', left: '16px', right: 0, marginTop: '4px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', zIndex: 50, overflow: 'hidden' }}>
                          <div style={{ padding: '8px 12px', fontSize: '10px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', borderBottom: '1px solid #f1f5f9' }}>Lịch sử kết nối</div>
                          {urlHistory.map((url, i) => (
                            <button
                              key={i}
                              onClick={() => { setInputUrl(url); setShowHistory(false); setConnectionStatus('idle'); }}
                              style={{ width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: '12px', color: '#475569', background: 'none', border: 'none', borderBottom: '1px solid #f8fafc', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}
                              title={url}
                            >
                              {url}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    <button
                      onClick={handleConnect}
                      disabled={!inputUrl.trim() || connectionStatus === 'connecting'}
                      style={{ flexShrink: 0, fontSize: '12px', fontWeight: 600, background: '#1e293b', color: '#fff', padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: !inputUrl.trim() || connectionStatus === 'connecting' ? 'not-allowed' : 'pointer', opacity: !inputUrl.trim() || connectionStatus === 'connecting' ? 0.5 : 1 }}
                    >
                      {connectionStatus === 'connecting' ? '…' : 'Kết nối'}
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Right: Notifications + User Profile (Logged in) */}
          <div className="header-actions">
            <div className="notification-wrapper" ref={notificationRef}>
              <button
                type="button"
                className={`notification-button ${notificationOpen ? 'active' : ''}`}
                onClick={toggleNotifications}
                title="Notifications"
              >
                <Bell size={20} />
                {unreadNotificationCount > 0 && (
                  <span className="notification-badge">{Math.min(unreadNotificationCount, 99)}</span>
                )}
              </button>

              {notificationOpen && (
                <div className="notification-menu">
                  <div className="notification-header">
                    <strong>Notifications</strong>
                    <span>{notifications.length} item{notifications.length === 1 ? '' : 's'}</span>
                  </div>
                  <div className="notification-list">
                    {notifications.length === 0 ? (
                      <div className="notification-empty">No notifications yet.</div>
                    ) : notifications.slice(0, 8).map((note: any) => (
                      <div key={note._id || `${note.message}-${note.createdAt}`} className={`notification-row ${note.type || 'info'}`}>
                        <div className="notification-dot"></div>
                        <div>
                          <p>{note.message}</p>
                          {note.createdAt && <time>{new Date(note.createdAt).toLocaleString()}</time>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div
              className="user-profile"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              ref={dropdownRef}
            >
              <div className="user-info">
                <div className="user-name">{user.name}</div>
                <div className="user-role">{user.role}</div>
              </div>
              <div className="user-avatar">
                <User size={20} />
              </div>

              {/* Dropdown Menu */}
              {dropdownOpen && (
                <div className="dropdown-menu">
                  <div className="dropdown-header">
                    <div className="user-avatar">
                      <User size={24} />
                    </div>
                    <div className="user-info">
                      <div className="user-name">{user.name}</div>
                      <div className="user-email">{user.email}</div>
                    </div>
                  </div>
                  <ul className="dropdown-list">
                    <li className="dropdown-item">
                      <User size={18} className="dropdown-item-icon" />
                      Profile Settings
                    </li>
                    <li className="dropdown-item">
                      <CreditCard size={18} className="dropdown-item-icon" />
                      API Tokens
                    </li>
                    <li className="dropdown-item">
                      <Settings size={18} className="dropdown-item-icon" />
                      Settings
                    </li>
                    {user.role === 'admin' && (
                      <li className="dropdown-item">
                        <Shield size={18} className="dropdown-item-icon" />
                        Admin Panel
                      </li>
                    )}
                    <div className="dropdown-divider"></div>
                    <li className="dropdown-item danger" onClick={handleLogout}>
                      <LogOut size={18} className="dropdown-item-icon" />
                      Logout
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        /* Right: Login/Signup buttons (Not logged in) */
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <Link 
            to="/login" 
            style={{ 
              fontWeight: 600, 
              color: 'var(--text-main)', 
              textDecoration: 'none', 
              fontSize: '15px' 
            }}
          >
            Login
          </Link>
          <Link 
            to="/register" 
            style={{ 
              background: 'var(--primary-gradient)', 
              color: 'white', 
              padding: '8px 20px', 
              borderRadius: '99px', 
              fontWeight: 600, 
              textDecoration: 'none', 
              fontSize: '15px',
              boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)'
            }}
          >
            Sign Up
          </Link>
        </div>
      )}
    </header>
  );
}

export default Navbar;
