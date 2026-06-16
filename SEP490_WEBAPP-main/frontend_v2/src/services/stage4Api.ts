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
      value: number;
      matched: boolean;
      harmfulActions: string[];
    }>;
  }>;
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
  getQualitySamples: async (versionId: string, group?: string): Promise<QualityResult> => {
    const res = await api.get(`/dataprep/versions/${versionId}/quality`, { params: { group } });
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
  runMultiEval: async (versionId: string, models: string[], contextWindow: string): Promise<{ message: string; job: MultiEvalJob }> => {
    const res = await api.post(`/dataprep/versions/${versionId}/multi-eval/run`, { models, contextWindow });
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
};
