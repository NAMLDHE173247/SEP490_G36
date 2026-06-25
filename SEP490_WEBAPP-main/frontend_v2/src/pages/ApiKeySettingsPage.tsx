import React, { useState, useEffect } from 'react';
import { ApiKeys, getPersonalApiKeys, updatePersonalApiKeys, getGlobalApiKeys, updateGlobalApiKeys } from '../services/configApi';
import { useAuth } from '../context/AuthContext';
import { Key, Save, Info, AlertCircle, CheckCircle2, Shield, Settings2 } from 'lucide-react';
import '../styles/ApiKeySettings.css';

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'deepseek', label: 'Deepseek' }
];

const ApiKeySettingsPage: React.FC = () => {
  const { user } = useAuth();
  const isManager = user?.role === 'admin' || user?.role === 'supervisor';
  const [activeTab, setActiveTab] = useState<'personal' | 'global'>('personal');
  const [personalKeys, setPersonalKeys] = useState<ApiKeys>({});
  const [globalKeys, setGlobalKeys] = useState<ApiKeys>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

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
        setPersonalKeys(data);
      } else if (activeTab === 'global' && isManager) {
        const data = await getGlobalApiKeys();
        setGlobalKeys(data);
      }
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
        await updatePersonalApiKeys(personalKeys);
      } else if (activeTab === 'global' && isManager) {
        await updateGlobalApiKeys(globalKeys);
      }
      setSuccessMsg('API keys saved successfully!');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save API keys');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyChange = (providerId: string, value: string) => {
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
              <h2 className="api-settings-title">Cấu hình API Keys</h2>
              <p className="api-settings-subtitle">Quản lý mã bảo mật để kết nối với các mô hình AI</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        {isManager && (
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
              className={`api-settings-tab ${activeTab === 'global' ? 'active-global' : ''}`}
              onClick={() => setActiveTab('global')}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Settings2 size={16} /> Hệ thống (Global)
              </div>
            </button>
          </div>
        )}

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
                ? 'Key cá nhân sẽ ghi đè key hệ thống. Nếu để trống, hệ thống sẽ sử dụng key mặc định.'
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

                return (
                  <div key={provider.id} className="api-key-group">
                    <label className="api-key-label">{provider.label} API Key</label>
                    <div className="api-key-input-wrapper">
                      <Key size={18} className="api-key-input-icon" />
                      <input
                        type="password"
                        placeholder={`Nhập ${provider.label} API Key... (để trống nếu không đổi)`}
                        value={value}
                        onChange={(e) => handleKeyChange(provider.id, e.target.value)}
                        className="api-key-input"
                      />
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
            disabled={saving || loading}
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
