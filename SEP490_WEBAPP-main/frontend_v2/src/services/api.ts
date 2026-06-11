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
  },
  uploadFile: async (file: File): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
  getPreview: async (fileId: string, limit = 5): Promise<any> => {
    const response = await api.get(`/preview/${fileId}`, {
      params: { limit },
    });
    return response.data;
  },
  convertData: async (fileId: string, options: any): Promise<any> => {
    const response = await api.post('/convert', { fileId, options });
    return response.data;
  },

  clusterData: async (
    data: any[],
    k?: number,
    eps?: number,
    minSamples?: number
  ): Promise<{
    data: any[];
    groups: any[];
    assignments: number[];
    clusterStats?: Array<{ clusterId: number; avgSimilarity: number; count: number }>;
    avgSimilarity?: number;
  }> => {
    const response = await api.post('/cluster', {
      data,
      k,
      eps,
      min_samples: minSamples,
    });
    return response.data;
  },

  clusterVisualize: async (
    data: any[],
    maxK: number = 20,
    eps: number = 0.15,
    minSamples: number = 6
  ): Promise<{
    elbow: Array<{ k: number; wcss: number }>;
    silhouette?: Array<{ k: number; silhouette: number }>;
    kDistance: Array<{ rank: number; distance: number }>;
    pointCount: number;
    noiseCount?: number;
  }> => {
    const response = await api.post('/cluster/visualize', { data, max_k: maxK, eps, min_samples: minSamples });
    return response.data;
  },

  clusterRemoveNoise: async (): Promise<{
    data: any[];
    groups: any[];
    assignments: number[];
    clusterStats?: Array<{ clusterId: number; avgSimilarity: number; count: number }>;
    avgSimilarity?: number;
  }> => {
    const response = await api.post('/cluster/remove-noise');
    return response.data;
  },

  clusterDeduplicate: async (
    threshold?: number
  ): Promise<{
    data: any[];
    groups: any[];
    assignments: number[];
    clusterStats?: Array<{ clusterId: number; avgSimilarity: number; count: number }>;
    avgSimilarity?: number;
  }> => {
    const response = await api.post('/cluster/deduplicate', { threshold });
    return response.data;
  },

  /**
   * POST /api/dataprep/versions/:versionId/auto-label/preview
   * Gọi AI gán nhãn môn học cho từng cluster dựa trên dữ liệu trong DB.
   * Response: { suggestions: Array<{ clusterId, label, sampleCount }> }
   */
  previewAutoLabels: async (
    versionId: string,
    provider: 'gemini' | 'openai' | 'deepseek'
  ): Promise<{
    suggestions: Array<{ clusterId: number; label: string; sampleCount: number }>;
  }> => {
    const response = await api.post(`/dataprep/versions/${versionId}/auto-label/preview`, { provider });
    return response.data;
  },

  /**
   * POST /api/dataprep/versions/:versionId/auto-label/save
   * Lưu nhãn đã chọn vào DB.
   * Body: { labels: Array<{ clusterId, label }> }
   */
  saveAutoLabels: async (
    versionId: string,
    labels: Array<{ clusterId: number; label: string }>
  ): Promise<{ message: string; insertedCount: number }> => {
    const response = await api.post(`/dataprep/versions/${versionId}/auto-label/save`, { labels });
    return response.data;
  },

  /**
   * POST /api/dataprep/versions
   * Lưu dữ liệu thành một dataset version mới trong DB.
   */
  createDatasetVersion: async (payload: {
    projectName: string;
    projectId?: string;
    parentVersionId?: string;
    operationType?: 'upload' | 'clean' | 'cluster' | 'labeling_base' | 'manual_edit';
    operationParams?: Record<string, any>;
    prepareResumeStep?: number;
    similarityThreshold: number;
    format: 'openai' | 'alpaca';
    data: Array<Record<string, any>>;
  }): Promise<{
    message: string;
    datasetVersion: { _id: string; projectName: string; versionName: string };
    sampleIdMap: Record<string, string>;
  }> => {
    const response = await api.post('/dataprep/versions', payload);
    return response.data;
  },
};
