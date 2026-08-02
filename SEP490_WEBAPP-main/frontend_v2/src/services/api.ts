import axios from 'axios';
import { getAuthToken } from './authSession';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

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

// --- Added for Message-level Labeling (Phase 1) ---
export type AggregatedLabel = {
  _id: string;
  sampleId: string;
  name: string;
  type: 'hard' | 'soft';
  targetScope: 'sample' | 'message';
  messageIndex?: number;
  messageRole?: 'user' | 'assistant';
  targetTextSnapshot?: string;
  assignedUserCount: number;
  assignedByCurrentUser: boolean;
  assignedUsers?: ShareUser[];
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type MessageAutoLabelSuggestion = {
  messageIndex: number;
  role: 'user' | 'assistant';
  label: string[];
  confidence?: number;
  is_correct_logic?: boolean;
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
  role: 'admin' | 'supervisor' | 'staff' | 'checker';
  status?: 'active' | 'pending' | 'banned' | 'inactive';
}

export const apiService = {
  getTrainingExportData: async (versionId: string): Promise<{
    total: number;
    labeledSamples: number;
    systemPrompt?: { id?: string | null; name?: string | null; content?: string | null };
    data: any[];
  }> => {
    const response = await api.get(`/dataprep/export/${versionId}/training-data`);
    return response.data;
  },
  snapshotDatasetLabels: async (
    versionId: string,
    payload?: { name?: string; description?: string },
  ): Promise<{ success: boolean; snapshotId: string; totalLabels: number; message: string }> => {
    const response = await api.post(`/dataprep/export/${versionId}/snapshot`, payload || {});
    return response.data;
  },
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
      // Backend probes GPU tunnel (localtunnel) with 30s timeout,
      // so frontend must wait longer than that before giving up.
      const response = await api.get('/model-eval/gpu-status', { timeout: 35000 });
      return { isOk: response.status === 200, data: response.data };
    } catch (err: any) {
      console.warn('[checkGpuStatus] failed:', err?.message || err);
      return { isOk: false };
    }
  },
  uploadFile: async (file: File, projectId?: string, onUploadProgress?: (progressEvent: any) => void): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);
    if (projectId) formData.append('projectId', projectId);
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
    provider: 'openrouter' | 'groq' | 'deepseek' | 'oauth_gateway' | 'openai' | 'gemini',
    model?: string
  ): Promise<{
    suggestions: Array<{ clusterId: number; label: string; source: 'ai'; topic: string; reason: string; sampleCount: number }>;
  }> => {
    const response = await api.post(`/dataprep/versions/${versionId}/auto-label/preview`, { provider, model });
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
    cleanStats?: Record<string, any>;
  }): Promise<{
    message: string;
    datasetVersion: { _id: string; projectName: string; versionName: string };
    sampleIdMap: Record<string, string>;
  }> => {
    const response = await api.post('/dataprep/versions', payload);
    return response.data;
  },

  // --- DataPrep Projects ---
  listProjects: async (): Promise<{ projects: any[] }> => {
    const response = await api.get('/dataprep/projects');
    return response.data;
  },

  createProject: async (payload: { name: string; sourceType?: 'chat' | 'lesson' }): Promise<{ project: any }> => {
    const response = await api.post('/dataprep/projects', payload);
    return response.data;
  },

  getProjectTasks: async (projectId: string): Promise<{ project: any; tasks: any[] }> => {
    const response = await api.get(`/dataprep/projects/${projectId}/tasks`);
    return response.data;
  },

  deleteProject: async (projectId: string): Promise<{ success: boolean }> => {
    const response = await api.delete(`/dataprep/projects/${projectId}`);
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

  getCheckerActivityLogs: async (id: string): Promise<{ success: boolean; data: any[] }> => {
    const response = await api.get(`/dataprep/versions/${id}/assignments/checker-logs`);
    return response.data;
  },

  setDatasetSampleCanonicalLabels: async (payload: { versionId: string; sampleId: string; labels: string[]; targetTextSnapshot?: string; sourceAnnotatorIds?: string[] }): Promise<any> => {
    const response = await api.post('/dataprep/assignments/samples/canonical', payload);
    return response.data;
  },

  assignDatasetVersionRange: async (
    id: string,
    payload: { assigneeId: string; startIndex: number; count: number; batchName?: string; priority?: string; similarityThreshold?: number; supervisorId?: string; checkerId?: string }
  ): Promise<{ message: string; assignedCount: number }> => {
    const response = await api.post(`/dataprep/versions/${id}/assignments/batch`, {
      assigneeIds: [payload.assigneeId],
      sampleStartIndex: payload.startIndex,
      sampleCount: payload.count,
      taskType: 'labeling',
      priority: payload.priority || 'medium',
      batchName: payload.batchName || `Manual Batch ${payload.startIndex} - ${payload.startIndex + payload.count - 1}`,
      similarityThreshold: payload.similarityThreshold,
      supervisorId: payload.supervisorId,
      checkerId: payload.checkerId
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
  getChatSessions: async (...args: any[]) => { const response = await api.get('/chat/sessions'); return response.data; },
  getChatSessionById: async (...args: any[]) => { const response = await api.get(`/chat/sessions/${args[0]}`); return response.data; },
  createChatSession: async (...args: any[]) => { const response = await api.post('/chat/sessions', args[0]); return response.data; },
  updateChatSessionTitle: async (...args: any[]) => { const response = await api.patch(`/chat/sessions/${args[0]}/title`, { title: args[1] }); return response.data; },
  deleteChatSession: async (...args: any[]) => { const response = await api.delete(`/chat/sessions/${args[0]}`); return response.data; },
  appendMessageToSession: async (...args: any[]) => { const response = await api.put(`/chat/sessions/${args[0]}`, args[1]); return response.data; },

  infer: async (...args: any[]) => {
    const response = await api.post('/infer', args[0]);
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
    const apiUrl = import.meta.env.VITE_API_URL || '/api';
    const response = await fetch(`${apiUrl}/infer/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken() || ''}`
      },
      body: JSON.stringify(data),
      signal: data?.signal,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || `Inference failed (${response.status})`);
    }
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (reader) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split('\n');
      buffer = done ? '' : (lines.pop() || '');
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          let parsed: any;
          try {
            parsed = JSON.parse(line.slice(6));
          } catch { continue; }
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.stage && typeof data?.onProgressInfo === 'function') data.onProgressInfo(parsed);
          if (parsed.is_final && typeof data?.onFinalInfo === 'function') data.onFinalInfo(parsed);
          const text = parsed.response ?? parsed.text;
          if (typeof text === 'string' && text && onChunkCallback) onChunkCallback(text);
        }
      }
      if (done) break;
    }
  },

  getInferenceLogs: async (...args: any[]) => { const response = await api.get('/infer/logs', { params: { instanceId: args[0] } }); return response.data; },
  stopInference: async (...args: any[]) => { const response = await api.post(`/infer/stop/${args[0]}`); return response.data; },
  loadModel: async (...args: any[]) => { const response = await api.post('/model/load', { hf_model_id: args[0], ...args[1] }); return response.data; },
  unloadModel: async (...args: any[]) => { const response = await api.post(`/model/unload/${args[0]}`); return response.data; },
  validateModel: async (model: string, provider: string) => { const response = await api.post('/chat/validate-model', { model, provider }); return response.data; },
  listModelRegistries: async (...args: any[]) => { const response = await api.get('/model-registry'); return response.data; },
  getActiveRegistryModel: async (...args: any[]) => { const response = await api.get('/model-registry/active'); return response.data; },
  getEvaluationsByJob: async (...args: any[]) => { const response = await api.get(`/model-versions/evaluations/${args[0]}`); return response.data; },
  registerModelVersion: async (...args: any[]) => { const response = await api.post('/model-versions', args[0]); return response.data; },
  getDatasetPrompts: async (...args: any[]) => { const response = await api.get('/dataset-prompts'); return response.data; },

  // Generic POST helper for dynamic endpoints
  post: async (url: string, data?: any): Promise<any> => {
    const response = await api.post(url, data);
    return response.data;
  },

  // Staff workload API — available-staff with sample-level metrics
  getAvailableStaff: async (): Promise<{
    success: boolean;
    data: Array<{
      id: string;
      name: string;
      email: string;
      pendingTasks: number;
      totalAssigned: number;
      labeledSoFar: number;
      remainingSamples: number;
    }>;
  }> => {
    const response = await api.get('/dataprep/assignments/available-staff');
    return response.data;
  },

  createDatasetPrompt: async (payload: { name: string; content: string; description?: string; isPublic?: boolean }): Promise<any> => {
    const response = await api.post('/dataset-prompts', payload);
    return response.data;
  },

  safeSplit: async (payload: {
    data: any[];
    test_percentage?: number;
    validation_percentage?: number;
    stratify_by_subject?: boolean;
    threshold?: number;
    max_attempts?: number;
    seed?: number;
  }): Promise<any> => {
    const response = await api.post('/cluster/safe-split', payload);
    return response.data;
  },

  pushToHuggingFace: async (payload: {
    token: string;
    repoId: string;
    fileName: string;
    content: string;
    isPrivate?: boolean;
  }): Promise<{ url: string; message: string }> => {
    const response = await api.post('/huggingface/upload', payload);
    return response.data;
  },

  syncToCloud: async (payload: {
    provider: 'gcloud' | 'azure';
    fileName: string;
    content: string;
  }): Promise<{ url: string; message: string }> => {
    const response = await api.post('/cloud-storage/sync', payload);
    return response.data;
  },

  // ==========================================
  // Message-level Labeling API (Phase 1)
  // ==========================================

  /**
   * GET /api/dataprep/samples/:sampleId/labels
   * Lấy tất cả nhãn đã gán cho một sample (cả sample-scope và message-scope).
   */
  getSampleLabels: async (
    sampleId: string,
    params?: {
      scope?: 'sample' | 'message' | 'all';
      messageIndex?: number;
      visibilityMode?: 'default' | 'review';
    }
  ): Promise<{ labels: AggregatedLabel[] }> => {
    try {
      const response = await api.get(`/dataprep/samples/${sampleId}/labels`, { params });
      return response.data;
    } catch (err) {
      console.error('[getSampleLabels] error:', err);
      throw err;
    }
  },

  /**
   * POST /api/dataprep/samples/:sampleId/labels
   * Gán một nhãn vào sample hoặc một message cụ thể.
   */
  addSampleLabel: async (
    sampleId: string,
    payload: {
      name: string;
      type: 'hard' | 'soft';
      targetScope?: 'sample' | 'message';
      messageIndex?: number;
      messageRole?: 'user' | 'assistant';
      targetTextSnapshot?: string;
    }
  ): Promise<{ label: AggregatedLabel | undefined }> => {
    try {
      const response = await api.post(`/dataprep/samples/${sampleId}/labels`, payload);
      return response.data;
    } catch (err) {
      console.error('[addSampleLabel] error:', err);
      throw err;
    }
  },

  /**
   * DELETE /api/dataprep/samples/:sampleId/labels
   * Hủy một nhãn đã gán vào sample hoặc message.
   */
  removeSampleLabel: async (
    sampleId: string,
    payload: {
      name: string;
      type: 'hard' | 'soft';
      targetScope?: 'sample' | 'message';
      messageIndex?: number;
      messageRole?: 'user' | 'assistant';
    }
  ): Promise<{ removed: boolean; name: string }> => {
    try {
      const response = await api.delete(`/dataprep/samples/${sampleId}/labels`, { data: payload });
      return response.data;
    } catch (err) {
      console.error('[removeSampleLabel] error:', err);
      throw err;
    }
  },

  /**
   * POST /api/dataprep/samples/:sampleId/message-auto-label/preview
   * Gọi AI preview nhãn cho từng message của một sample.
   */
  previewMessageAutoLabels: async (
    sampleId: string,
    payload: {
      provider?: 'openrouter' | 'groq' | 'deepseek';
      messages: Array<{ messageIndex: number; role: 'user' | 'assistant'; content: string }>;
    }
  ): Promise<{ suggestions: MessageAutoLabelSuggestion[] }> => {
    try {
      const response = await api.post(
        `/dataprep/samples/${sampleId}/message-auto-label/preview`,
        payload
      );
      return response.data;
    } catch (err) {
      console.error('[previewMessageAutoLabels] error:', err);
      throw err;
    }
  },

  /**
   * POST /api/dataprep/samples/:sampleId/message-auto-label/save
   * Lưu kết quả AI gán nhãn cho từng message vào DB.
   */
  saveMessageAutoLabels: async (
    sampleId: string,
    payload: {
      suggestions: Array<{
        messageIndex: number;
        role: 'user' | 'assistant';
        label: string[] | string;
        confidence?: number;
        is_correct_logic?: boolean;
      }>;
      messages: Array<{ messageIndex: number; role: 'user' | 'assistant'; content: string }>;
    }
  ): Promise<{ message: string; insertedCount: number }> => {
    try {
      const response = await api.post(
        `/dataprep/samples/${sampleId}/message-auto-label/save`,
        payload
      );
      return response.data;
    } catch (err) {
      console.error('[saveMessageAutoLabels] error:', err);
      throw err;
    }
  },

  /**
   * POST /api/dataprep/message-auto-label/batch
   * Chạy AI gán nhãn hàng loạt cho nhiều sample cùng lúc (preview + save trong một lần).
   */
  previewAndSaveMessageAutoLabelsBatch: async (payload: {
    provider?: 'openrouter' | 'groq' | 'deepseek' | 'oauth_gateway' | 'openai' | 'gemini';
    samples: Array<{
      sampleId: string;
      messages: Array<{ messageIndex: number; role: 'user' | 'assistant'; content: string }>;
    }>;
    concurrency?: number;
  }): Promise<{
    processedCount: number;
    successCount: number;
    failureCount: number;
    insertedCount: number;
    results: Array<{
      sampleId: string;
      status: 'success' | 'failed' | 'skipped';
      insertedCount: number;
      suggestionCount: number;
      error?: string;
    }>;
  }> => {
    try {
      const response = await api.post('/dataprep/message-auto-label/batch', payload);
      return response.data;
    } catch (err) {
      console.error('[previewAndSaveMessageAutoLabelsBatch] error:', err);
      throw err;
    }
  },

  getEvaluatedModels: async (): Promise<any[]> => {
    const response = await api.get('/model-eval/leaderboard');
    return response.data;
  },
  getEvaluationDetail: async (evalId: string): Promise<any> => {
    const response = await api.get(`/model-eval/${evalId}`, { timeout: 30000 });
    return response.data;
  },
  exportEvaluationArtifact: async (evalId: string): Promise<Blob> => {
    const response = await api.get(`/model-eval/${evalId}/export`, { responseType: 'blob' });
    return response.data;
  },
  getLargeLlmReferenceModels: async (): Promise<any> => {
    const response = await api.get('/model-eval/large-llm/models');
    return response.data;
  },
  runLargeLlmReference: async (evalId: string, model: string, file: File): Promise<any> => {
    const formData = new FormData();
    formData.append('model', model);
    formData.append('eval_file', file);
    const response = await api.post(`/model-eval/${evalId}/large-llm/run`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  getLargeLlmReferenceStatus: async (referenceJobId: string): Promise<any> => {
    const response = await api.get(`/model-eval/large-llm/status/${referenceJobId}`);
    return response.data;
  },
  runVersion1SharedReference: async (evalId: string, trainingJobId: string, file: File): Promise<any> => {
    const formData = new FormData();
    formData.append('training_job_id', trainingJobId);
    formData.append('eval_file', file);
    const response = await api.post(`/model-eval/${evalId}/version1-shared/run`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  getVersion1SharedReferenceStatus: async (referenceJobId: string): Promise<any> => {
    const response = await api.get(`/model-eval/version1-shared/status/${referenceJobId}`);
    return response.data;
  },
  runEvaluation: async (jobId: string, file: File, options: { judgeModel?: string; baseModelHfRepo?: string }): Promise<any> => {
    const formData = new FormData();
    formData.append('eval_file', file);
    if (options.judgeModel) formData.append('judge_model', options.judgeModel);
    if (options.baseModelHfRepo) formData.append('base_model_hf_repo', options.baseModelHfRepo);
    const response = await api.post(`/model-eval/run/${jobId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
  resumeEvaluation: async (evalJobId: string): Promise<any> => {
    const response = await api.post(`/model-eval/resume/${encodeURIComponent(evalJobId)}`);
    return response.data;
  },
  getEvalHistory: async (jobId: string): Promise<any> => {
    const response = await api.get(`/model-eval/history/${jobId}`);
    return response.data;
  },
  pinEvaluation: async (evalId: string): Promise<any> => {
    const response = await api.post(`/model-eval/pin/${evalId}`);
    return response.data;
  },
  unpinEvaluation: async (evalId: string): Promise<any> => {
    const response = await api.delete(`/model-eval/pin/${evalId}`);
    return response.data;
  },
  deleteEvaluation: async (evalId: string): Promise<any> => {
    const response = await api.delete(`/model-eval/${evalId}`);
    return response.data;
  },
  compareEvaluations: async (evalIdA: string, evalIdB: string): Promise<any> => {
    const response = await api.get('/model-eval/compare', {
      params: { a: evalIdA, b: evalIdB },
    });
    return response.data;
  },
  reviewConversation: async (evalId: string, convIndex: number, review: {
    verdict?: 'agree' | 'disagree' | 'skip';
    note?: string;
    reviewer?: string;
    human_scores?: Record<string, number>;
    human_reasons?: Record<string, string>;
  }): Promise<any> => {
    const response = await api.patch(`/model-eval/${evalId}/review/${convIndex}`, review);
    return response.data;
  },
  getMyHumanAuditAssignments: async (): Promise<any[]> => {
    const response = await api.get('/human-audit/my-assignments');
    return response.data;
  },
  getMyHumanAuditWork: async (evalId: string): Promise<any> => {
    const response = await api.get(`/human-audit/work/${evalId}`);
    return response.data;
  },
  saveMyHumanAuditReview: async (evalId: string, convIndex: number, review: {
    verdict?: 'skip';
    note?: string;
    human_scores?: Record<string, number>;
    human_reasons?: Record<string, string>;
  }): Promise<any> => {
    const response = await api.put(`/human-audit/work/${evalId}/review/${convIndex}`, review);
    return response.data;
  },
  getHumanAuditStaff: async (): Promise<any[]> => {
    const response = await api.get('/human-audit/manage/staff');
    return response.data;
  },
  getHumanAuditCheckers: async (): Promise<any[]> => {
    const response = await api.get('/human-audit/manage/checkers');
    return response.data;
  },
  getManagedHumanAudits: async (): Promise<any[]> => {
    const response = await api.get('/human-audit/manage/evaluations');
    return response.data;
  },
  assignHumanAudit: async (payload: { model_eval_id: string; staff_ids: string[]; checker_id: string; conv_indexes?: number[] }): Promise<any> => {
    const response = await api.post('/human-audit/manage/assign', payload);
    return response.data;
  },
  getManagedHumanAuditDetail: async (evalId: string): Promise<any> => {
    const response = await api.get(`/human-audit/manage/${evalId}`);
    return response.data;
  },
  adjudicateHumanAudit: async (evalId: string, convIndex: number, payload: {
    resolution: 'accept_ai' | 'accept_staff' | 'manual';
    selected_review_id?: string;
    final_scores?: Record<string, number>;
    final_reasons?: Record<string, string>;
    note: string;
  }): Promise<any> => {
    const response = await api.post(`/human-audit/manage/${evalId}/adjudicate/${convIndex}`, payload);
    return response.data;
  },
};
