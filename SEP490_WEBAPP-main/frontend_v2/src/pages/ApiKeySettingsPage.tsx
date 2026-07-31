import React, { useState, useEffect, useRef } from 'react';
import { ApiKeys, ApiKeyConfigured, CliProxyStatus, CliProxyAccount, getPersonalApiKeys, updatePersonalApiKeys, getGlobalApiKeys, updateGlobalApiKeys, getCliProxyStatus, startCliProxyOAuth, getCliProxyOAuthStatus, listCliProxyAccounts, disconnectCliProxyAccount } from '../services/configApi';
import { useAuth } from '../context/AuthContext';
import { Key, Save, Info, AlertCircle, CheckCircle2, Shield, Settings2, Server, RefreshCw } from 'lucide-react';
import '../styles/ApiKeySettings.css';

const PROVIDERS = [
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'groq', label: 'Groq' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'deepseek', label: 'Deepseek' }
];

const ApiKeySettingsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [activeTab, setActiveTab] = useState<'personal' | 'global' | 'oauth'>('personal');
  const [personalKeys, setPersonalKeys] = useState<ApiKeys>({});
  const [globalKeys, setGlobalKeys] = useState<ApiKeys>({});
  const [personalConfigured, setPersonalConfigured] = useState<Partial<ApiKeyConfigured>>({});
  const [globalConfigured, setGlobalConfigured] = useState<Partial<ApiKeyConfigured>>({});
  const [dirtyProviders, setDirtyProviders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [gatewayStatus, setGatewayStatus] = useState<CliProxyStatus | null>(null);
  const [oauthConnecting, setOauthConnecting] = useState<string | null>(null);
  const [oauthMessage, setOauthMessage] = useState('');
  const oauthPollRef = useRef<number | null>(null);
  const [oauthAccounts, setOauthAccounts] = useState<CliProxyAccount[]>([]);
  const [disconnectingAccount, setDisconnectingAccount] = useState<string | null>(null);
  const [oauthConsent, setOauthConsent] = useState(false);

  useEffect(() => {
    loadKeys();
    return () => { if (oauthPollRef.current) window.clearInterval(oauthPollRef.current); };
  }, [activeTab]);

  const connectOAuth = async (provider: 'codex' | 'claude') => {
    setError(null); setOauthMessage(''); setOauthConnecting(provider);
    const popup = window.open('about:blank', `oauth-${provider}`, 'width=720,height=820');
    if (popup) popup.opener = null;
    try {
      const session = await startCliProxyOAuth(provider);
      if (popup) popup.location.href = session.url;
      else throw new Error('Trình duyệt đã chặn cửa sổ đăng nhập OAuth. Hãy cho phép popup và thử lại.');
      if (oauthPollRef.current) window.clearInterval(oauthPollRef.current);
      let attempts = 0;
      oauthPollRef.current = window.setInterval(async () => {
        attempts += 1;
        try {
          const result = await getCliProxyOAuthStatus(session.state);
          if (result.status === 'ok') {
            if (oauthPollRef.current) window.clearInterval(oauthPollRef.current);
            oauthPollRef.current = null;
            setOauthConnecting(null);
            setOauthMessage(`${provider === 'codex' ? 'Codex' : 'Claude'} đã kết nối thành công.`);
            await loadKeys();
          } else if (result.status === 'error' || attempts >= 60) {
            if (oauthPollRef.current) window.clearInterval(oauthPollRef.current);
            oauthPollRef.current = null;
            setOauthConnecting(null);
            popup?.close();
            setError(result.error || 'OAuth hết thời gian chờ.');
          }
        } catch (pollError: any) {
          if (attempts >= 3) {
            if (oauthPollRef.current) window.clearInterval(oauthPollRef.current);
            oauthPollRef.current = null;
            setOauthConnecting(null);
            popup?.close();
            setError(pollError?.response?.data?.error || 'Không đọc được trạng thái OAuth.');
          }
        }
      }, 2000);
    } catch (err: any) {
      popup?.close();
      setOauthConnecting(null);
      setError(err?.response?.data?.error || err?.message || 'Không thể bắt đầu OAuth.');
    }
  };

  const disconnectOAuth = async (account: CliProxyAccount) => {
    if (!window.confirm(`Ngắt kết nối tài khoản ${account.email || account.provider}? Tác vụ đang chạy có thể chuyển sang API-key fallback.`)) return;
    setDisconnectingAccount(account.id); setError(null);
    try {
      await disconnectCliProxyAccount(account.id);
      setOauthAccounts(current => current.filter(item => item.id !== account.id));
      setOauthMessage('Đã ngắt kết nối tài khoản OAuth.');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Không thể ngắt kết nối tài khoản.');
    } finally {
      setDisconnectingAccount(null);
    }
  };

  const loadKeys = async () => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      if (activeTab === 'personal') {
        const data = await getPersonalApiKeys();
        setPersonalConfigured(data.configured || {});
        setPersonalKeys({});
      } else if (activeTab === 'global' && isAdmin) {
        const data = await getGlobalApiKeys();
        setGlobalConfigured(data.configured || {});
        setGlobalKeys({});
      } else if (activeTab === 'oauth') {
        const status = await getCliProxyStatus();
        setGatewayStatus(status);
        setOauthAccounts(status.managementConfigured ? await listCliProxyAccounts() : []);
      }
      setDirtyProviders(new Set());
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      if (activeTab === 'personal') {
        const updates = Object.fromEntries(Object.entries(personalKeys).filter(([provider]) => dirtyProviders.has(provider)));
        await updatePersonalApiKeys(updates);
        setPersonalConfigured(previous => ({ ...previous, ...Object.fromEntries(Object.entries(updates).map(([key, value]) => [key, Boolean(value)])) }));
        setPersonalKeys({});
      } else if (activeTab === 'global' && isAdmin) {
        const updates = Object.fromEntries(Object.entries(globalKeys).filter(([provider]) => dirtyProviders.has(provider)));
        await updateGlobalApiKeys(updates);
        setGlobalConfigured(previous => ({ ...previous, ...Object.fromEntries(Object.entries(updates).map(([key, value]) => [key, Boolean(value)])) }));
        setGlobalKeys({});
      }
      setDirtyProviders(new Set());
      setSuccessMsg('Đã lưu cấu hình bảo mật. Giá trị API key sẽ không được trả lại trình duyệt.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save API keys');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyChange = (providerId: string, value: string) => {
    setDirtyProviders(previous => new Set(previous).add(providerId));
    if (activeTab === 'personal') {
      setPersonalKeys(prev => ({ ...prev, [providerId]: value }));
    } else {
      setGlobalKeys(prev => ({ ...prev, [providerId]: value }));
    }
  };

  return (
    <div className="api-settings-page">
      <div className="api-settings-container">
        {/* Header */}
        <div className="api-settings-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Shield size={32} color="#60a5fa" />
            <div>
              <h2 className="api-settings-title">Kết nối nhà cung cấp AI</h2>
              <p className="api-settings-subtitle">Quản lý API key và tài khoản OAuth mà không để lộ thông tin xác thực</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="api-settings-tabs">
            <button
              className={`api-settings-tab ${activeTab === 'personal' ? 'active-personal' : ''}`}
              onClick={() => setActiveTab('personal')}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Key size={16} /> Cá nhân (Personal)
              </div>
            </button>
            <button
              className={`api-settings-tab ${activeTab === 'oauth' ? 'active-global' : ''}`}
              onClick={() => setActiveTab('oauth')}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Server size={16} /> OAuth Gateway
              </div>
            </button>
            {isAdmin && <button
              className={`api-settings-tab ${activeTab === 'global' ? 'active-global' : ''}`}
              onClick={() => setActiveTab('global')}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Settings2 size={16} /> Hệ thống (Global)
              </div>
            </button>}
        </div>

        {/* Body */}
        <div className="api-settings-body">
          {error && (
            <div className="api-settings-alert error">
              <AlertCircle size={20} className="api-settings-alert-icon" />
              <div>{error}</div>
            </div>
          )}
          
          {successMsg && (
            <div className="api-settings-alert success">
              <CheckCircle2 size={20} className="api-settings-alert-icon" />
              <div>{successMsg}</div>
            </div>
          )}

          {activeTab !== 'oauth' && <div className="api-settings-alert info">
            <Info size={20} className="api-settings-alert-icon" />
            <div>
              {activeTab === 'personal'
                ? 'Key cá nhân sẽ ghi đè key hệ thống. Nếu để trống, hệ thống sẽ sử dụng key mặc định.'
                : 'Key hệ thống sẽ được sử dụng cho tất cả người dùng không cấu hình key cá nhân.'}
            </div>
          </div>}

          {loading ? (
            <div className="page-loader">
              <div className="page-loader-spinner"></div>
            </div>
          ) : activeTab === 'oauth' ? (
            <div className="oauth-gateway-panel">
              <div className={`api-settings-alert ${gatewayStatus?.reachable ? 'success' : gatewayStatus?.enabled ? 'error' : 'info'}`}>
                {gatewayStatus?.reachable ? <CheckCircle2 size={20}/> : <AlertCircle size={20}/>}
                <div>
                  <strong>{gatewayStatus?.reachable ? 'OAuth Gateway đang hoạt động' : gatewayStatus?.enabled ? 'Gateway đã bật nhưng chưa kết nối được' : 'OAuth Gateway đang tắt'}</strong>
                  <div style={{ marginTop: 4 }}>{gatewayStatus?.message || (gatewayStatus?.reachable ? `${gatewayStatus.modelCount || 0} model khả dụng.` : 'Bật feature flag sau khi cấu hình sidecar an toàn.')}</div>
                  {gatewayStatus?.circuit?.open && <div style={{ marginTop: 6, color: '#b45309' }}>Circuit breaker đang mở; tác vụ AI sẽ dùng API-key fallback trong khoảng {Math.ceil(gatewayStatus.circuit.retryAfterMs / 1000)} giây.</div>}
                </div>
              </div>
              {gatewayStatus?.models?.length ? <div className="oauth-model-list">
                <h3>Model từ các tài khoản đã kết nối</h3>
                <div>{gatewayStatus.models.slice(0, 24).map(model => <span key={model}>{model}</span>)}</div>
              </div> : null}
              {gatewayStatus?.reachable && gatewayStatus?.managementConfigured && <div className="oauth-provider-grid">
                <article><strong>OpenAI Codex</strong><p>Đăng nhập bằng tài khoản Codex OAuth.</p><button onClick={() => connectOAuth('codex')} disabled={Boolean(oauthConnecting) || !oauthConsent}>{oauthConnecting === 'codex' ? 'Đang chờ đăng nhập…' : 'Kết nối Codex'}</button></article>
                <article><strong>Claude Code</strong><p>Đăng nhập bằng tài khoản Claude OAuth.</p><button onClick={() => connectOAuth('claude')} disabled={Boolean(oauthConnecting) || !oauthConsent}>{oauthConnecting === 'claude' ? 'Đang chờ đăng nhập…' : 'Kết nối Claude'}</button></article>
                <article className="disabled"><strong>Gemini</strong><p>Đang xác minh Gemini CLI/plugin OAuth.</p><button disabled>Chưa bật</button></article>
              </div>}
              {gatewayStatus?.reachable && gatewayStatus?.managementConfigured && <label className="oauth-consent"><input type="checkbox" checked={oauthConsent} onChange={event => setOauthConsent(event.target.checked)}/><span>Tôi xác nhận đây là tài khoản AI cá nhân của tôi, đã đọc điều khoản nhà cung cấp và đồng ý sử dụng quota của tài khoản này cho các tác vụ do chính tôi thực hiện.</span></label>}
              {oauthAccounts.length > 0 && <div className="oauth-account-list">
                <h3>Tài khoản hệ thống đã kết nối</h3>
                {oauthAccounts.map(account => <div key={account.id} className="oauth-account-row">
                  <div><strong>{account.provider}</strong><span>{account.email || 'Email được ẩn'}</span></div>
                  <span className={`oauth-account-status ${account.disabled ? 'disabled' : ''}`}>{account.disabled ? 'Đã tắt' : account.status}</span>
                  <button onClick={() => disconnectOAuth(account)} disabled={disconnectingAccount === account.id}>{disconnectingAccount === account.id ? 'Đang ngắt…' : 'Ngắt kết nối'}</button>
                </div>)}
              </div>}
              {oauthMessage && <div className="api-settings-alert success" style={{ marginTop:16 }}><CheckCircle2 size={20}/><div>{oauthMessage}</div></div>}
              <button className="api-settings-save-btn" onClick={loadKeys} disabled={loading} style={{ marginTop: 16 }}>
                <RefreshCw size={17} className={loading ? 'sv-spin' : ''}/> Kiểm tra lại kết nối
              </button>
              <div className="api-settings-alert info" style={{ marginTop: 16 }}>
                <Shield size={20}/><div>OAuth token được giữ trong private sidecar, không lưu trong MongoDB và không gửi xuống trình duyệt. Credential được gắn định danh nội bộ theo người dùng; tài khoản khác không thể xem model hoặc sử dụng quota của bạn.</div>
              </div>
            </div>
          ) : (
            <div>
              {PROVIDERS.map(provider => {
                const value = activeTab === 'personal'
                  ? (personalKeys as any)[provider.id] || ''
                  : (globalKeys as any)[provider.id] || '';
                const configured = activeTab === 'personal'
                  ? Boolean((personalConfigured as any)[provider.id])
                  : Boolean((globalConfigured as any)[provider.id]);
                const pendingClear = configured && dirtyProviders.has(provider.id) && value === '';

                return (
                  <div key={provider.id} className="api-key-group">
                    <label className="api-key-label">{provider.label} API Key {configured && <span className={`api-key-configured ${pendingClear ? 'pending-clear' : ''}`}>{pendingClear ? 'Sẽ xóa khi lưu' : 'Đã cấu hình'}</span>}</label>
                    <div className="api-key-input-wrapper">
                      <Key size={18} className="api-key-input-icon" />
                      <input
                        type="password"
                        placeholder={configured ? `Nhập key mới để thay ${provider.label} key hiện tại` : `Nhập ${provider.label} API Key...`}
                        value={value}
                        onChange={(e) => handleKeyChange(provider.id, e.target.value)}
                        className="api-key-input"
                      />
                      {configured && <button type="button" className="api-key-clear" onClick={() => { if (window.confirm(`Xóa ${provider.label} API key khi lưu thay đổi?`)) handleKeyChange(provider.id, ''); }}>Xóa key</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {activeTab !== 'oauth' && <div className="api-settings-footer">
          <button 
            className="api-settings-save-btn" 
            onClick={handleSave} 
            disabled={saving || loading || dirtyProviders.size === 0}
          >
            {saving ? (
              <>
                <div className="loader-spinner"></div>
                Đang lưu...
              </>
            ) : (
              <>
                <Save size={18} />
                Lưu cài đặt
              </>
            )}
          </button>
        </div>}
      </div>
    </div>
  );
};

export default ApiKeySettingsPage;
