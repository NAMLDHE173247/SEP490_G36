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
  listModelRegistries: async (): Promise<any[]> => {
    const response = await api.get('/model-registry');
    return response.data;
  },
  registerModelVersion: async (payload: any): Promise<any> => {
    const response = await api.post('/model-versions', payload);
    return response.data;
  },
  getEvaluationsByJob: async (jobId: string): Promise<any[]> => {
    const response = await api.get(`/model-versions/evaluations/${jobId}`);
    return response.data;
  },
  clusterSafeSplit: async (
    data: any[],
    testPercentage: number,
    threshold: number,
    maxAttempts: number,
    seed = 42
  ): Promise<SafeSplitResult> => {
    const response = await api.post('/cluster/safe-split', {
      data,
      test_percentage: testPercentage,
      threshold,
      max_attempts: maxAttempts,
      seed,
    });
    return response.data;
  },
  pushToHuggingFace: async (payload: {
    token: string;
    repoId: string;
    fileName: string;
    content: string;
    isPrivate: boolean;
  }): Promise<any> => {
    const response = await api.post('/huggingface/upload', payload);
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
  chat: async (text_input: string, hf_hub_id: string = "", provider?: string) => {
    const response = await api.post("/chat", { text_input, hf_hub_id, provider });
    return response.data;
  },
  infer: async (text_input: string, hf_model_id: string = "", provider?: string) => {
    const response = await api.post("/infer", { text_input, hf_model_id, provider });
    return response.data;
  },
  inferStream: async (
    text_input: string,
    hf_model_id: string = "",
    options: {
      history?: Array<{ role: "user" | "assistant"; content: string }>;
      system_prompt?: string;
      max_new_tokens?: number;
      temperature?: number;
      top_k?: number;
      top_p?: number;
      repetition_penalty?: number;
      provider?: string;
      signal?: AbortSignal;
      onFinalInfo?: (info: any) => void;
    } = {},
    onChunk: (text: string) => void
  ) => {
    const { signal, onFinalInfo, provider, ...restOptions } = options;
    const response = await fetch(`${API_BASE_URL}/infer/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        Authorization: getAuthToken() ? `Bearer ${getAuthToken()}` : "",
      },
      body: JSON.stringify({ text_input, hf_model_id, provider, ...restOptions }),
      signal,
    });

    if (!response.ok) {
      let errMsg = `HTTP error! status: ${response.status}`;
      try {
        const errJson = await response.json();
        if (errJson.error) errMsg = errJson.error;
      } catch (e) { }
      throw new Error(errMsg);
    }

    if (!response.body) {
      throw new Error("Luồng dữ liệu rỗng");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let receivedText = false;

    const processSseLine = (line: string) => {
      if (!line.trim().startsWith('data:')) {
        return;
      }

      const dataText = line.trim().substring(5).trim();
      if (!dataText || dataText === '[DONE]') {
        return;
      }

      try {
        const dataObj = JSON.parse(dataText);
        if (dataObj.error) {
          const streamErr = new Error(dataObj.error);
          (streamErr as any).isStreamingError = true;
          throw streamErr;
        }
        if (dataObj.is_final && onFinalInfo) {
          onFinalInfo(dataObj);
        } else if (typeof dataObj.text === "string" && dataObj.text.length > 0) {
          receivedText = true;
          onChunk(dataObj.text);
        } else if (typeof dataObj.result === "string" && dataObj.result.length > 0) {
          receivedText = true;
          onChunk(dataObj.result);
        }
      } catch (e: any) {
        if (e.isStreamingError) {
          throw e;
        }
        console.warn("Lỗi parse SSE JSON:", dataText, e);
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');

      buffer = lines.pop() || "";

      for (const line of lines) {
        processSseLine(line);
      }
    }

    const remaining = buffer.trim();
    if (remaining) {
      processSseLine(remaining);
    }

    if (!receivedText) {
      throw new Error("Model không trả về nội dung. Vui lòng thử lại hoặc kiểm tra GPU service.");
    }
  },
  loadModel: async (hf_model_id: string, options?: any) => {
    const response = await api.post("/model/load", { hf_model_id, ...options });
    return response.data;
  },
  stopInference: async (slotId: number) => {
    const response = await api.post(`/infer/stop/${slotId}`);
    return response.data;
  },
  unloadModel: async (slotId: number) => {
    const response = await api.post(`/model/unload/${slotId}`);
    return response.data;
  },
  validateModel: async (model: string, provider: string) => {
    const response = await api.post("/chat/validate-model", { model, provider });
    return response.data;
  },
  getInferenceLogs: async (instanceId?: number, inference_id?: string) => {
    const params: any = {};
    if (instanceId !== undefined) params.instanceId = instanceId;
    if (inference_id) params.inference_id = inference_id;
    const response = await api.get("/infer/logs", { params });
    return response.data;
  },
  getChatSessions: async (limit = 30): Promise<any[]> => {
    const response = await api.get('/chat/sessions', { params: { limit } });
    return response.data;
  },
  getChatSessionById: async (id: string): Promise<any> => {
    const response = await api.get(`/chat/sessions/${id}`);
    return response.data;
  },
  createChatSession: async (payload: {
    userMessage: string;
    aiMessage: string;
    model: string;
    responseTime: number;
  }): Promise<any> => {
    const response = await api.post('/chat/sessions', payload);
    return response.data;
  },
  appendMessageToSession: async (id: string, payload: {
    userMessage: string;
    aiMessage: string;
    model: string;
    responseTime: number;
  }): Promise<any> => {
    const response = await api.put(`/chat/sessions/${id}`, payload);
    return response.data;
  },
  deleteChatSession: async (id: string): Promise<any> => {
    const response = await api.delete(`/chat/sessions/${id}`);
    return response.data;
  },
  updateChatSessionTitle: async (id: string, title: string): Promise<any> => {
    const response = await api.patch(`/chat/sessions/${id}/title`, { title });
    return response.data;
  },
  getDatasetPrompts: async (): Promise<{ prompts: any[] }> => {
    const response = await api.get('/dataset-prompts');
    return response.data;
  },
  getActiveRegistryModel: async (registryId: string): Promise<any> => {
    const response = await api.get(`/model-registry/${registryId}/active`);
    return response.data;
  }
};

export interface SafeSplitConflictPreview {
  trainIndex: number;
  testIndex: number;
  similarity: number;
}

export interface SafeSplitResult {
  resolved: boolean;
  attempts: number;
  threshold: number;
  trainIndices: number[];
  testIndices: number[];
  trainCount: number;
  testCount: number;
  conflictCount: number;
  maxCrossSplitSimilarity: number;
  datasetFingerprint?: string;
  conflictsPreview?: SafeSplitConflictPreview[];
}

