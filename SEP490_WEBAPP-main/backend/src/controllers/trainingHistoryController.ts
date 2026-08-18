import fs from 'fs';
import { Request, Response } from 'express';
import { getAuthUserId } from '../utils/auth';
import { ModelEvaluation } from '../models/Evaluation';
import { TrainingHistory } from '../models/TrainingHistory';

type EvalStats = { evalCount: number; pinnedOverallPct: number | null };

/** Gắn thêm evalCount + pinnedOverallPct (%) cho danh sách job — dùng chung GET /api/train/history */
async function enrichHistoriesWithEvalStats<T extends { jobId: string; pinnedEvalId?: string | null }>(
  histories: T[],
  ownerId: string
): Promise<Array<T & EvalStats>> {
  if (!histories.length) return histories as Array<T & EvalStats>;

  const jobIds = histories.map((h) => h.jobId);

  const countAgg = await ModelEvaluation.aggregate<{ _id: string; evalCount: number }>([
    { $match: { ownerId, jobId: { $in: jobIds }, status: 'COMPLETED' } },
    { $group: { _id: '$jobId', evalCount: { $sum: 1 } } },
  ]);
  const evalCountByJob = Object.fromEntries(countAgg.map((x) => [x._id, x.evalCount]));

  const pinnedIds = [
    ...new Set(
      histories
        .map((h) => h.pinnedEvalId)
        .filter((id): id is string => !!id)
    ),
  ];

  const pinnedPctByEvalId = new Map<string, number>();
  if (pinnedIds.length) {
    const pinnedEvals = await ModelEvaluation.find({
      ownerId,
      modelEvalId: { $in: pinnedIds },
      status: 'COMPLETED',
    })
      .select('modelEvalId summary')
      .lean();

    for (const e of pinnedEvals) {
      const max = e.summary?.max_possible ?? 5;
      const ft = e.summary?.overall?.ft_avg ?? 0;
      if (max > 0) pinnedPctByEvalId.set(e.modelEvalId, (ft / max) * 100);
    }
  }

  return histories.map((h) => {
    const jobId = h.jobId;
    const evalCount = evalCountByJob[jobId] ?? 0;
    const pinId = h.pinnedEvalId;
    const pinnedOverallPct =
      pinId && pinnedPctByEvalId.has(pinId) ? pinnedPctByEvalId.get(pinId)! : null;

    return { ...h, evalCount, pinnedOverallPct };
  });
}

// ---------------------------------------------------------------------------
// POST /api/train/history
// Lưu kết quả training vào MongoDB sau khi training hoàn tất
// ---------------------------------------------------------------------------
export const saveTrainingHistory = async (req: Request, res: Response) => {
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      jobId,
      projectName,
      baseModel,
      datasetSource,
      datasetName,
      columnMapping,
      parameters,
      pushToHub,
      hfRepoId,
      status,
      finalMetrics,
      lastLogLine,
      trainingDuration,
      startedAt,
      completedAt,
      totalTokens,
      totalRecords,
    } = req.body;

    // Validation
    if (!jobId || !projectName || !baseModel) {
      return res.status(400).json({ error: 'Missing required fields: jobId, projectName, baseModel' });
    }

    // Kiểm tra nếu jobId đã tồn tại thì update, nếu chưa thì tạo mới
    const existing = await TrainingHistory.findOne({ jobId, ownerId });
    if (existing) {
      // Update
      existing.projectName = projectName;
      existing.baseModel = baseModel;
      existing.datasetSource = datasetSource;
      existing.datasetName = datasetName;
      existing.columnMapping = columnMapping;
      existing.parameters = parameters;
      existing.pushToHub = pushToHub ?? false;
      existing.hfRepoId = hfRepoId || '';
      existing.status = status;

      // Only update finalMetrics if the incoming ones are not empty/zero,
      // or if the existing ones are empty. This prevents overwriting with 0s.
      const hasIncomingMetrics = finalMetrics && (finalMetrics.loss > 0 || finalMetrics.accuracy > 0);
      if (hasIncomingMetrics || !existing.finalMetrics || (existing.finalMetrics.loss === 0 && existing.finalMetrics.accuracy === 0)) {
        existing.finalMetrics = {
          loss: finalMetrics?.loss || 0,
          accuracy: finalMetrics?.accuracy || 0,
          vram: finalMetrics?.vram || 0,
          gpu_util: finalMetrics?.gpu_util || 0,
        };
      }

      existing.lastLogLine = lastLogLine;
      existing.trainingDuration = trainingDuration;
      existing.startedAt = new Date(startedAt);
      existing.completedAt = new Date(completedAt);
      if (totalTokens !== undefined) existing.totalTokens = totalTokens;
      if (totalRecords !== undefined) existing.totalRecords = totalRecords;
      await existing.save();

      console.log(`[Backend] Updated training history for job ${jobId}`);
      return res.status(200).json({ message: 'Training history updated', data: existing });
    }

    // Tạo mới
    const history = new TrainingHistory({
      ownerId,
      jobId,
      projectName,
      baseModel,
      datasetSource,
      datasetName,
      columnMapping,
      parameters,
      pushToHub: pushToHub ?? false,
      hfRepoId: hfRepoId ?? '',
      status,
      finalMetrics,
      lastLogLine,
      trainingDuration,
      startedAt: new Date(startedAt),
      completedAt: new Date(completedAt),
      totalTokens: totalTokens || 0,
      totalRecords: totalRecords || 0,
    });

    await history.save();
    console.log(`[Backend] Saved training history for job ${jobId}`);
    return res.status(201).json({ message: 'Training history saved', data: history });
  } catch (err: any) {
    console.error('[Backend] saveTrainingHistory error:', err);
    return res.status(500).json({ error: err.message || 'Failed to save training history' });
  }
};

// ---------------------------------------------------------------------------
// GET /api/train/history
// Lấy tất cả lịch sử training, sắp xếp mới nhất trước
// Hỗ trợ query param ?baseModel=... để lọc theo base model
// ---------------------------------------------------------------------------
export const getTrainingHistoryList = async (req: Request, res: Response) => {
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { baseModel } = req.query;
    const filter: Record<string, any> = { ownerId };

    if (baseModel && typeof baseModel === 'string' && baseModel.trim()) {
      filter.baseModel = baseModel.trim();
    }

    // Loại trainLogs/auditEvents khỏi list — payload lớn; lấy qua /audit khi cần
    const histories = await TrainingHistory.find(filter)
      .select('-trainLogs -auditEvents -effectiveConfig -technicalError -hfToken -metricsHistory')
      .sort({ completedAt: -1 })
      .lean();

    for (const history of histories as any[]) {
      const recovered: Record<string, number> = {};
      if (history.status === 'EVALUATING') {
        history.status = 'COMPLETED';
        TrainingHistory.updateOne({ _id: history._id, ownerId }, { $set: { status: 'COMPLETED' } }).catch(() => undefined);
      }
      if (!history.trainingDuration && history.startedAt && history.completedAt) {
        recovered.trainingDuration = Math.max(0, new Date(history.completedAt).getTime() - new Date(history.startedAt).getTime());
        history.trainingDuration = recovered.trainingDuration;
      }
      // Best-effort async file read — fire-and-forget so it never blocks the response
      if ((!history.totalRecords || !history.totalTokens) && history.datasetPath && fs.existsSync(history.datasetPath)) {
        fs.promises.readFile(history.datasetPath, 'utf8').then((content) => {
          const patch: Record<string, number> = {};
          if (!history.totalTokens) patch.totalTokens = Math.max(1, Math.round(content.length / 4));
          if (!history.totalRecords) {
            try {
              const parsed = JSON.parse(content);
              patch.totalRecords = Array.isArray(parsed) ? parsed.length : 1;
            } catch {
              patch.totalRecords = content.split('\n').filter((line: string) => line.trim()).length;
            }
          }
          if (Object.keys(patch).length > 0) {
            TrainingHistory.updateOne({ _id: history._id, ownerId }, { $set: patch }).catch(() => undefined);
          }
        }).catch(() => undefined);
      }
      if (Object.keys(recovered).length > 0) {
        TrainingHistory.updateOne({ _id: history._id, ownerId }, { $set: recovered }).catch(() => undefined);
      }
    }

    const enriched = await enrichHistoriesWithEvalStats(histories, ownerId);
    return res.status(200).json(enriched);
  } catch (err: any) {
    console.error('[Backend] getTrainingHistoryList error:', err);
    return res.status(500).json({ error: err.message || 'Failed to get training history' });
  }
};

// ---------------------------------------------------------------------------
// GET /api/train/history/models
// Lấy danh sách các base model đã từng train (distinct)
// ---------------------------------------------------------------------------
export const getDistinctBaseModels = async (req: Request, res: Response) => {
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const models = await TrainingHistory.distinct('baseModel', { ownerId });
    return res.status(200).json(models);
  } catch (err: any) {
    console.error('[Backend] getDistinctBaseModels error:', err);
    return res.status(500).json({ error: err.message || 'Failed to get distinct base models' });
  }
};

// ---------------------------------------------------------------------------
// GET /api/train/history/:jobId
// Lấy chi tiết 1 job theo jobId
// ---------------------------------------------------------------------------
export const getTrainingHistoryDetail = async (req: Request, res: Response) => {
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { jobId } = req.params;
    const history = await TrainingHistory.findOne({ jobId, ownerId })
      .select('-hfToken')
      .lean();

    if (!history) {
      return res.status(404).json({ error: 'Training history not found' });
    }

    return res.status(200).json(history);
  } catch (err: any) {
    console.error('[Backend] getTrainingHistoryDetail error:', err);
    return res.status(500).json({ error: err.message || 'Failed to get training history detail' });
  }
};

// ---------------------------------------------------------------------------
// GET /api/train/history/:jobId/audit
// Đọc log + audit event + effective_config từ Mongo (không cần GPU worker)
// ---------------------------------------------------------------------------
export const getTrainingHistoryAudit = async (req: Request, res: Response) => {
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { jobId } = req.params;
    const history = await TrainingHistory.findOne({ jobId, ownerId })
      .select('jobId status lastLogLine lastError technicalError trainLogs auditEvents effectiveConfig metricsHistory progress lastProgressAt updatedAt completedAt')
      .lean();

    if (!history) {
      return res.status(404).json({ error: 'Training history not found' });
    }

    return res.status(200).json({
      jobId: history.jobId,
      status: history.status,
      lastLogLine: history.lastLogLine || '',
      lastError: (history as any).lastError || '',
      technicalError: (history as any).technicalError || '',
      trainLogs: Array.isArray((history as any).trainLogs) ? (history as any).trainLogs : [],
      auditEvents: Array.isArray((history as any).auditEvents) ? (history as any).auditEvents : [],
      effectiveConfig: (history as any).effectiveConfig || null,
      metricsHistory: Array.isArray((history as any).metricsHistory) ? (history as any).metricsHistory : [],
      progress: (history as any).progress ?? null,
      lastProgressAt: (history as any).lastProgressAt || null,
      updatedAt: history.updatedAt,
      completedAt: history.completedAt,
      source: 'mongo',
    });
  } catch (err: any) {
    console.error('[Backend] getTrainingHistoryAudit error:', err);
    return res.status(500).json({ error: err.message || 'Failed to get training audit' });
  }
};

// ---------------------------------------------------------------------------
// DELETE /api/train/history/:jobId
// Xoá 1 record training history
// ---------------------------------------------------------------------------
export const deleteTrainingHistory = async (req: Request, res: Response) => {
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { jobId } = req.params;
    const result = await TrainingHistory.findOneAndDelete({ jobId, ownerId });

    if (!result) {
      return res.status(404).json({ error: 'Training history not found' });
    }

    console.log(`[Backend] Deleted training history for job ${jobId}`);
    return res.status(200).json({ message: 'Training history deleted' });
  } catch (err: any) {
    console.error('[Backend] deleteTrainingHistory error:', err);
    return res.status(500).json({ error: err.message || 'Failed to delete training history' });
  }
};
