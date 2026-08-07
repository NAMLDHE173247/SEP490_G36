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
