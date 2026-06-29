import { api } from './api';

export interface ApiKeys {
  openai?: string;
  gemini?: string;
  deepseek?: string;
}

export const getPersonalApiKeys = async (): Promise<ApiKeys> => {
  const response = await api.get(`/config/personal-keys`);
  return response.data;
};

export const updatePersonalApiKeys = async (keys: ApiKeys): Promise<void> => {
  await api.put(`/config/personal-keys`, keys);
};

export const getGlobalApiKeys = async (): Promise<ApiKeys> => {
  const response = await api.get(`/config/global-keys`);
  return response.data;
};

export const updateGlobalApiKeys = async (keys: ApiKeys): Promise<void> => {
  await api.put(`/config/global-keys`, keys);
};
