import { Request, Response } from 'express';
import { getAuthUserId } from '../../../utils/auth';
import { MultiEvalService } from './multiEval.service';
import { DatasetAssignmentSubmission } from '../../../models/DatasetAssignmentSubmission';

const multiEvalService = new MultiEvalService();

export class MultiEvalController {
  async runJob(req: Request, res: Response): Promise<void> {
    try {
      const supervisorId = getAuthUserId(req);
      if (!supervisorId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { versionId } = req.params;
      const { models, contextWindow, conflictThreshold } = req.body;

      if (!Array.isArray(models) || models.length === 0) {
        res.status(400).json({ error: 'Danh sách model không hợp lệ.' });
        return;
      }

      const validContextWindows = ['No Context', 'n - 1', 'n - 2 to n', 'n - 1 to n + 1', 'n - 2 to n + 2'];
      if (!validContextWindows.includes(contextWindow)) {
        res.status(400).json({ error: 'Cấu hình ngữ cảnh (contextWindow) không hợp lệ.' });
        return;
      }

      const threshold = Math.min(5, Math.max(0.5, Number(conflictThreshold) || 2));
      const job = await multiEvalService.runJob(versionId, supervisorId, models, contextWindow, threshold);
      res.status(201).json({ message: 'Bắt đầu tiến trình chấm điểm bằng AI Judge.', job });
    } catch (error: any) {
      console.error('Run multi-model evaluation job error:', error);
      res.status(error.statusCode || 500).json({
        error: error.message || 'Không thể chạy tiến trình đánh giá chất lượng',
      });
    }
  }

  async getJobStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { jobId } = req.params;
      const job = await multiEvalService.getJobStatus(jobId);
      res.json(job);
    } catch (error: any) {
      console.error('Get job status error:', error);
      res.status(error.statusCode || 500).json({
        error: error.message || 'Không thể lấy thông tin tiến độ của Job',
      });
    }
  }

  async getLatestJob(req: Request, res: Response): Promise<void> {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { versionId } = req.params;
      const job = await multiEvalService.getLatestJob(versionId);
      res.json(job);
    } catch (error: any) {
      console.error('Get latest job error:', error);
      res.status(error.statusCode || 500).json({
        error: error.message || 'Không thể lấy thông tin Job gần nhất',
      });
    }
  }

  async getResults(req: Request, res: Response): Promise<void> {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { versionId } = req.params;
      const { scoreMin, scoreMax, conflictOnly, recommendation, subject } = req.query;

      const filters: any = {};
      if (scoreMin !== undefined) filters.scoreMin = Number(scoreMin);
      if (scoreMax !== undefined) filters.scoreMax = Number(scoreMax);
      if (conflictOnly === 'true') filters.conflictOnly = true;
      if (recommendation) filters.recommendation = String(recommendation);
      if (subject) filters.subject = String(subject);

      const results = await multiEvalService.getResults(versionId, filters);
      res.json(results);
    } catch (error: any) {
      console.error('Get evaluation results error:', error);
      res.status(error.statusCode || 500).json({
        error: error.message || 'Không thể tải danh sách kết quả đánh giá',
      });
    }
  }

  async adjudicateResult(req: Request, res: Response): Promise<void> {
    try {
      const supervisorId = getAuthUserId(req);
      if (!supervisorId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const role = String((req as any).user?.role || '').toLowerCase();
      if (!['admin', 'supervisor'].includes(role)) {
        res.status(403).json({ error: 'Admin hoặc Supervisor role required.' });
        return;
      }

      const { versionId, resultId } = req.params;
      if (role === 'supervisor') {
        const assigned = await DatasetAssignmentSubmission.exists({ datasetVersionId: versionId, supervisor: supervisorId });
        if (!assigned) {
          res.status(403).json({ error: 'Conflict này chưa được giao cho Supervisor hiện tại.' });
          return;
        }
      }
      const { action, note } = req.body;

      if (!['approve', 'rewrite', 'reevaluate', 'reject'].includes(action)) {
        res.status(400).json({ error: 'Hành động duyệt (action) không hợp lệ.' });
        return;
      }

      const result = await multiEvalService.adjudicateResult(versionId, resultId, supervisorId, action, note);
      res.json({ message: 'Lưu phê duyệt của Supervisor thành công.', result });
    } catch (error: any) {
      console.error('Adjudicate evaluation result error:', error);
      res.status(error.statusCode || 500).json({
        error: error.message || 'Không thể duyệt kết quả đánh giá',
      });
    }
  }
}
