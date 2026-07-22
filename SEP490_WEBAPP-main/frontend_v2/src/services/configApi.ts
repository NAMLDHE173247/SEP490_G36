import { api } from './api';

export interface ApiKeys {
  openai?: string;
  gemini?: string;
  deepseek?: string;
  openrouter?: string;
  groq?: string;
}
export type ApiKeyConfigured = Record<'openai' | 'gemini' | 'deepseek' | 'openrouter' | 'groq', boolean>;
export interface ApiKeyStatusResponse { configured: Partial<ApiKeyConfigured> }

export interface CliProxyStatus {
  enabled: boolean;
  reachable: boolean;
  managementConfigured?: boolean;
  circuit?: { failures: number; open: boolean; retryAfterMs: number };
  models: string[];
  modelCount?: number;
  message?: string;
}

export const getPersonalApiKeys = async (): Promise<ApiKeyStatusResponse> => {
  const response = await api.get(`/config/personal-keys`);
  return response.data;
};

export const updatePersonalApiKeys = async (keys: ApiKeys): Promise<void> => {
  await api.put(`/config/personal-keys`, keys);
};

export const getGlobalApiKeys = async (): Promise<ApiKeyStatusResponse> => {
  const response = await api.get(`/config/global-keys`);
  return response.data;
};

export const updateGlobalApiKeys = async (keys: ApiKeys): Promise<void> => {
  await api.put(`/config/global-keys`, keys);
};

export const getCliProxyStatus = async (): Promise<CliProxyStatus> => {
  try {
    const response = await api.get('/config/cli-proxy/status');
    return response.data;
  } catch (error: any) {
    if (error?.response?.data && typeof error.response.data.enabled === 'boolean') return error.response.data;
    throw error;
  }
};

export const getCliProxyModels = async (): Promise<{ enabled: boolean; reachable: boolean; models: string[]; defaultModel: string }> => {
  const response = await api.get('/config/cli-proxy/models');
  return response.data;
};

export const startCliProxyOAuth = async (provider: 'codex' | 'claude' | 'gemini') => {
  const response = await api.post(`/config/cli-proxy/oauth/${provider}/start`, { consent: true });
  return response.data as { provider: string; url: string; state: string };
};

export const getCliProxyOAuthStatus = async (state: string) => {
  const response = await api.get('/config/cli-proxy/oauth/status', { params: { state } });
  return response.data as { status: 'wait' | 'ok' | 'error'; error?: string };
};

export interface CliProxyAccount { id: string; provider: string; email: string; status: string; disabled: boolean }
export const listCliProxyAccounts = async (): Promise<CliProxyAccount[]> => {
  const response = await api.get('/config/cli-proxy/accounts');
  return response.data?.accounts || [];
};
export const disconnectCliProxyAccount = async (accountId: string): Promise<void> => {
  await api.delete(`/config/cli-proxy/accounts/${encodeURIComponent(accountId)}`);
};
