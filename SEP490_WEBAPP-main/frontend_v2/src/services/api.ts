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

export type ModelRegistryItem = {
  _id: string;
  projectId: string;
  modelName: string;
  source: 'huggingface' | 'local';
  hfRepoId?: string;
  localPath?: string;
  status: 'available' | 'downloading' | 'error';
  createdAt: string;
};

// --- Added for Assignment & Task Allocation ---
export type ShareUser = {
  _id: string;
  username: string;
  name: string;
};

export type DatasetAssignmentSample = {
  sampleId: string;
  sampleKey: string;
  sampleIndex: number;
  preview: string;
  assignees: ShareUser[];
  assignee: ShareUser | null;
  hasConflict?: boolean;
  lowestAgreementScore?: number | null;
  pendingAdjudicationCount?: number;
};

export type AssignmentSubmissionProgress = {
  assignedSamples: number;
  requiredMessages: number;
  completedMessages: number;
  missingMessages: Array<{
    sampleId: string;
    sampleIndex: number;
    sampleKey: string;
    messageIndex: number;
    role: string;
  }>;
  percent: number;
  isComplete: boolean;
};

export type AssignmentSubmissionStatus = {
  status: 'draft' | 'submitted';
  submittedAt?: string | null;
  progress: AssignmentSubmissionProgress;
};

export type DatasetAssignmentSummary = {
  user: ShareUser;
  count: number;
  ranges: string[];
  reviewAvailable?: boolean;
  submission?: AssignmentSubmissionStatus;
};

export type DatasetAssignmentsResponse = {
  datasetVersion: {
    _id: string;
    projectName: string;
    versionName: string;
    totalSamples: number;
  };
  samples: DatasetAssignmentSample[];
  summary: DatasetAssignmentSummary[];
  totals: {
    totalSamples: number;
    assigned: number;
    unassigned: number;
    pendingConflicts?: number;
  };
};

export type AssignmentConflictItem = {
  sampleId: string;
  sampleKey: string;
  sampleIndex: number;
  assigneeCount: number;
  agreementScore: number | null;
  pendingAdjudicationCount: number;
  resolvedAdjudicationCount: number;
  status: 'pending' | 'resolved_unpublished' | 'published';
};

export type AssignmentDashboardResponse = {
  overview: {
    totalAssignedSamples: number;
    totalAssignees: number;
    inProgressAssignees: number;
    submittedAssignees: number;
    savedDecisionCount: number;
    publishedDecisionCount: number;
    pendingConflicts: number;
  };
  users: Array<{
    user: ShareUser;
    assignedSamples: number;
    completedTargets: number;
    totalTargets: number;
    completionPercent: number;
    labelsPerHour: number;
    latestActivityAt: string | null;
    reviewAvailable?: boolean;
    submission: {
      status: 'draft' | 'submitted';
      submittedAt?: string | null;
      name?: string | null;
    } | null;
  }>;
  conflicts: AssignmentConflictItem[];
  refreshedAt: string;
};
// ----------------------------------------------

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
  uploadFile: async (file: File, onUploadProgress?: (progressEvent: any) => void): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress,
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
   * Gá»i AI gÃ¡n nhÃ£n mÃ´n há»c cho tá»«ng cluster dá»±a trÃªn dá»¯ liá»‡u trong DB.
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
   * LÆ°u nhÃ£n Ä‘Ã£ chá»n vÃ o DB.
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
   * LÆ°u dá»¯ liá»‡u thÃ nh má»™t dataset version má»›i trong DB.
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

  // --- Added for Assignment & Task Allocation ---
  getDatasetVersionAssignments: async (id: string): Promise<DatasetAssignmentsResponse> => {
    const response = await api.get(`/dataprep/versions/${id}/assignments`);
    return response.data;
  },

  getDatasetVersionAssignmentDashboard: async (id: string): Promise<AssignmentDashboardResponse> => {
    const response = await api.get(`/dataprep/versions/${id}/assignments/dashboard`);
    return response.data;
  },

  getDatasetVersionAssignmentSampleComparison: async (id: string, sampleId: string): Promise<any> => {
    const response = await api.get(`/dataprep/versions/${id}/assignments/samples/${sampleId}/comparison`);
    return response.data;
  },

  assignDatasetVersionRange: async (
    id: string,
    payload: { assigneeId: string; startIndex: number; count: number; batchName?: string; priority?: string }
  ): Promise<{ message: string; assignedCount: number }> => {
    const response = await api.post(`/dataprep/versions/${id}/assignments/batch`, {
      assigneeIds: [payload.assigneeId],
      sampleStartIndex: payload.startIndex,
      sampleCount: payload.count,
      taskType: 'labeling',
      priority: payload.priority || 'medium',
      batchName: payload.batchName || `Manual Batch ${payload.startIndex} - ${payload.startIndex + payload.count - 1}`
    });
    return response.data;
  },

  clearDatasetVersionAssignmentRange: async (
    id: string,
    payload: { startIndex: number; count: number }
  ): Promise<{ message: string; deletedCount: number }> => {
    const response = await api.delete(`/dataprep/versions/${id}/assignments/range`, { data: payload });
    return response.data;
  },

  clearDatasetVersionUserAssignments: async (
    id: string,
    userId: string
  ): Promise<{ message: string; deletedCount: number }> => {
    const response = await api.delete(`/dataprep/versions/${id}/assignments/users/${userId}`);
    return response.data;
  },

  getDatasetVersionDetail: async (id: string): Promise<any> => {
    const response = await api.get(`/dataprep/versions/${id}`);
    return response.data;
  },

  listDatasetVersions: async (): Promise<{ success: boolean; data: any[] }> => {
    const response = await api.get('/dataprep/versions');
    return response.data;
  },

  updateDatasetVersionPrepareProgress: async (id: string, prepareResumeStep: number): Promise<any> => {
    const response = await api.patch(`/dataprep/versions/${id}/prepare-progress`, { prepareResumeStep });
    return response.data;
  },
  // ----------------------------------------------
  // ==========================================
  // Chat & Inference Endpoints
  // ==========================================
  getChatSessions: async (...args: any[]) => { const response = await api.get('/chat-sessions'); return response.data; },
  getChatSessionById: async (...args: any[]) => { const response = await api.get(`/chat-sessions/${args[0]}`); return response.data; },
  createChatSession: async (...args: any[]) => { const response = await api.post('/chat-sessions', args[0]); return response.data; },
  updateChatSessionTitle: async (...args: any[]) => { const response = await api.put(`/chat-sessions/${args[0]}`, { title: args[1] }); return response.data; },
  deleteChatSession: async (...args: any[]) => { const response = await api.delete(`/chat-sessions/${args[0]}`); return response.data; },
  appendMessageToSession: async (...args: any[]) => { const response = await api.post(`/chat-sessions/${args[0]}/messages`, args[1]); return response.data; },
  
  infer: async (...args: any[]) => { 
    const response = await api.post('/inference/infer', args[0]); 
    return response.data; 
  },
  
  inferStream: async (...args: any[]) => {
    let data, onChunkCallback;
    if (typeof args[1] === 'function') {
      data = args[0];
      onChunkCallback = args[1];
    } else if (typeof args[3] === 'function') {
      data = { model: args[0], prompt: args[1], ...args[2] };
      onChunkCallback = args[3];
    } else {
        data = args[0];
        onChunkCallback = args[2] || args[1];
    }
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
    const response = await fetch(`${apiUrl}/inference/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(data)
    });
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.response && onChunkCallback) onChunkCallback(parsed.response);
          } catch (e) {}
        }
      }
    }
  },

  getInferenceLogs: async (...args: any[]) => { const response = await api.get(`/inference/logs/${args[0]}`); return response.data; },
  stopInference: async (...args: any[]) => { const response = await api.post(`/inference/stop/${args[0]}`); return response.data; },
  loadModel: async (...args: any[]) => { const response = await api.post(`/inference/load/${args[0]}`); return response.data; },
  unloadModel: async (...args: any[]) => { const response = await api.post(`/inference/unload/${args[0]}`); return response.data; },
  validateModel: async (...args: any[]) => { const response = await api.get(`/inference/validate/${args[0]}`); return response.data; },
  listModelRegistries: async (...args: any[]) => { const response = await api.get('/model-registry'); return response.data; },
  getActiveRegistryModel: async (...args: any[]) => { const response = await api.get('/model-registry/active'); return response.data; },
  getEvaluationsByJob: async (...args: any[]) => { const response = await api.get(`/evaluations/job/${args[0]}`); return response.data; },
  registerModelVersion: async (...args: any[]) => { const response = await api.post('/model-registry', args[0]); return response.data; },
  getDatasetPrompts: async (...args: any[]) => { const response = await api.get('/dataset/prompts'); return response.data; }
};
