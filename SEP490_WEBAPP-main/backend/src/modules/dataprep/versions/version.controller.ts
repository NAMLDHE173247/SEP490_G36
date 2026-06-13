import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { EvaluationController } from '../../../controllers/evaluationController';
import { getAuthUserId } from '../../../utils/auth';
import { DatasetVersion } from '../../../models/DatasetVersion';
import { versionService } from './version.service';
import { DatasetAssignmentSubmission } from '../../../models/DatasetAssignmentSubmission';
import { DatasetSampleAssignment } from '../../../models/DatasetSampleAssignment';
import { ProcessedDatasetItem } from '../../../models/ProcessedDatasetItem';

const legacyEvaluationController = new EvaluationController();

export class DataPrepVersionController {
  async listVersions(req: Request, res: Response): Promise<void> {
    try {
      const versions = await DatasetVersion.find().sort({ createdAt: -1 });
      const versionsWithStats = await Promise.all(versions.map(async (v) => {
        const tasksCount = await DatasetAssignmentSubmission.countDocuments({ datasetVersionId: v._id });
        return {
          id: v._id,
          projectName: v.projectName,
          description: v.versionName,
          status: 'completed',
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,
          stage: 'Labeling (Stage 4)', 
          conversations: v.totalSamples,
          messages: 0,
          author: 'admin',
          tags: [],
          accuracy: null,
          labeling: tasksCount > 0 ? 'in_progress' : 'completed',
          labelingTasks: tasksCount,
          labelingTasksDone: 0
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

  async autoPublishAssignmentAdjudications(req: Request, res: Response): Promise<void> {
    return legacyEvaluationController.autoPublishDatasetVersionAssignmentAdjudications(req, res);
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
      const data = items.map(item => item.originalData);
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
      const data = items.map(item => item.processedData || item.originalData);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=version_${id}_labeled.json`);
      res.send(JSON.stringify(data, null, 2));
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async clearAllAssignments(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await DatasetAssignmentSubmission.deleteMany({ datasetVersionId: id });
      await DatasetSampleAssignment.deleteMany({ datasetVersionId: id });
      res.status(200).json({ success: true, message: 'Đã hủy toàn bộ task giao việc của Version này.' });
    } catch (error: any) {
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
