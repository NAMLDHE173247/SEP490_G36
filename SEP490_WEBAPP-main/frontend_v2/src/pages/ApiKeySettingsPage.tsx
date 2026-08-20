import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Key, Save, Info, AlertCircle, CheckCircle2, Shield, Settings2 } from 'lucide-react';
import { ApiKeys, ApiKeyConfigured, getPersonalApiKeys, updatePersonalApiKeys, getGlobalApiKeys, updateGlobalApiKeys } from '../services/configApi';
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
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [globalKeys, setGlobalKeys] = useState<ApiKeys>({});
  const [personalKeys, setPersonalKeys] = useState<ApiKeys>({});
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [dirtyProviders, setDirtyProviders] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'personal' | 'global'>('personal');
  const [globalConfigured, setGlobalConfigured] = useState<Partial<ApiKeyConfigured>>({});
  const [personalConfigured, setPersonalConfigured] = useState<Partial<ApiKeyConfigured>>({});

  useEffect(() => {
    loadKeys();
  }, [activeTab]);

  const loadKeys = async () => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      if (activeTab === 'personal') {
        const data = await getPersonalApiKeys();
        setPersonalConfigured(data.configured || {});
        setPersonalKeys({});
        if (isAdmin) {
          getGlobalApiKeys().then(gData => setGlobalConfigured(gData.configured || {})).catch(() => {});
        }
      } else if (activeTab === 'global' && isAdmin) {
        const data = await getGlobalApiKeys();
        setGlobalConfigured(data.configured || {});
        setGlobalKeys({});
      }
      setDirtyProviders(new Set());
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  const handleClearKey = async (providerId: string, providerLabel: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn XÓA vĩnh viễn ${providerLabel} API key khỏi hệ thống?`)) {
      return;
    }
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      if (activeTab === 'personal') {
        await updatePersonalApiKeys({ [providerId]: '' });
        setPersonalConfigured(prev => ({ ...prev, [providerId]: false }));
        setPersonalKeys(prev => ({ ...prev, [providerId]: '' }));
      } else if (activeTab === 'global' && isAdmin) {
        await updateGlobalApiKeys({ [providerId]: '' });
        setGlobalConfigured(prev => ({ ...prev, [providerId]: false }));
        setGlobalKeys(prev => ({ ...prev, [providerId]: '' }));
      }
      setDirtyProviders(prev => {
        const next = new Set(prev);
        next.delete(providerId);
        return next;
      });
      setSuccessMsg(`Đã xóa vĩnh viễn ${providerLabel} API key thành công!`);
    } catch (err: any) {
      setError(err.response?.data?.error || `Không thể xóa ${providerLabel} API key`);
    } finally {
      setSaving(false);
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
              <p className="api-settings-subtitle">Quản lý API key mà không để lộ thông tin xác thực</p>
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

          <div className="api-settings-alert info">
            <Info size={20} className="api-settings-alert-icon" />
            <div>
              {activeTab === 'personal'
                ? 'Key cá nhân sẽ ghi đè key hệ thống. Nếu để trống, hệ thống sẽ sử dụng key mặc định hoặc key hệ thống.'
                : 'Key hệ thống sẽ được sử dụng cho tất cả người dùng không cấu hình key cá nhân.'}
            </div>
          </div>

          {loading ? (
            <div className="page-loader">
              <div className="page-loader-spinner"></div>
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
                    <label className="api-key-label">
                      {provider.label} API Key {configured && <span className={`api-key-configured ${pendingClear ? 'pending-clear' : ''}`}>{pendingClear ? 'Sẽ xóa khi lưu' : 'Đã cấu hình'}</span>}
                    </label>
                    <div className="api-key-input-wrapper">
                      <Key size={18} className="api-key-input-icon" />
                      <input
                        type="password"
                        placeholder={configured ? `Nhập key mới để thay ${provider.label} key hiện tại` : `Nhập ${provider.label} API Key...`}
                        value={value}
                        onChange={(e) => handleKeyChange(provider.id, e.target.value)}
                        className="api-key-input"
                      />
                      {configured && (
                        <button
                          type="button"
                          className="api-key-clear"
                          disabled={saving}
                          onClick={() => handleClearKey(provider.id, provider.label)}
                        >
                          Xóa key
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="api-settings-footer">
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
        </div>
      </div>
    </div>
  );
};

export default ApiKeySettingsPage;
