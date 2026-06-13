import { useState, useEffect, useRef, useCallback } from 'react';
import {
  stage4Api,
  QualityBucket,
  LabelingStatus,
  QualityResult,
  QualityStatistics,
  MultiEvalJob,
  MultiEvalResult,
} from '../services/stage4Api';

export function useStage4Data(versionId: string | null) {
  const [labelingStatus, setLabelingStatus] = useState<LabelingStatus | null>(null);
  const [qualityResult, setQualityResult] = useState<QualityResult | null>(null);
  const [statistics, setStatistics] = useState<QualityStatistics | null>(null);
  const [results, setResults] = useState<MultiEvalResult[]>([]);
  const [latestJob, setLatestJob] = useState<MultiEvalJob | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const pollIntervalRef = useRef<any | null>(null);

  // Clear polling interval
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Fetch status-latest and handle state
  const fetchLatestJob = useCallback(async (vId: string) => {
    try {
      const job = await stage4Api.getLatestJob(vId);
      setLatestJob(job || null);
      return job;
    } catch (err: any) {
      console.error('Failed to fetch latest job:', err);
      return null;
    }
  }, []);

  // Fetch all Stage 4 data
  const fetchAllData = useCallback(async (vId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const [statusData, statsData, qualityData, jobData] = await Promise.all([
        stage4Api.getLabelingStatus(vId).catch(() => null),
        stage4Api.getStatistics(vId).catch(() => null),
        stage4Api.getQualitySamples(vId).catch(() => null),
        stage4Api.getLatestJob(vId).catch(() => null),
      ]);

      setLabelingStatus(statusData);
      setStatistics(statsData);
      setQualityResult(qualityData);
      setLatestJob(jobData);

      if (qualityData && qualityData.items && qualityData.items.length > 0) {
        // Also fetch multi eval results
        const evalResults = await stage4Api.getMultiEvalResults(vId).catch(() => []);
        setResults(evalResults);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to load Stage 4 data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Polling check logic
  const checkJobStatus = useCallback(async (vId: string, jobId: string) => {
    try {
      const job = await stage4Api.getJobStatus(vId, jobId);
      setLatestJob(job);

      if (job.status === 'completed' || job.status === 'failed') {
        stopPolling();
        // Refresh statistics and results
        const [statsData, qualityData, evalResults] = await Promise.all([
          stage4Api.getStatistics(vId).catch(() => null),
          stage4Api.getQualitySamples(vId).catch(() => null),
          stage4Api.getMultiEvalResults(vId).catch(() => []),
        ]);
        setStatistics(statsData);
        setQualityResult(qualityData);
        setResults(evalResults);
      }
    } catch (err) {
      console.error('Error polling job status:', err);
    }
  }, [stopPolling]);

  // Start polling job status
  const startPolling = useCallback((vId: string, jobId: string) => {
    stopPolling();
    pollIntervalRef.current = setInterval(() => {
      checkJobStatus(vId, jobId);
    }, 3000);
  }, [checkJobStatus, stopPolling]);

  // Handle auto-polling configuration based on latest job status
  useEffect(() => {
    if (versionId && latestJob && (latestJob.status === 'running' || latestJob.status === 'pending')) {
      startPolling(versionId, latestJob._id);
    } else {
      stopPolling();
    }
    return () => stopPolling();
  }, [versionId, latestJob, startPolling, stopPolling]);

  // Trigger loading when version changes
  useEffect(() => {
    if (versionId) {
      fetchAllData(versionId);
    } else {
      setLabelingStatus(null);
      setQualityResult(null);
      setStatistics(null);
      setResults([]);
      setLatestJob(null);
      setError(null);
      stopPolling();
    }
    return () => stopPolling();
  }, [versionId, fetchAllData, stopPolling]);

  // --- ACTIONS ---

  const updateIncompleteBucket = async (bucket: QualityBucket | null) => {
    if (!versionId) return;
    try {
      await stage4Api.updateIncompleteBucket(versionId, bucket);
      // Refresh labeling status
      const statusData = await stage4Api.getLabelingStatus(versionId);
      setLabelingStatus(statusData);
    } catch (err: any) {
      throw new Error(err.response?.data?.error || err.message || 'Failed to update incomplete bucket');
    }
  };

  const runMultiEval = async (models: string[], contextWindow: string) => {
    if (!versionId) return;
    try {
      const response = await stage4Api.runMultiEval(versionId, models, contextWindow);
      setLatestJob(response.job);
      if (response.job && response.job._id) {
        startPolling(versionId, response.job._id);
      }
      return response.job;
    } catch (err: any) {
      throw new Error(err.response?.data?.error || err.message || 'Failed to run evaluation job');
    }
  };

  const submitReview = async (payload: {
    sampleId: string;
    qualityClassification: 'Gold' | 'Rewrite' | 'Bad';
    ratings: Record<string, number>;
    errors: string[];
    note?: string;
  }) => {
    if (!versionId) return;
    try {
      const result = await stage4Api.submitReview(versionId, payload);
      // Refresh samples and stats
      const [qualityData, statsData] = await Promise.all([
        stage4Api.getQualitySamples(versionId),
        stage4Api.getStatistics(versionId),
      ]);
      setQualityResult(qualityData);
      setStatistics(statsData);
      return result;
    } catch (err: any) {
      throw new Error(err.response?.data?.error || err.message || 'Failed to submit review');
    }
  };

  const adjudicateQuality = async (payload: {
    sampleId: string;
    finalClassification: QualityBucket;
    note?: string;
  }) => {
    if (!versionId) return;
    try {
      await stage4Api.adjudicateQuality(versionId, payload);
      // Refresh samples and stats
      const [qualityData, statsData] = await Promise.all([
        stage4Api.getQualitySamples(versionId),
        stage4Api.getStatistics(versionId),
      ]);
      setQualityResult(qualityData);
      setStatistics(statsData);
    } catch (err: any) {
      throw new Error(err.response?.data?.error || err.message || 'Failed to adjudicate quality');
    }
  };

  const adjudicateMultiEvalResult = async (
    resultId: string,
    action: 'approve' | 'rewrite' | 'reevaluate' | 'reject',
    note?: string
  ) => {
    if (!versionId) return;
    try {
      await stage4Api.adjudicateMultiEvalResult(versionId, resultId, action, note);
      // Refresh results and statistics
      const [evalResults, statsData] = await Promise.all([
        stage4Api.getMultiEvalResults(versionId),
        stage4Api.getStatistics(versionId),
      ]);
      setResults(evalResults);
      setStatistics(statsData);
    } catch (err: any) {
      throw new Error(err.response?.data?.error || err.message || 'Failed to adjudicate evaluation result');
    }
  };

  const refreshData = async () => {
    if (versionId) {
      await fetchAllData(versionId);
    }
  };

  return {
    labelingStatus,
    qualityResult,
    statistics,
    results,
    latestJob,
    isLoading,
    error,
    updateIncompleteBucket,
    runMultiEval,
    submitReview,
    adjudicateQuality,
    adjudicateMultiEvalResult,
    refreshData,
  };
}
