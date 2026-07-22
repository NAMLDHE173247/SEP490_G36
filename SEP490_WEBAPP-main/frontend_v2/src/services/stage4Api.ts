import { api } from './api';

// --- TYPES ---

export type QualityBucket = 'Gold' | 'Rewrite' | 'Reject' | 'Incomplete';

export interface LabelingStatus {
  totalSamples: number;
  labeledSamples: number;
  unlabeledSamples: number;
  incompleteBucket: QualityBucket | null;
}

export interface QualitySummaryGroup {
  group: QualityBucket;
  count: number;
  percentage: number;
}

export interface QualityWrongPair {
  intent: string;
  action: string;
  count: number;
  criticalFailures: number;
}

export interface QualityItem {
  _id: string;
  sampleId: string;
  bucket: QualityBucket;
  score: number;
  humanScore?: number | null;
  vector: number[];
  intentCounts: number[];
  iar: Array<number | null>;
  criticalFailures: number;
  scorableTurns: number;
  reviewStatus?: 'pending' | 'reviewed' | 'conflict';
  reviewCount?: number;
  conflict?: boolean;
  note?: string;
  adjudicatedBy?: string;
  adjudicatedAt?: string;
  data: {
    messages: Array<{
      role: 'user' | 'assistant';
      content: string;
    }>;
  };
  turnPairs: Array<{
    userMessageIndex: number;
    assistantMessageIndex: number;
    user: string;
    assistant: string;
    userLabels: string[];
    assistantLabels: string[];
    expectedActions: string[];
    matched: boolean;
    turnScore: number;
    intentScores: Array<{
      intent: string;
      score: number;
      harmfulActions: string[];
    }>;
  }>;
  [key: string]: any;
}

export interface QualityResult {
  summary: {
    totalSamples: number;
    classifiedSamples: number;
    skippedSamples: number;
    groups: QualitySummaryGroup[];
    wrongPairs: QualityWrongPair[];
    rejectTaggedCount?: number;
  };
  totalSamples: number;
  classifiedSamples: number;
  skippedSamples: number;
  groups: QualitySummaryGroup[];
  wrongPairs: QualityWrongPair[];
  rejectTaggedCount?: number;
  items: QualityItem[];
}

export interface QualityReview {
  _id: string;
  datasetVersionId: string;
  sampleId: string;
  reviewerId: string;
  qualityClassification: 'Gold' | 'Rewrite' | 'Bad';
  ratings: Record<string, number>;
  errors: string[];
  note?: string;
  createdAt: string;
}

export interface QualityStatistics {
  summary?: {
    totalSamples: number;
    classifiedCount: number;
    pendingCount: number;
    conflictCount: number;
    distribution: Record<QualityBucket, number>;
  };
  totalSamples?: number;
  reviewedSamples?: number;
  conflictCount?: number;
  totalMessages?: number;
  qualityDistribution?: Array<{
    group: QualityBucket | 'Bad';
    count: number;
    messageCount?: number;
    percentage: number;
  }>;
  reviewerStats?: Array<{
    name: string;
    count: number;
  }>;
  bySubject?: Array<{
    subject: string;
    total: number;
    gold: number;
    rewrite: number;
    reject: number;
    incomplete: number;
  }>;
  commonErrors?: Array<{
    error: string;
    count: number;
  }>;
}

export interface MultiEvalJob {
  _id: string;
  datasetVersionId: string;
  supervisorId: string;
  models: string[];
  contextWindow: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: {
    total: number;
    evaluated: number;
    processing?: number;
    failed?: number;
    conflictCount?: number;
    refinedCount?: number;
  };
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
}

export interface MultiEvalResult {
  _id: string;
  datasetVersionId: string;
  sampleId: string;
  sampleIdRef: {
    _id: string;
    sampleId: string;
    data: {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    };
  };
  subject: string;
  scores: Record<string, number>;
  modelScores?: Record<string, { overall?: number; recommendation?: string; reason?: string }>;
  averageScore: number;
  averageOverall?: number;
  diff: number;
  recommendation: 'Gold' | 'Rewrite' | 'Reject' | 'Conflict';
  finalRecommendation?: 'Pass' | 'Need Rewrite' | 'Reject';
  hasConflict?: boolean;
  resolved: boolean;
  adjudicationAction?: 'approve' | 'rewrite' | 'reevaluate' | 'reject';
  adjudicationNote?: string;
  adjudicatedBy?: string;
  adjudicatedAt?: string;
  [key: string]: any;
}

// --- API CLIENT ---

export const stage4Api = {
  // 1. Labeling Status
  getLabelingStatus: async (versionId: string): Promise<LabelingStatus> => {
    const res = await api.get(`/dataprep/versions/${versionId}/quality/labeling-status`);
    return res.data;
  },

  // 2. Update Incomplete Bucket
  updateIncompleteBucket: async (versionId: string, bucket: QualityBucket | null): Promise<any> => {
    const res = await api.patch(`/dataprep/versions/${versionId}/quality/incomplete-bucket`, { bucket });
    return res.data;
  },

  // 3. Classify Quality (runs AI judge / scoring rules)
  classifyQuality: async (versionId: string): Promise<QualityResult> => {
    const res = await api.post(`/dataprep/versions/${versionId}/quality/classify`);
    return res.data;
  },

  // 4. Get Quality Samples
  getQualitySamples: async (versionId: string, group?: string, page?: number, limit?: number): Promise<QualityResult & { pagination?: { page: number; limit: number; totalItems: number; totalPages: number } }> => {
    const res = await api.get(`/dataprep/versions/${versionId}/quality`, { params: { group, page, limit } });
    return res.data;
  },

  autoBypassRewrite: async (versionId: string, limit = 20): Promise<{ processedCount: number; failedCount: number; failures: Array<{ taskId: string; error: string }> }> => {
    const res = await api.post(`/dataprep/versions/${versionId}/quality/rewrite-assignments/auto-bypass`, { limit });
    return res.data;
  },

  // 5. Submit Quality Review (Human review)
  submitReview: async (
    versionId: string,
    payload: {
      sampleId: string;
      qualityClassification: 'Gold' | 'Rewrite' | 'Bad';
      ratings: Record<string, number>;
      errors: string[];
      note?: string;
    }
  ): Promise<{ message: string; review: QualityReview }> => {
    const res = await api.post(`/dataprep/versions/${versionId}/quality/review`, payload);
    return res.data;
  },

  // 6. Get Sample Reviews
  getSampleReviews: async (versionId: string, sampleId: string): Promise<QualityReview[]> => {
    const res = await api.get(`/dataprep/versions/${versionId}/quality/reviews/${sampleId}`);
    return res.data;
  },

  // 7. Adjudicate Quality (Supervisor final decision)
  adjudicateQuality: async (
    versionId: string,
    payload: {
      sampleId: string;
      finalClassification: QualityBucket;
      note?: string;
    }
  ): Promise<any> => {
    const res = await api.post(`/dataprep/versions/${versionId}/quality/adjudicate`, payload);
    return res.data;
  },

  // 8. Get Statistics (Distribution, subjects, etc.)
  getStatistics: async (versionId: string): Promise<QualityStatistics> => {
    const res = await api.get(`/dataprep/versions/${versionId}/quality/statistics`);
    return res.data;
  },

  // 9. Run Multi-Model Eval Job
  runMultiEval: async (versionId: string, models: string[], contextWindow: string, conflictThreshold?: number): Promise<{ message: string; job: MultiEvalJob }> => {
    const res = await api.post(`/dataprep/versions/${versionId}/multi-eval/run`, { models, contextWindow, conflictThreshold });
    return res.data;
  },

  // 10. Get Multi-Eval Job Status
  getJobStatus: async (versionId: string, jobId: string): Promise<MultiEvalJob> => {
    const res = await api.get(`/dataprep/versions/${versionId}/multi-eval/status/${jobId}`);
    return res.data;
  },

  // 11. Get Latest Multi-Eval Job
  getLatestJob: async (versionId: string): Promise<MultiEvalJob> => {
    const res = await api.get(`/dataprep/versions/${versionId}/multi-eval/status-latest`);
    return res.data;
  },

  // 12. Get Multi-Eval Results
  getMultiEvalResults: async (
    versionId: string,
    filters?: {
      scoreMin?: number;
      scoreMax?: number;
      conflictOnly?: boolean;
      recommendation?: string;
      subject?: string;
    }
  ): Promise<MultiEvalResult[]> => {
    const res = await api.get(`/dataprep/versions/${versionId}/multi-eval/results`, { params: filters });
    return res.data;
  },

  // 13. Adjudicate Multi-Eval Result
  adjudicateMultiEvalResult: async (
    versionId: string,
    resultId: string,
    action: 'approve' | 'rewrite' | 'reevaluate' | 'reject',
    note?: string
  ): Promise<any> => {
    const res = await api.post(`/dataprep/versions/${versionId}/multi-eval/adjudicate/${resultId}`, { action, note });
    return res.data;
  },

  listRewriteAssignments: async (versionId: string): Promise<{ tasks: any[] }> => {
    const res = await api.get(`/dataprep/versions/${versionId}/quality/rewrite-assignments`);
    return res.data;
  },

  listMyRewriteAssignments: async (): Promise<{ tasks: any[] }> => {
    const res = await api.get('/dataprep/stage4/rewrite-assignments');
    return res.data;
  },

  assignRewrite: async (versionId: string, payload: {
    sampleId: string;
    assigneeId: string;
    checkerId?: string;
    convId: string;
    subject?: string;
    reason?: string;
    originalText?: string;
    targetMessageIndex?: number | null;
    contextMode?: string;
  }): Promise<{ task: any }> => {
    const res = await api.post(`/dataprep/versions/${versionId}/quality/rewrite-assignments`, payload);
    return res.data;
  },

  bulkAssignRewrite: async (versionId: string, assignments: Array<Record<string, any>>): Promise<{ success: boolean; assignedCount: number; requestedCount: number }> => {
    const res = await api.post(`/dataprep/versions/${versionId}/quality/rewrite-assignments/bulk`, { assignments });
    return res.data;
  },

  submitRewrite: async (versionId: string, taskId: string, submittedText: string, expectedUpdatedAt?: string, status?: string): Promise<{ task: any }> => {
    const res = await api.post(`/dataprep/versions/${versionId}/quality/rewrite-assignments/${taskId}/submit`, { submittedText, expectedUpdatedAt, status });
    return res.data;
  },

  adminSubmitRewrite: async (versionId: string, payload: {
    sampleId: string;
    submittedText: string;
    reason?: string;
    targetMessageIndex?: number | null;
  }): Promise<{ task: any }> => {
    const res = await api.post(`/dataprep/versions/${versionId}/quality/rewrite-assignments/admin-submit`, payload);
    return res.data;
  },

  validateRewrite: async (versionId: string, taskId: string, submittedText: string): Promise<{ pass: boolean; message?: string; error?: string; reason?: string }> => {
    const res = await api.post(`/dataprep/versions/${versionId}/quality/rewrite-assignments/${taskId}/validate`, { submittedText });
    return res.data;
  },

  suggestRewrite: async (versionId: string, taskId: string, provider = 'oauth_gateway', model?: string): Promise<{ suggestedText: string }> => {
    const res = await api.post(`/dataprep/versions/${versionId}/quality/rewrite-assignments/${taskId}/suggest`, { provider, model });
    return res.data;
  },

  suggestRewriteGeneric: async (versionId: string, payload: {
    originalText: string;
    targetMessageIndex: number | null;
    messages: any[];
    reason?: string;
  }): Promise<{ suggestedText: string }> => {
    const res = await api.post(`/dataprep/versions/${versionId}/quality/suggest-rewrite-generic`, payload);
    return res.data;
  },

  reviewRewrite: async (
    versionId: string,
    taskId: string,
    action: 'approved' | 'rejected' | 'redo',
    note?: string
  ): Promise<{ task: any }> => {
    const res = await api.post(`/dataprep/versions/${versionId}/quality/rewrite-assignments/${taskId}/review`, { action, note });
    return res.data;
  },

  remindRewrite: async (versionId: string, taskId: string): Promise<any> => {
    const res = await api.post(`/dataprep/versions/${versionId}/quality/rewrite-assignments/${taskId}/remind`);
    return res.data;
  },

  listNotifications: async (versionId: string): Promise<{ notifications: any[] }> => {
    const res = await api.get(`/dataprep/versions/${versionId}/quality/notifications`);
    return res.data;
  },

  listMyNotifications: async (): Promise<{ notifications: any[] }> => {
    const res = await api.get('/dataprep/stage4/notifications');
    return res.data;
  },

  createNotification: async (versionId: string, payload: {
    recipientId?: string;
    recipientRole?: 'admin' | 'supervisor' | 'staff';
    type?: 'info' | 'success' | 'warning';
    message: string;
  }): Promise<any> => {
    const res = await api.post(`/dataprep/versions/${versionId}/quality/notifications`, payload);
    return res.data;
  },

  markNotificationsRead: async (versionId: string): Promise<any> => {
    const res = await api.post(`/dataprep/versions/${versionId}/quality/notifications/read`);
    return res.data;
  },
};
