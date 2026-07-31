import { Request, Response } from 'express';
import dotenv from 'dotenv';
import { GpuClient } from '../modules/dataprep/gpu/gpuClient';
import { configService } from '../services/configService';
dotenv.config();

const getGpuUrl = () => configService.getGpuUrl();
const getGpuClient = () => new GpuClient(getGpuUrl());

type SafeSplitItem = Record<string, any>;

const normalizeSubject = (value: unknown): string => {
  const normalized = String(value || 'UNGROUPED').trim().toUpperCase();
  return normalized || 'UNGROUPED';
};

const materializeSplit = (payload: any, source: SafeSplitItem[]) => {
  if (Array.isArray(payload?.trainIndices) && Array.isArray(payload?.testIndices)) {
    return {
      train: payload.trainIndices.map((index: number) => source[index]).filter(Boolean),
      test: payload.testIndices.map((index: number) => source[index]).filter(Boolean),
    };
  }
  if (Array.isArray(payload?.train) && Array.isArray(payload?.test)) {
    return { train: payload.train, test: payload.test };
  }
  throw new Error('GPU safe-split response does not contain valid train/test partitions');
};

const ensureResolved = (payload: any, subject: string, pair: string) => {
  const conflicts = Number(payload?.conflictCount ?? payload?.conflicts ?? 0);
  if (payload?.resolved === false || conflicts > 0) {
    console.warn(
      `[Warning] Semantic leakage remains for subject ${subject} (${pair}): ${conflicts} conflict(s)`
    );
  }
};

/**
 * POST /api/cluster
 *
 * Nhận dữ liệu OpenAI Messages đã convert, forward tới Python K-means
 * service trên Colab (dùng chung GPU_SERVICE_URL).
 *
 * Request body: { data: Array<{ messages: Array<{ role, content }> }> }
 * Response:     forwarded trực tiếp từ Python service
 */
export const clusterData = async (req: Request, res: Response) => {
  try {
    const { data } = req.body;

    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: 'Missing or empty data array' });
    }

    // Check if the data is in Alpaca format (e.g., has an 'instruction' property)
    // or if it's the first element of OpenAI (which would be { messages: [...] })
    const isAlpaca = data[0] && 'instruction' in data[0];

    if (isAlpaca) {
      console.log(`[Backend] Sequential Clustering for Alpaca format (${data.length} items)`);
      
      const sessionLabels = ['Toán', 'Lý', 'Hóa', 'Văn', 'Sinh'];
      const assignments = data.map((_, index) => index % 5);
      
      const groupCounts = new Array(5).fill(0);
      assignments.forEach(id => groupCounts[id]++);
      
      const groups = sessionLabels.map((label, i) => ({
        groupId: i,
        count: groupCounts[i],
        label: label
      }));

      const augmentedData = data.map((item: any, index: number) => ({
        ...item,
        cluster: assignments[index]
      }));

      return res.json({
        data: augmentedData,
        assignments,
        groups
      });
    }

    // Existing logic for OpenAI format (calling external service)
    const { k, eps, min_samples } = req.body;
    console.log(`[Backend] Clustering ${data.length} conversations (K=${k ?? 'auto'}, eps=${eps ?? 'auto'}, min_samples=${min_samples ?? 'auto'}) → ${getGpuUrl()}/api/cluster`);

    const gpuResponse = await getGpuClient().cluster({ data, k, eps, min_samples });
    console.log(`[Backend] Cluster response (${gpuResponse.status}): ${JSON.stringify(gpuResponse.data).slice(0, 300)}`);

    return res.status(gpuResponse.status).json(gpuResponse.data);
  } catch (err: any) {
    console.error('[Backend] clusterData error:', err);
    if (String(err?.message || '').includes('non-JSON')) {
      return res.status(502).json({ error: err.message });
    }
    return res.status(500).json({
      error: err.message || 'Failed to cluster data',
    });
  }
};

/**
 * POST /api/cluster/filter
 *
 * Forward request to GPU_SERVICE_URL/api/cluster/filter
 */
export const clusterFilter = async (req: Request, res: Response) => {
  try {
    const { data, threshold } = req.body;

    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: 'Missing or empty data array' });
    }

    console.log(`[Backend] Filtering ${data.length} items with threshold ${threshold ?? 0.9} → ${getGpuUrl()}/api/cluster/filter`);

    const gpuResponse = await getGpuClient().filter({ data, threshold });
    console.log(`[Backend] Filter response (${gpuResponse.status}): ${JSON.stringify(gpuResponse.data).slice(0, 300)}`);

    return res.status(gpuResponse.status).json(gpuResponse.data);
  } catch (err: any) {
    console.error('[Backend] clusterFilter error:', err);
    if (String(err?.message || '').includes('non-JSON')) {
      return res.status(502).json({ error: err.message });
    }
    return res.status(500).json({
      error: err.message || 'Failed to filter cluster data',
    });
  }
};

/**
 * POST /api/cluster/remove-noise
 */
export const removeNoise = async (_req: Request, res: Response) => {
  try {
    console.log(`[Backend] Removing noise via GPU service cache → ${getGpuUrl()}/api/cluster/remove-noise`);

    const gpuResponse = await getGpuClient().removeNoise();
    return res.status(gpuResponse.status).json(gpuResponse.data);
  } catch (err: any) {
    console.error('[Backend] removeNoise error:', err);
    if (String(err?.message || '').includes('non-JSON')) {
      return res.status(502).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message || 'Failed to remove noise' });
  }
};

/**
 * POST /api/cluster/deduplicate
 */
export const deduplicate = async (req: Request, res: Response) => {
  try {
    const { threshold } = req.body;
    console.log(`[Backend] Deduplicating via GPU service cache with threshold ${threshold ?? 0.9} → ${getGpuUrl()}/api/cluster/deduplicate`);

    const gpuResponse = await getGpuClient().deduplicate({ threshold });
    return res.status(gpuResponse.status).json(gpuResponse.data);
  } catch (err: any) {
    console.error('[Backend] deduplicate error:', err);
    if (String(err?.message || '').includes('non-JSON')) {
      return res.status(502).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message || 'Failed to deduplicate' });
  }
};

/**
 * POST /api/cluster/safe-split
 *
 * Forward request to GPU_SERVICE_URL/api/cluster/safe-split.
 * GPU service owns embedding, semantic conflict detection, and auto re-splitting.
 */
export const safeSplit = async (req: Request, res: Response) => {
  try {
    const {
      data,
      test_percentage = 10,
      validation_percentage = 10,
      stratify_by_subject = false,
      threshold = 0.85,
      max_attempts = 20,
      seed = 42,
    } = req.body;

    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: 'Missing or empty data array' });
    }

    const testPct = Number(test_percentage);
    const validationPct = Number(validation_percentage);
    if (testPct < 0 || validationPct < 0 || testPct + validationPct >= 100) {
      return res.status(400).json({ error: 'Train/validation/test percentages are invalid' });
    }

    console.log(
      `[Backend] Safe split ${data.length} items (test=${testPct}%, validation=${validationPct}%, stratified=${Boolean(stratify_by_subject)}, threshold=${threshold}, seed=${seed}) → ${getGpuUrl()}/api/cluster/safe-split`
    );

    // V2 research path: split each verified subject independently. The first
    // split protects development-vs-test; the second protects train-vs-validation.
    // Together they prevent cross-partition leakage while preserving subject ratios.
    if (stratify_by_subject) {
      const groups = new Map<string, SafeSplitItem[]>();
      data.forEach((item: SafeSplitItem) => {
        const subject = normalizeSubject(item.subject);
        groups.set(subject, [...(groups.get(subject) || []), item]);
      });

      const combined = { train: [] as SafeSplitItem[], val: [] as SafeSplitItem[], test: [] as SafeSplitItem[] };
      const subjectDistribution: Array<Record<string, any>> = [];
      const overlapInfo: Array<Record<string, any>> = [];
      let attempts = 0;
      let maxSimilarity = 0;

      for (const [subject, subjectData] of groups.entries()) {
        if (subjectData.length < 3) {
          return res.status(400).json({
            error: `Subject ${subject} needs at least 3 samples for train/validation/test split`,
          });
        }

        const outer = await getGpuClient().safeSplit({
          data: subjectData,
          test_percentage: testPct,
          threshold,
          max_attempts,
          seed,
        });
        if (outer.status < 200 || outer.status >= 300) {
          return res.status(outer.status).json(outer.data);
        }
        ensureResolved(outer.data, subject, 'development-test');
        const developmentTest = materializeSplit(outer.data, subjectData);

        const remainingPct = 100 - testPct;
        const validationWithinDevelopment = remainingPct > 0
          ? (validationPct / remainingPct) * 100
          : 0;
        const inner = await getGpuClient().safeSplit({
          data: developmentTest.train,
          test_percentage: validationWithinDevelopment,
          threshold,
          max_attempts,
          seed: Number(seed) + 1009,
        });
        if (inner.status < 200 || inner.status >= 300) {
          return res.status(inner.status).json(inner.data);
        }
        ensureResolved(inner.data, subject, 'train-validation');
        const trainValidation = materializeSplit(inner.data, developmentTest.train);

        combined.train.push(...trainValidation.train);
        combined.val.push(...trainValidation.test);
        combined.test.push(...developmentTest.test);
        subjectDistribution.push({
          subject,
          train: trainValidation.train.length,
          val: trainValidation.test.length,
          test: developmentTest.test.length,
          total: subjectData.length,
        });
        attempts += Number(outer.data?.attempts || 0) + Number(inner.data?.attempts || 0);
        maxSimilarity = Math.max(
          maxSimilarity,
          Number(outer.data?.maxCrossSplitSimilarity || 0),
          Number(inner.data?.maxCrossSplitSimilarity || 0),
        );
        overlapInfo.push(
          ...(outer.data?.conflictsPreview || []).map((row: any) => ({ ...row, subject, partition_pair: 'development-test' })),
          ...(inner.data?.conflictsPreview || []).map((row: any) => ({ ...row, subject, partition_pair: 'train-validation' })),
        );
      }

      return res.json({
        resolved: true,
        split_strategy: 'subject-stratified-two-stage-semantic-guard',
        seed: Number(seed),
        threshold: Number(threshold),
        train: combined.train,
        val: combined.val,
        test: combined.test,
        train_count: combined.train.length,
        val_count: combined.val.length,
        test_count: combined.test.length,
        conflicts: 0,
        max_similarity: Number(maxSimilarity.toFixed(6)),
        attempts,
        subject_distribution: subjectDistribution,
        overlap_info: overlapInfo,
      });
    }

    const gpuResponse = await getGpuClient().safeSplit({
      data,
      test_percentage: testPct,
      threshold,
      max_attempts,
      seed,
    });

    console.log(
      `[Backend] Safe split response (${gpuResponse.status}): ${JSON.stringify(gpuResponse.data).slice(0, 300)}`
    );

    return res.status(gpuResponse.status).json(gpuResponse.data);
  } catch (err: any) {
    console.error('[Backend] safeSplit error:', err);
    if (String(err?.message || '').includes('non-JSON')) {
      return res.status(502).json({ error: err.message });
    }
    return res.status(err?.status || 500).json({
      error: err.message || 'Failed to generate safe split',
      details: err?.details,
    });
  }
};

/**
 * DELETE /api/cluster/cache
 *
 * Forward request to GPU_SERVICE_URL/api/cluster/cache to clear embedding cache
 */
export const deleteClusterCache = async (_req: Request, res: Response) => {
  try {
    console.log(`[Backend] Clearing Cluster Cache → ${getGpuUrl()}/api/cluster/cache`);

    const gpuResponse = await getGpuClient().clearCache();
    console.log(`[Backend] Cache Clear response (${gpuResponse.status}): ${JSON.stringify(gpuResponse.data)}`);

    return res.status(gpuResponse.status).json(gpuResponse.data);
  } catch (err: any) {
    console.error('[Backend] deleteClusterCache error:', err);
    if (String(err?.message || '').includes('non-JSON')) {
      return res.status(502).json({ error: err.message });
    }
    return res.status(500).json({
      error: err.message || 'Failed to clear cluster cache',
    });
  }
};

/**
 * POST /api/cluster/visualize
 *
 * Forward dataset to GPU Service for Elbow & K-Distance computation.
 * Uses SentenceTransformer embeddings + DBSCAN noise filtering + K-Means on Colab.
 *
 * Request body: { data: Array, max_k?: number }
 * Response:     { elbow: [{k, wcss}], kDistance: [{rank, distance}], pointCount, noiseCount }
 */
export const clusterVisualize = async (req: Request, res: Response) => {
  try {
    const { data, max_k = 20, eps = 0.15, min_samples = 6 } = req.body;

    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: 'Missing or empty data array' });
    }

    console.log(
      `[Backend] Visualize ${data.length} items (max_k=${max_k}, eps=${eps}, min_samples=${min_samples}) → ${getGpuUrl()}/api/cluster/visualize`
    );

    const gpuResponse = await getGpuClient().visualize({ data, max_k, eps, min_samples });
    console.log(
      `[Backend] Visualize response (${gpuResponse.status}): ${JSON.stringify(gpuResponse.data).slice(0, 300)}`
    );

    return res.status(gpuResponse.status).json(gpuResponse.data);
  } catch (err: any) {
    console.error('[Backend] clusterVisualize error:', err);
    if (String(err?.message || '').includes('non-JSON')) {
      return res.status(502).json({ error: err.message });
    }
    return res.status(500).json({
      error: err.message || 'Failed to compute visualization data',
    });
  }
};
