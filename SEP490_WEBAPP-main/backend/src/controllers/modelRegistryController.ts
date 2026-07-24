import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { ModelRegistry } from '../models/ModelRegistry';
import { ModelVersion, ModelVersionStatus } from '../models/ModelVersion';
import { TrainingHistory } from '../models/TrainingHistory';
import { ModelEvaluation } from '../models/Evaluation';
import fs from 'fs';
import { getAuthUserId } from '../utils/auth';

type RegistrySubject = string;

const asFiniteNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

// Evaluation documents from older and newer runners do not share one exact
// summary shape. Normalize them here instead of showing NaN/0 in the registry.
const getEvaluationOverall = (summary: any): number | null => {
  if (!summary) return null;
  const direct = asFiniteNumber(summary.overall);
  if (direct !== null) return direct;

  const nested = summary.overall;
  if (nested && typeof nested === 'object') {
    for (const candidate of [nested.ft_avg, nested.average, nested.score, nested.value]) {
      const parsed = asFiniteNumber(candidate);
      if (parsed !== null) return parsed;
    }
  }

  for (const candidate of [summary.composite_score, summary.overall_score, summary.score]) {
    const parsed = asFiniteNumber(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
};

const getEvaluationMetrics = (evaluation: any, current: Record<string, any> = {}) => {
  const summary = evaluation?.summary || {};
  const overall = getEvaluationOverall(summary);
  const max = asFiniteNumber(summary.max_possible) || 5;
  const avgLatencyMs = asFiniteNumber(summary.avg_latency_ms ?? summary.latency?.avg_ms);

  return {
    ...current,
    ...(overall !== null && max > 0 ? { overallScore: (overall / max) * 100 } : {}),
    evalSummary: summary,
    evalMode: evaluation?.evalMode,
    totalConversations: evaluation?.totalConversations,
    judgeModel: evaluation?.judgeModel,
    ...(avgLatencyMs !== null ? { avgLatencyMs } : {}),
  };
};

const inferSubject = (...values: unknown[]): RegistrySubject => {
  const text = values.filter(Boolean).join(' ').toLowerCase();
  if (/(english|tieng anh|language|grammar|vocabulary)/.test(text)) return 'ENGLISH';
  if (/(math|mathematics|toan|algebra|geometry)/.test(text)) return 'MATH';
  if (/(physics|physical|phys|vat ly|ly hoc)/.test(text)) return 'PHYSICS';
  if (/(chemistry|chemical|chem|hoa hoc)/.test(text)) return 'CHEMISTRY';
  if (/(history|lich su)/.test(text)) return 'HISTORY';
  if (/(general|multi|router|mixed)/.test(text)) return 'GENERAL';
  return 'UNKNOWN';
};

const demoteOtherUseVersionsForSubject = async (
  ownerId: string,
  version: any,
): Promise<void> => {
  const registry = await ModelRegistry.findOne({
    _id: version.modelRegistryId,
    ownerId,
  }).select('_id subject').lean();
  const subject = String(version.subject || registry?.subject || 'UNKNOWN').trim().toUpperCase();
  if (!subject || subject === 'UNKNOWN') return;

  const registryIds = await ModelRegistry.find({
    ownerId,
    subject,
    routerEnabled: { $ne: false },
  }).distinct('_id');

  await ModelVersion.updateMany(
    {
      ownerId,
      modelRegistryId: { $in: registryIds },
      _id: { $ne: version._id },
      status: ModelVersionStatus.USE,
    },
    { $set: { status: ModelVersionStatus.NOT_USE } },
  );
};

// Helper để lấy kết quả đánh giá đúng với một Model Version.
// Ưu tiên evaluationId đã chọn khi đăng ký version; chỉ fallback latest khi version cũ chưa có evaluationId.
const getVersionEvaluation = async (params: {
  jobId?: string;
  ownerId: string;
  evaluationId?: any;
}) => {
  try {
    const { jobId, ownerId, evaluationId } = params;
    if (evaluationId) {
      const evalOr: any[] = [{ modelEvalId: String(evaluationId) }];
      if (mongoose.Types.ObjectId.isValid(String(evaluationId))) {
        evalOr.push({ _id: evaluationId });
      }
      const bySelectedId = await ModelEvaluation.findOne({
        ownerId,
        $or: evalOr,
      });
      if (bySelectedId) return bySelectedId;
    }

    if (!jobId) return null;
    return await ModelEvaluation.findOne({ ownerId, jobId }).sort({ createdAt: -1 });
  } catch (e) {
    return null;
  }
};

export class ModelRegistryController {
  // --- Registry Methods ---

  async listRegistries(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const registries = await ModelRegistry.find({ ownerId }).sort({ updatedAt: -1 });
      
      const enrichedRegistries = await Promise.all(registries.map(async (registry) => {
        const versions = await ModelVersion.find({ ownerId, modelRegistryId: registry._id })
          .populate('trainingHistoryId')
          .sort({ createdAt: -1 });

        const enrichedVersions = await Promise.all(versions.map(async (v: any) => {
          const versionJson = v.toJSON();
          if (v.trainingHistoryId) {
            const history = v.trainingHistoryId as any;
            const searchId = history.jobId || history._id?.toString() || history.toString();

            const evaluation = await getVersionEvaluation({
              jobId: searchId,
              ownerId,
              evaluationId: v.evaluationId,
            });

            if (evaluation && evaluation.summary) {
              versionJson.modelEvalId = evaluation.modelEvalId;
              versionJson.evaluationResult = evaluation.summary;
              versionJson.metrics = getEvaluationMetrics(evaluation, versionJson.metrics || {});
            }
            versionJson.training = {
              jobId: history.jobId,
              projectName: history.projectName,
              baseModel: history.baseModel,
              datasetName: history.datasetName,
              datasetVersionId: history.datasetVersionId,
              systemPromptVersion: history.systemPromptVersion,
              totalRecords: history.totalRecords,
              totalTokens: history.totalTokens,
              trainingDuration: history.trainingDuration,
              completedAt: history.completedAt,
              finalMetrics: history.finalMetrics,
            };
          }
          return versionJson;
        }));

        const versionsCount = enrichedVersions.length;
        const activeVersion = enrichedVersions.find(v => v.status === ModelVersionStatus.USE) || enrichedVersions[0] || null;

        return {
          ...registry.toJSON(),
          versionsCount,
          activeVersion,
          versions: enrichedVersions
        };
      }));

      res.json(enrichedRegistries);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  /**
   * Explicitly imports real, completed training runs into Model Registry.
   * This replaces the old startup demo seeder and never promotes a model to
   * production automatically: the manager still chooses which version is Use.
   */
  async syncFromTrainingHistory(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const requestedIds = Array.isArray(req.body?.trainingHistoryIds)
        ? req.body.trainingHistoryIds.filter((value: unknown) => mongoose.Types.ObjectId.isValid(String(value)))
        : [];

      const historyFilter: Record<string, any> = {
        ownerId,
        status: 'COMPLETED',
        jobId: { $not: /^job-mock-/i },
        hfRepoId: { $exists: true, $nin: ['', null] },
      };
      if (requestedIds.length > 0) historyFilter._id = { $in: requestedIds };

      const histories = await TrainingHistory.find(historyFilter).sort({ completedAt: 1, createdAt: 1 });
      let registriesCreated = 0;
      let versionsCreated = 0;
      let versionsSkipped = 0;

      for (const history of histories as any[]) {
        const existingVersion = await ModelVersion.findOne({
          ownerId,
          trainingHistoryId: history._id,
        });
        if (existingVersion) {
          versionsSkipped += 1;
          continue;
        }

        let registry = null as any;
        const versionForSameRepo = await ModelVersion.findOne({ ownerId, hfRepoId: history.hfRepoId });
        if (versionForSameRepo) {
          registry = await ModelRegistry.findOne({ ownerId, _id: versionForSameRepo.modelRegistryId });
        }

        const subject = inferSubject(
          history.projectName,
          history.datasetName,
          history.hfRepoId,
          history.systemPrompt,
        );

        if (!registry) {
          registry = await ModelRegistry.findOne({ ownerId, name: history.hfRepoId });
        }
        if (!registry) {
          registry = await ModelRegistry.create({
            ownerId,
            name: history.hfRepoId,
            description: `Đồng bộ từ training job thật: ${history.projectName}`,
            baseModel: history.baseModel,
            subject,
            routerEnabled: true,
          });
          registriesCreated += 1;
        }

        const evaluation = await getVersionEvaluation({
          jobId: history.jobId,
          ownerId,
          evaluationId: history.pinnedEvalId,
        });
        const metrics = evaluation
          ? getEvaluationMetrics(evaluation, history.finalMetrics?.toObject?.() || history.finalMetrics || {})
          : (history.finalMetrics?.toObject?.() || history.finalMetrics || {});
        const completedAt = history.completedAt || history.createdAt || new Date();
        const datePart = new Date(completedAt).toISOString().replace(/[-:]/g, '').slice(0, 13);
        const jobSuffix = String(history.jobId).replace(/[^a-zA-Z0-9]/g, '').slice(-8);

        await ModelVersion.create({
          ownerId,
          modelRegistryId: registry._id,
          version: `run-${datePart}-${jobSuffix}`,
          trainingHistoryId: history._id,
          evaluationId: evaluation?._id,
          hfRepoId: history.hfRepoId,
          subject: subject !== 'UNKNOWN' ? subject : registry.subject,
          routerEnabled: true,
          status: ModelVersionStatus.NOT_USE,
          metrics,
          configSnapshot: history.parameters || history.config_snapshot,
          datasetInfo: {
            name: history.datasetName,
            source: history.datasetSource,
          },
          promptVersion: history.systemPromptVersion,
          systemPrompt: history.systemPrompt || '',
          notes: `Đồng bộ từ ${history.projectName} (${history.jobId})`,
          createdBy: 'Training History Sync',
        });
        versionsCreated += 1;
      }

      res.json({
        scanned: histories.length,
        registriesCreated,
        versionsCreated,
        versionsSkipped,
        skippedWithoutRepository: requestedIds.length === 0
          ? await TrainingHistory.countDocuments({
            ownerId,
            status: 'COMPLETED',
            jobId: { $not: /^job-mock-/i },
            $or: [{ hfRepoId: '' }, { hfRepoId: null }, { hfRepoId: { $exists: false } }],
          })
          : 0,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || 'Không đồng bộ được Model Registry' });
    }
  }

  async getRegistry(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const registry = await ModelRegistry.findOne({ _id: req.params.id, ownerId });
      if (!registry) {
        res.status(404).json({ message: 'Registry not found' });
        return;
      }
      res.json(registry);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  async createRegistry(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { name, description, baseModel, subject = 'UNKNOWN', routerEnabled = true } = req.body;
      const registry = await ModelRegistry.create({ ownerId, name, description, baseModel, subject, routerEnabled });
      res.status(201).json(registry);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }

  async updateRegistry(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const registry = await ModelRegistry.findOneAndUpdate(
        { _id: req.params.id, ownerId },
        req.body,
        { returnDocument: 'after' }
      );
      if (!registry) {
        res.status(404).json({ message: 'Registry not found' });
        return;
      }
      if (typeof req.body.subject === 'string' && req.body.subject.trim()) {
        await ModelVersion.updateMany(
          { ownerId, modelRegistryId: registry._id },
          { $set: { subject: req.body.subject.trim().toUpperCase() } },
        );
      }
      res.json(registry);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }

  async deleteRegistry(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const registry = await ModelRegistry.findOneAndDelete({ _id: req.params.id, ownerId });
      if (!registry) {
        res.status(404).json({ message: 'Registry not found' });
        return;
      }
      // Also delete all versions associated with this registry
      await ModelVersion.deleteMany({ ownerId, modelRegistryId: registry._id });
      res.json({ message: 'Registry and its versions deleted' });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  // --- Version Methods ---

  async listVersions(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const versions = await ModelVersion.find({ ownerId, modelRegistryId: req.params.registryId })
        .populate('trainingHistoryId')
        .sort({ createdAt: -1 });

      // Bổ sung: Lấy thêm thông tin evaluation cho mỗi version từ bảng ModelEvaluation
      const enrichedVersions = await Promise.all(versions.map(async (v: any) => {
        const versionJson = v.toJSON();
        if (v.trainingHistoryId) {
          // QUAN TRỌNG: ModelEvaluation lưu jobId là chuỗi dạng 'job_xxx', không phải ObjectId
          const history = v.trainingHistoryId as any;
          const searchId = history.jobId || history._id?.toString() || history.toString();

          const evaluation = await getVersionEvaluation({
            jobId: searchId,
            ownerId,
            evaluationId: v.evaluationId,
          });

          if (evaluation && evaluation.summary) {
            versionJson.modelEvalId = evaluation.modelEvalId;
            versionJson.evaluationResult = evaluation.summary;
            // Cập nhật metrics hiển thị nếu có kết quả đánh giá mới
            versionJson.metrics = getEvaluationMetrics(evaluation, versionJson.metrics || {});
          }
          versionJson.training = {
            jobId: history.jobId,
            projectName: history.projectName,
            baseModel: history.baseModel,
            datasetName: history.datasetName,
            datasetVersionId: history.datasetVersionId,
            systemPromptVersion: history.systemPromptVersion,
            totalRecords: history.totalRecords,
            totalTokens: history.totalTokens,
            trainingDuration: history.trainingDuration,
            completedAt: history.completedAt,
            finalMetrics: history.finalMetrics,
          };
        }
        return versionJson;
      }));

      res.json(enrichedVersions);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  async registerVersion(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const {
        modelRegistryId,
        version,
        trainingHistoryId,
        evaluationId,
        hfRepoId,
        notes,
        status,
        promptVersion,
        subject,
        routerEnabled = true,
      } = req.body;

      // Validate registry exists
      const registry = await ModelRegistry.findOne({ _id: modelRegistryId, ownerId });
      if (!registry) {
        res.status(404).json({ message: 'Model Registry not found' });
        return;
      }

      let metrics: any = {};
      let configSnapshot = null;
      let datasetInfo: { name: string; source: string } | undefined;
      let systemPrompt = '';

      // 1. Fetch data from Training History
      if (trainingHistoryId) {
        const history = await TrainingHistory.findOne({ _id: trainingHistoryId, ownerId });
        if (history) {
          if (history.finalMetrics) {
            metrics = { ...history.finalMetrics };
          }
          configSnapshot = history.parameters; // or history.config_snapshot
          datasetInfo = {
            name: history.datasetName,
            source: history.datasetSource,
          };
          systemPrompt = history.systemPrompt || '';
        }
      }

      // 2. Fetch data from Evaluation (if provided)
      // This will override or supplement metrics from training history
      let selectedEvaluation = null as any;
      if (evaluationId) {
        const evalOr: any[] = [{ modelEvalId: String(evaluationId) }];
        if (mongoose.Types.ObjectId.isValid(String(evaluationId))) {
          evalOr.push({ _id: evaluationId });
        }
        selectedEvaluation = await ModelEvaluation.findOne({
          ownerId,
          $or: evalOr,
        });
        const evaluation = selectedEvaluation;
        if (evaluation && evaluation.summary) {
          metrics = getEvaluationMetrics(evaluation, metrics);
        }
      }

      const newVersion = await ModelVersion.create({
        ownerId,
        modelRegistryId,
        version,
        trainingHistoryId,
        evaluationId: selectedEvaluation?._id || evaluationId,
        hfRepoId,
        notes,
        metrics,
        configSnapshot,
        datasetInfo,
        promptVersion,
        systemPrompt,
        subject: subject || registry.subject || 'UNKNOWN',
        routerEnabled,
        status: status || ModelVersionStatus.NOT_USE,
      });

      if (newVersion.status === ModelVersionStatus.USE) {
        await demoteOtherUseVersionsForSubject(ownerId, newVersion);
      }

      res.status(201).json(newVersion);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }

  async updateVersionStatus(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { status } = req.body;
      if (!Object.values(ModelVersionStatus).includes(status)) {
        res.status(400).json({ message: 'Invalid status' });
        return;
      }

      const version = await ModelVersion.findOneAndUpdate(
        { _id: req.params.id, ownerId },
        { status },
        { returnDocument: 'after' }
      );

      if (!version) {
        res.status(404).json({ message: 'Version not found' });
        return;
      }

      // The Router needs one deterministic deployment target per subject, not
      // merely one active version inside each separate registry.
      if (status === ModelVersionStatus.USE) {
        await demoteOtherUseVersionsForSubject(ownerId, version);
      }

      res.json(version);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }

  async deleteVersion(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const version = await ModelVersion.findOneAndDelete({ _id: req.params.id, ownerId });
      if (!version) {
        res.status(404).json({ message: 'Version not found' });
        return;
      }
      res.json({ message: 'Version deleted' });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  async getEvaluationsByJob(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const evaluations = await ModelEvaluation.find({ ownerId, jobId: req.params.jobId, status: 'COMPLETED' })
        .select('modelEvalId summary createdAt judgeModel')
        .sort({ createdAt: -1 });
      res.json(evaluations);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  async downloadDataset(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const version = await ModelVersion.findOne({ _id: req.params.id, ownerId }).populate('trainingHistoryId');
      if (!version) {
        res.status(404).json({ message: 'Version not found' });
        return;
      }

      const history = version.trainingHistoryId as any;
      if (!history || String(history.ownerId) !== ownerId || !history.datasetPath) {
        res.status(404).json({ message: 'Dataset file not found or not stored locally' });
        return;
      }

      const filePath = history.datasetPath;
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ message: 'File no longer exists on server' });
        return;
      }

      res.download(filePath, history.datasetName || 'dataset.json');
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  async getActiveVersion(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { registryId } = req.params;
      const version = await ModelVersion.findOne({
        ownerId,
        modelRegistryId: registryId,
        status: ModelVersionStatus.USE
      }).populate('trainingHistoryId');

      if (!version) {
        res.status(404).json({ message: 'No active version found for this registry' });
        return;
      }

      res.json(version);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
}
