import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { EvaluationController } from '../../../controllers/evaluationController';
import { getAuthUserId } from '../../../utils/auth';
import { DatasetVersion } from '../../../models/DatasetVersion';
import { versionService } from './version.service';
import { DatasetAssignmentSubmission } from '../../../models/DatasetAssignmentSubmission';
import { DatasetSampleAssignment } from '../../../models/DatasetSampleAssignment';
import { ProcessedDatasetItem } from '../../../models/ProcessedDatasetItem';
import { DatasetAssignmentActivity } from '../../../models/DatasetAssignmentActivity';
import { DatasetAssignmentAdjudication } from '../../../models/DatasetAssignmentAdjudication';
import { DatasetCanonicalLabel } from '../../../models/DatasetCanonicalLabel';
import { LabelAssignment } from '../../../models/LabelAssignment';

const legacyEvaluationController = new EvaluationController();

export class DataPrepVersionController {
  async listVersions(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const versions = await DatasetVersion.find({
        $or: [
          { ownerId },
          { isPublic: true },
          { sharedWithUserIds: ownerId },
        ],
      }).sort({ updatedAt: -1, createdAt: -1 }).limit(50);
      const versionsWithStats = await Promise.all(versions.map(async (v) => {
        const [tasksCount, submittedTasks] = await Promise.all([
          DatasetAssignmentSubmission.countDocuments({ datasetVersionId: v._id }),
          DatasetAssignmentSubmission.countDocuments({ datasetVersionId: v._id, status: 'submitted' }),
        ]);
        const resumeStep = Number((v as any).prepareResumeStep || 1);
        const stage =
          resumeStep >= 13 ? 'Finish'
          : resumeStep >= 7 ? 'Stage 4 / Staff Labeling'
          : resumeStep >= 5 ? 'Stage 3 Labeling'
          : resumeStep >= 2 ? 'Preprocessing'
          : 'Upload';
        return {
          id: String(v._id),
          projectName: v.projectName,
          description: v.versionName,
          status: tasksCount > submittedTasks ? 'active' : 'ready',
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,
          prepareResumeStep: resumeStep,
          stage,
          conversations: v.totalSamples,
          messages: 0,
          author: String(v.ownerId) === String(ownerId) ? 'me' : 'shared',
          tags: [],
          accuracy: null,
          labeling: tasksCount > 0 ? 'in_progress' : 'completed',
          labelingTasks: tasksCount,
          labelingTasksDone: submittedTasks
        };
      }));
      res.status(200).json({ success: true, data: versionsWithStats });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async createVersion(req: Request, res: Response): Promise<void> {
    return legacyEvaluationController.createDatasetVersion(req, res);
  }

  async getVersion(req: Request, res: Response): Promise<void> {
    return legacyEvaluationController.getDatasetVersionDetail(req, res);
  }

  /**
   * GET /:id/clean-log
   * Trả về toàn bộ lịch sử các version được tạo từ bước Clean
   * (operationType = 'clean') bắt đầu từ versionId gốc, kèm cleanStats.
   * Dùng để tra cứu lại thống kê số lượng / lý do bị loại sau khi reload.
   */
  async getCleanLog(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ success: false, error: 'Invalid version id' });
        return;
      }

      // Lấy version hiện tại để xác nhận quyền truy cập
      const version = await DatasetVersion.findOne({
        _id: id,
        $or: [{ ownerId }, { isPublic: true }, { sharedWithUserIds: ownerId }],
      }).lean();

      if (!version) {
        res.status(404).json({ success: false, error: 'Version not found' });
        return;
      }

      // Tìm tất cả version con có operationType = 'clean' trong cùng project
      const cleanVersions = await DatasetVersion.find({
        projectId: version.projectId,
        operationType: 'clean',
        $or: [{ ownerId }, { isPublic: true }, { sharedWithUserIds: ownerId }],
      })
        .sort({ createdAt: 1 })
        .select('_id versionName versionNo operationParams cleanStats totalSamples createdAt parentVersionId')
        .lean();

      const log = cleanVersions.map((v) => ({
        versionId:      String(v._id),
        versionName:    v.versionName,
        versionNo:      v.versionNo,
        parentVersionId: v.parentVersionId ? String(v.parentVersionId) : null,
        totalSamples:   v.totalSamples,
        cleanStats:     (v as any).cleanStats ?? null,
        operationParams: v.operationParams ?? null,
        cleanedAt:      (v as any).cleanStats?.cleanedAt ?? v.createdAt,
      }));

      res.status(200).json({ success: true, data: log });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async deleteVersion(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { id } = req.params;
      
      const activeTasks = await DatasetAssignmentSubmission.countDocuments({ 
        datasetVersionId: id,
        status: { $nin: ['approved', 'completed', 'rejected'] } 
      });
      if (activeTasks > 0) {
        res.status(400).json({ error: 'Không thể xóa Version đang có task giao việc hoạt động.' });
        return;
      }

      const result = await versionService.deleteVersionTree(ownerId, id);

      res.json({
        message: 'Đã xóa dataset version cùng toàn bộ version con và assignment liên quan.',
        ...result,
      });
    } catch (error: any) {
      console.error('Delete dataset version error:', error);
      res.status(error?.statusCode || 500).json({
        error: error?.message || 'Xóa dataset version thất bại',
      });
    }
  }

  async updateVisibility(req: Request, res: Response): Promise<void> {
    return legacyEvaluationController.updateDatasetVersionVisibility(req, res);
  }

  async updatePrepareProgress(req: Request, res: Response): Promise<void> {
    return legacyEvaluationController.updateDatasetVersionPrepareProgress(req, res);
  }

  async updateSharing(req: Request, res: Response): Promise<void> {
    return legacyEvaluationController.updateDatasetVersionSharing(req, res);
  }

  async getAssignments(req: Request, res: Response): Promise<void> {
    return legacyEvaluationController.getDatasetVersionAssignments(req, res);
  }

  async getAssignmentDashboard(req: Request, res: Response): Promise<void> {
    return legacyEvaluationController.getDatasetVersionAssignmentDashboard(req, res);
  }

  async getAssignmentConflicts(req: Request, res: Response): Promise<void> {
    return legacyEvaluationController.getDatasetVersionAssignmentConflicts(req, res);
  }

  async getAssignmentSampleComparison(req: Request, res: Response): Promise<void> {
    return legacyEvaluationController.getDatasetVersionAssignmentSampleComparison(req, res);
  }

  async resolveAssignmentAdjudication(req: Request, res: Response): Promise<void> {
    return legacyEvaluationController.resolveDatasetVersionAssignmentAdjudication(req, res);
  }

  async publishAssignmentAdjudication(req: Request, res: Response): Promise<void> {
    return legacyEvaluationController.publishDatasetVersionAssignmentAdjudication(req, res);
  }

  async getCheckerActivityLogs(req: Request, res: Response): Promise<void> {
    return legacyEvaluationController.getCheckerActivityLogs(req, res);
  }

  async autoPublishAssignmentAdjudications(req: Request, res: Response): Promise<void> {
    return legacyEvaluationController.autoPublishDatasetVersionAssignmentAdjudications(req, res);
  }

  async getAiAdjudicationAdvice(req: Request, res: Response): Promise<void> {
    return legacyEvaluationController.getAiAdjudicationAdvice(req, res);
  }

  async assignRange(req: Request, res: Response): Promise<void> {
    return legacyEvaluationController.assignDatasetVersionRange(req, res);
  }

  async getUserAssignmentDetail(req: Request, res: Response): Promise<void> {
    return legacyEvaluationController.getDatasetVersionUserAssignmentDetail(req, res);
  }

  async clearAssignmentRange(req: Request, res: Response): Promise<void> {
    return legacyEvaluationController.clearDatasetVersionAssignmentRange(req, res);
  }

  async clearUserAssignments(req: Request, res: Response): Promise<void> {
    return legacyEvaluationController.clearDatasetVersionUserAssignments(req, res);
  }

  async getMyAssignmentStatus(req: Request, res: Response): Promise<void> {
    return legacyEvaluationController.getMyAssignmentSubmissionStatus(req, res);
  }

  async submitMyAssignment(req: Request, res: Response): Promise<void> {
    return legacyEvaluationController.submitMyAssignment(req, res);
  }

  async approveUserAssignment(req: Request, res: Response): Promise<void> {
    return legacyEvaluationController.approveUserAssignmentSubmission(req, res);
  }

  async deleteSample(req: Request, res: Response): Promise<void> {
    return legacyEvaluationController.deleteDatasetVersionSample(req, res);
  }

  async exportOriginal(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const items = await ProcessedDatasetItem.find({ datasetVersionId: id }).sort({ sampleIndex: 1 });
      const data = items.map(item => (item as any).originalData || item.data);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=version_${id}_original.json`);
      res.send(JSON.stringify(data, null, 2));
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async exportLabeled(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const items = await ProcessedDatasetItem.find({ datasetVersionId: id }).sort({ sampleIndex: 1 });
      const data = items.map(item => {
        let payload = (item as any).processedData || (item as any).originalData || item.data;
        if (payload) {
          try {
            payload = JSON.parse(JSON.stringify(payload));
            if (Array.isArray(payload.messages)) {
              payload.messages = payload.messages.map((msg: any) => {
                if (msg.role === 'assistant' && msg.action && typeof msg.action === 'string') {
                  // Inject Assistant Action Control Code
                  msg.content = `[${msg.action.toUpperCase()}] ${msg.content}`;
                }
                if (msg.role === 'user' && msg.intent && typeof msg.intent === 'string') {
                  // Inject User Intent Control Code
                  msg.content = `[${msg.intent.toUpperCase()}] ${msg.content}`;
                }
                return msg;
              });
            }
          } catch(e) {}
        }
        return payload;
      });
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=version_${id}_labeled.json`);
      res.send(JSON.stringify(data, null, 2));
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async clearAllAssignments(req: Request, res: Response): Promise<void> {
    try {
      let { id } = req.params;

      // Frontend truyền groupId dạng "versionId_taskName" từ getManagerOverview
      // Cần tách ra lấy phần versionId (24 ký tự ObjectId đầu tiên)
      if (id && id.includes('_')) {
        const parts = id.split('_');
        // ObjectId MongoDB luôn 24 ký tự hex
        if (parts[0].length === 24 && /^[0-9a-fA-F]{24}$/.test(parts[0])) {
          id = parts[0];
        }
      }

      const targetVersionOid = mongoose.Types.ObjectId.isValid(id)
        ? new mongoose.Types.ObjectId(id)
        : null;

      const queryVersionId = targetVersionOid
        ? { $in: [id, targetVersionOid] }
        : id;

      // Lấy tất cả sampleIds thuộc version này để xóa LabelAssignment
      const sampleIds = await ProcessedDatasetItem.find({ datasetVersionId: targetVersionOid || id })
        .select('_id').lean().then(items => items.map(i => i._id));

      // Xóa toàn bộ dữ liệu assignment + labeling liên quan
      const [subDel, saDel, actDel, adjDel, canDel, laDel] = await Promise.all([
        DatasetAssignmentSubmission.deleteMany({ datasetVersionId: queryVersionId }),
        DatasetSampleAssignment.deleteMany({ datasetVersionId: queryVersionId }),
        DatasetAssignmentActivity.deleteMany({ datasetVersionId: targetVersionOid || id }),
        DatasetAssignmentAdjudication.deleteMany({ datasetVersionId: targetVersionOid || id }),
        DatasetCanonicalLabel.deleteMany({ datasetVersionId: targetVersionOid || id }),
        sampleIds.length > 0
          ? LabelAssignment.deleteMany({ sampleId: { $in: sampleIds } })
          : Promise.resolve({ deletedCount: 0 }),
      ]);

      console.log(`[clearAllAssignments] versionId=${id} | submissions=${subDel.deletedCount}, sampleAssign=${saDel.deletedCount}, activities=${actDel.deletedCount}, adjudications=${adjDel.deletedCount}, canonicals=${canDel.deletedCount}, labelAssign=${laDel.deletedCount}`);

      res.status(200).json({
        success: true,
        message: 'Đã xóa toàn bộ dữ liệu giao việc + nhãn gán của Version này.',
        deleted: {
          submissions: subDel.deletedCount,
          sampleAssignments: saDel.deletedCount,
          activities: actDel.deletedCount,
          adjudications: adjDel.deletedCount,
          canonicalLabels: canDel.deletedCount,
          labelAssignments: (laDel as any).deletedCount || 0,
        },
      });
    } catch (error: any) {
      console.error('[clearAllAssignments] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  private async cloneCheckpoint(
    req: Request,
    res: Response,
    options: {
      operationType: 'classification_balanced' | 'evaluation_filtered' | 'refine_approved';
      prepareResumeStep: number;
      stage: 'classification' | 'evaluation' | 'finish';
      checkpointReason: string;
    }
  ): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ error: 'Dataset version id không hợp lệ.' });
        return;
      }

      const baseVersion = await DatasetVersion.findOne({ _id: id, ownerId }).lean();
      if (!baseVersion) {
        res.status(404).json({ error: 'Không tìm thấy dataset version.' });
        return;
      }

      const data = Array.isArray(req.body?.data) ? req.body.data : [];
      if (!data.length) {
        res.status(400).json({ error: 'Cần cung cấp dữ liệu checkpoint.' });
        return;
      }

      const operationParams = {
        ...(req.body?.operationParams && typeof req.body.operationParams === 'object' ? req.body.operationParams : {}),
        sourceVersionId: String(baseVersion._id),
        stage: options.stage,
        checkpointReason: options.checkpointReason,
      };

      const result = await versionService.cloneVersionFromVersion({
        ownerId,
        baseVersionId: String(baseVersion._id),
        operationType: options.operationType,
        operationParams,
        prepareResumeStep: options.prepareResumeStep,
        format: req.body?.format === 'openai' ? 'openai' : 'alpaca',
        data,
      });

      res.status(201).json({
        message: 'Đã tạo checkpoint version thành công.',
        project: {
          _id: String(result.project._id),
          name: result.project.name,
          sourceType: result.project.sourceType,
        },
        datasetVersion: result.datasetVersion,
        sampleIdMap: result.sampleIdMap,
      });
    } catch (error: any) {
      console.error('Create checkpoint version error:', error);
      res.status(error?.statusCode || 500).json({
        error: error?.message || 'Tạo checkpoint version thất bại',
      });
    }
  }

  async createClassificationBalanceCheckpoint(req: Request, res: Response): Promise<void> {
    return this.cloneCheckpoint(req, res, {
      operationType: 'classification_balanced',
      prepareResumeStep: 10,
      stage: 'classification',
      checkpointReason: 'classification-balance',
    });
  }

  async createEvaluationFilterCheckpoint(req: Request, res: Response): Promise<void> {
    return this.cloneCheckpoint(req, res, {
      operationType: 'evaluation_filtered',
      prepareResumeStep: 11,
      stage: 'evaluation',
      checkpointReason: 'evaluation-filter',
    });
  }

  async createRefineAcceptCheckpoint(req: Request, res: Response): Promise<void> {
    return this.cloneCheckpoint(req, res, {
      operationType: 'refine_approved',
      prepareResumeStep: 13,
      stage: 'finish',
      checkpointReason: 'refine-accept',
    });
  }
}
