import axios from 'axios';
import { getAuthToken } from './authSession';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  }
});

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'supervisor' | 'staff';
  status?: 'active' | 'pending' | 'banned' | 'inactive';
}

export const apiService = {
  listUsers: async (): Promise<{ users: User[] }> => {
    const response = await api.get('/auth/users');
    return response.data;
  },
  updateUserRole: async (id: string, role: string): Promise<any> => {
    const response = await api.patch(`/auth/users/${id}/role`, { role });
    return response.data;
  },
  updateUserStatus: async (id: string, status: string): Promise<any> => {
    const response = await api.patch(`/auth/users/${id}/status`, { status });
    return response.data;
  },
  deleteUser: async (id: string): Promise<any> => {
    const response = await api.delete(`/auth/users/${id}`);
    return response.data;
  },
  createUser: async (payload: any): Promise<any> => {
    const response = await api.post('/auth/register', payload);
    return response.data;
  },
  getGpuConfig: async (): Promise<{ gpuUrl: string, configured: boolean }> => {
    const response = await api.get('/config/gpu-url');
    return response.data;
  },
  updateGpuConfig: async (gpuUrl: string): Promise<any> => {
    const response = await api.post('/config/gpu-url', { gpuUrl });
    return response.data;
  },
  checkGpuStatus: async (): Promise<{ isOk: boolean; data?: any }> => {
    try {
      const response = await api.get('/model-eval/gpu-status', { timeout: 6000 });
      return { isOk: response.status === 200, data: response.data };
    } catch {
      return { isOk: false };
    }
  }
};
