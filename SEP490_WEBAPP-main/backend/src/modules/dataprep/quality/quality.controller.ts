import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { getAuthUserId, isAssignmentReviewer, isManager } from '../../../utils/auth';
import { QualityService } from './quality.service';
import { Stage4RewriteAssignment } from '../../../models/Stage4RewriteAssignment';
import { Stage4Notification } from '../../../models/Stage4Notification';
import { ConversationRewriteHistory } from '../../../models/ConversationRewriteHistory';
import { ProcessedDatasetItem } from '../../../models/ProcessedDatasetItem';
import { User } from '../../../models/User';
import { apiKeyService } from '../../../services/apiKeyService';
import { sendTransactionalEmail } from '../../../services/emailService';
import { DatasetAssignmentSubmission } from '../../../models/DatasetAssignmentSubmission';
import { DatasetSampleAssignment } from '../../../models/DatasetSampleAssignment';
import { AutoLabelV2Service } from '../labeling/autoLabelV2.service';
import { canCheckerReviewRewrite, canStaffSubmitRewrite } from './rewriteWorkflowPolicy';
import { LabelAssignment } from '../../../models/LabelAssignment';
import { DatasetVersion } from '../../../models/DatasetVersion';
import { CheckerActivityLog } from '../../../models/CheckerActivityLog';

const qualityService = new QualityService();
const REWRITE_CONTEXT_MODES = ['n-2:n+3', 'n-2:n+2', 'n-1:n+1', 'n-1:n', 'target-only', 'full'] as const;
type RewriteContextMode = typeof REWRITE_CONTEXT_MODES[number];
let rewriteIndexUpgradePromise: Promise<void> | null = null;

export class QualityController {
  private buildRewriteContextMessages(messages: any[], targetIndex: number, contextMode: RewriteContextMode) {
    const cleanMessages = messages
      .map((message: any, index: number) => ({
        index,
        role: message?.role === 'assistant' ? 'assistant' : 'user',
        content: String(message?.content || ''),
      }))
      .filter((message: any) => message.content.trim() && (message.role === 'user' || message.role === 'assistant'));

    if (!cleanMessages.length) return [];
    let fallbackTargetIndex = cleanMessages[cleanMessages.length - 1]?.index ?? 0;
    for (let i = cleanMessages.length - 1; i >= 0; i -= 1) {
      if (cleanMessages[i].role === 'assistant') {
        fallbackTargetIndex = cleanMessages[i].index;
        break;
      }
    }
    const normalizedTargetIndex = Number.isInteger(targetIndex) && targetIndex >= 0 ? targetIndex : fallbackTargetIndex;
    let start = 0;
    let end = messages.length - 1;
    if (contextMode === 'target-only') {
      start = normalizedTargetIndex;
      end = normalizedTargetIndex;
    } else if (contextMode === 'n-1:n') {
      start = Math.max(0, normalizedTargetIndex - 1);
      end = normalizedTargetIndex;
    } else if (contextMode === 'n-1:n+1') {
      start = Math.max(0, normalizedTargetIndex - 1);
      end = Math.min(messages.length - 1, normalizedTargetIndex + 1);
    } else if (contextMode === 'n-2:n+3') {
      start = Math.max(0, normalizedTargetIndex - 2);
      end = Math.min(messages.length - 1, normalizedTargetIndex + 3);
    } else if (contextMode === 'n-2:n+2') {
      start = Math.max(0, normalizedTargetIndex - 2);
      end = Math.min(messages.length - 1, normalizedTargetIndex + 2);
    }

    return cleanMessages
      .filter((message: any) => contextMode === 'full' || (message.index >= start && message.index <= end))
      .map((message: any) => ({
        role: message.role,
        content: message.content,
        isTarget: message.index === normalizedTargetIndex,
      }));
  }

  private serializeRewriteTask(task: any) {
    const sampleMessages = Array.isArray(task.sampleId?.data?.messages) ? task.sampleId.data.messages : [];
    const originalText = String(task.originalText || '').trim();
    const targetIndex = sampleMessages.findIndex((message: any) => originalText && String(message?.content || '').trim() === originalText);
    const fallbackConversationMessages = sampleMessages
      .filter((message: any) => message?.role === 'user' || message?.role === 'assistant')
      .map((message: any, index: number) => ({
        role: message.role,
        content: String(message.content || ''),
        isTarget: targetIndex >= 0 ? index === targetIndex : String(message.content || '').trim() === originalText,
      }));
    return {
      id: String(task._id),
      sampleId: String(task.sampleId?._id || task.sampleId),
      convId: task.convId,
      subject: task.subject || '',
      reason: task.reason || 'None',
      reasonSource: task.reasonSource || 'Quality Review (system aggregate)',
      originalText: task.originalText || '',
      targetMessageIndex: Number.isInteger(Number(task.targetMessageIndex)) ? Number(task.targetMessageIndex) : null,
      contextMode: task.contextMode || 'n-2:n+3',
      conversationMessages: Array.isArray(task.conversationMessages) && task.conversationMessages.length
        ? task.conversationMessages
        : fallbackConversationMessages,
      submittedText: task.submittedText || '',
      status: task.status,
      staffName: task.assigneeId?.name || task.assigneeId?.email || String(task.assigneeId),
      assigneeId: String(task.assigneeId?._id || task.assigneeId),
      checkerId: task.checkerId ? String(task.checkerId?._id || task.checkerId) : '',
      checkerName: task.checkerId?.name || task.checkerId?.email || '',
      checkerReviewNote: task.checkerReviewNote || '',
      checkerReviewedAt: task.checkerReviewedAt || null,
      updatedAt: task.updatedAt,
      submittedAt: task.submittedAt,
      reviewedAt: task.reviewedAt,
      reviewNote: task.reviewNote || '',
    };
  }

  private async resolveActiveCheckerId(requestedCheckerId?: string, fallbackCheckerId?: string) {
    const candidateId = requestedCheckerId || fallbackCheckerId;
    if (candidateId && mongoose.Types.ObjectId.isValid(candidateId)) {
      const checker = await User.findOne({ _id: candidateId, role: 'checker', status: 'active' }).select('_id').lean();
      if (checker) return String(checker._id);
    }
    const defaultChecker = await User.findOne({ role: 'checker', status: 'active' })
      .sort({ name: 1, _id: 1 })
      .select('_id')
      .lean();
    return defaultChecker ? String(defaultChecker._id) : '';
  }

  async listActiveCheckers(_req: Request, res: Response): Promise<void> {
    const checkers = await User.find({ role: 'checker', status: 'active' }).select('_id name email').sort({ name: 1 }).lean();
    res.json({ data: checkers.map((checker: any) => ({ id: String(checker._id), name: checker.name, email: checker.email, role: 'checker' })) });
  }

  private async notify(params: {
    versionId: string;
    actorId?: string;
    recipientId?: string;
    recipientRole?: 'admin' | 'supervisor' | 'staff' | 'checker';
    type?: 'info' | 'success' | 'warning';
    message: string;
  }) {
    const recipientFilter: any = {
      datasetVersionId: new mongoose.Types.ObjectId(params.versionId),
      message: params.message,
      createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) },
    };
    if (params.recipientId && mongoose.Types.ObjectId.isValid(params.recipientId)) recipientFilter.recipientId = new mongoose.Types.ObjectId(params.recipientId);
    if (params.recipientRole) recipientFilter.recipientRole = params.recipientRole;
    if (await Stage4Notification.exists(recipientFilter)) return;
    await Stage4Notification.create({
      datasetVersionId: new mongoose.Types.ObjectId(params.versionId),
      actorId: params.actorId && mongoose.Types.ObjectId.isValid(params.actorId) ? new mongoose.Types.ObjectId(params.actorId) : undefined,
      recipientId: params.recipientId && mongoose.Types.ObjectId.isValid(params.recipientId) ? new mongoose.Types.ObjectId(params.recipientId) : undefined,
      recipientRole: params.recipientRole,
      type: params.type || 'info',
      message: params.message,
    });
    const recipientQuery: any = params.recipientId
      ? { _id: params.recipientId }
      : params.recipientRole ? { role: params.recipientRole, status: 'active' } : null;
    if (recipientQuery) {
      const recipients = await User.find(recipientQuery).select('email').lean();
      const emails = recipients.map((user: any) => String(user.email || '')).filter((email) => email.includes('@'));
      if (emails.length) void sendTransactionalEmail({
        to: emails,
        subject: '[SEP490] Cập nhật Rewrite Task',
        text: `${params.message}\n\nVui lòng đăng nhập hệ thống để xem chi tiết.`,
      }).then((result) => {
        if (!result.sent && result.reason !== 'email_not_configured') console.warn('[Email] Delivery skipped:', result.reason);
      });
    }
  }

  private async ensureRewriteAssignmentIndexes() {
    if (!rewriteIndexUpgradePromise) {
      rewriteIndexUpgradePromise = Stage4RewriteAssignment.collection
        .dropIndex('datasetVersionId_1_sampleId_1')
        .catch(() => undefined)
        .then(() => undefined);
    }
    await rewriteIndexUpgradePromise;
  }

  private async canManageVersion(req: Request, versionId: string): Promise<boolean> {
    const actorId = getAuthUserId(req);
    const role = String((req as any).user?.role || '');
    if (!actorId || !mongoose.Types.ObjectId.isValid(versionId)) return false;
    if (role === 'admin') return true;
    if (role !== 'supervisor') return false;
    const [ownsVersion, supervisesTask] = await Promise.all([
      DatasetVersion.exists({ _id: versionId, ownerId: actorId }),
      DatasetAssignmentSubmission.exists({ datasetVersionId: versionId, supervisor: actorId, active: { $ne: false } }),
    ]);
    return Boolean(ownsVersion || supervisesTask);
  }

  private async canCheckerAccessSample(actorId: string, versionId: string, sampleId: string): Promise<boolean> {
    return Boolean(await DatasetSampleAssignment.exists({
      datasetVersionId: versionId,
      sampleId,
      checkerId: actorId,
      active: { $ne: false },
    }));
  }

  private async findTaskSupervisorId(versionId: string, assigneeId: unknown): Promise<string | undefined> {
    const normalizedAssigneeId = String(assigneeId || '');
    if (!mongoose.Types.ObjectId.isValid(versionId) || !mongoose.Types.ObjectId.isValid(normalizedAssigneeId)) return undefined;
    const submission = await DatasetAssignmentSubmission.findOne({
      datasetVersionId: versionId,
      assigneeId: normalizedAssigneeId,
      active: { $ne: false },
      supervisor: { $nin: [null, ''] },
    }).select('supervisor').sort({ createdAt: -1 }).lean();
    const supervisorId = String((submission as any)?.supervisor || '');
    return mongoose.Types.ObjectId.isValid(supervisorId) ? supervisorId : undefined;
  }

  async getLabelingStatus(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { versionId } = req.params;
      const result = await qualityService.getLabelingStatus(versionId, ownerId);
      res.json(result);
    } catch (error: any) {
      console.error('Get labeling status error:', error);
      res.status(error.statusCode || 500).json({
        error: error.message || 'Failed to get labeling status',
      });
    }
  }

  async updateIncompleteBucket(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { versionId } = req.params;
      const rawBucket = req.body?.bucket;
      const bucket = rawBucket === null || rawBucket === undefined || rawBucket === ''
        ? null
        : String(rawBucket);

      if (bucket !== null && !['Gold', 'Rewrite', 'Reject', 'Incomplete'].includes(bucket)) {
        res.status(400).json({ error: "bucket must be one of 'Gold', 'Rewrite', 'Reject', 'Incomplete' or null" });
        return;
      }

      const result = await qualityService.updateIncompleteBucket(versionId, ownerId, bucket as any);
      res.json({
        message: bucket
          ? `Incomplete samples will be placed in ${bucket}.`
          : 'Incomplete sample bucket override cleared.',
        ...result,
      });
    } catch (error: any) {
      console.error('Update incomplete bucket error:', error);
      res.status(error.statusCode || 500).json({
        error: error.message || 'Failed to update incomplete bucket',
      });
    }
  }

  async classify(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { versionId } = req.params;
      const result = await qualityService.classify(versionId, ownerId, undefined, { tagRejects: true });
      res.json(result);
    } catch (error: any) {
      console.error('Quality classification error:', error);
      res.status(error.statusCode || 500).json({
        error: error.message || 'Quality classification failed',
      });
    }
  }

  async getQualitySamples(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { versionId } = req.params;
      const group = req.query.group ? String(req.query.group) : undefined;
      const result = await qualityService.classify(versionId, ownerId, group);
      const requestedPage = Number.parseInt(String(req.query.page || ''), 10);
      const requestedLimit = Number.parseInt(String(req.query.limit || ''), 10);
      if (Number.isFinite(requestedPage) || Number.isFinite(requestedLimit)) {
        const page = Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1);
        const limit = Math.min(200, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 25));
        const totalItems = result.items.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / limit));
        const safePage = Math.min(page, totalPages);
        res.json({
          ...result,
          items: result.items.slice((safePage - 1) * limit, safePage * limit),
          pagination: { page: safePage, limit, totalItems, totalPages },
        });
        return;
      }
      res.json(result);
    } catch (error: any) {
      console.error('Get quality samples error:', error);
      res.status(error.statusCode || 500).json({
        error: error.message || 'Failed to get quality samples',
      });
    }
  }

  async submitReview(req: Request, res: Response): Promise<void> {
    try {
      const reviewerId = getAuthUserId(req);
      if (!reviewerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { versionId } = req.params;
      const { sampleId, qualityClassification, ratings, errors, note } = req.body;

      if (!sampleId || !qualityClassification || !ratings) {
        res.status(400).json({ error: 'Missing required review fields.' });
        return;
      }

      const result = await qualityService.submitReview(versionId, reviewerId, sampleId, {
        qualityClassification,
        ratings,
        errors,
        note,
      });

      res.json({ message: 'Review submitted successfully', review: result });
    } catch (error: any) {
      console.error('Submit review error:', error);
      res.status(error.statusCode || 500).json({
        error: error.message || 'Failed to submit review',
      });
    }
  }

  async getSampleReviews(req: Request, res: Response): Promise<void> {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { versionId, sampleId } = req.params;
      const result = await qualityService.getSampleReviews(versionId, sampleId);
      res.json(result);
    } catch (error: any) {
      console.error('Get sample reviews error:', error);
      res.status(error.statusCode || 500).json({
        error: error.message || 'Failed to get sample reviews',
      });
    }
  }

  async adjudicate(req: Request, res: Response): Promise<void> {
    try {
      const supervisorId = getAuthUserId(req);
      if (!supervisorId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { versionId } = req.params;
      const { sampleId, finalClassification, note } = req.body;

      if (!sampleId || !finalClassification) {
        res.status(400).json({ error: 'Missing required adjudication fields.' });
        return;
      }

      const result = await qualityService.adjudicate(versionId, supervisorId, sampleId, finalClassification, note);
      res.json({ message: 'Adjudication submitted successfully', adjudication: result });
    } catch (error: any) {
      console.error('Adjudicate quality error:', error);
      res.status(error.statusCode || 500).json({
        error: error.message || 'Adjudication failed',
      });
    }
  }

  async getStatistics(req: Request, res: Response): Promise<void> {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { versionId } = req.params;
      const result = await qualityService.getStatistics(versionId);
      res.json(result);
    } catch (error: any) {
      console.error('Get quality statistics error:', error);
      res.status(error.statusCode || 500).json({
        error: error.message || 'Failed to get statistics',
      });
    }
  }

  async listRewriteAssignments(req: Request, res: Response): Promise<void> {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const { versionId } = req.params;
      const query: any = { datasetVersionId: new mongoose.Types.ObjectId(versionId), sourceQualityBucket: 'Rewrite' };
      const role = (req as any).user?.role;
      if (role === 'supervisor' && !(await this.canManageVersion(req, versionId))) {
        res.status(403).json({ error: 'Supervisor can only view rewrite tasks in versions they manage.' });
        return;
      }
      if (role === 'checker') {
        query.checkerId = new mongoose.Types.ObjectId(userId);
      } else if (!isManager(req)) {
        query.assigneeId = new mongoose.Types.ObjectId(userId);
      }
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 500));
      const [tasks, total] = await Promise.all([Stage4RewriteAssignment.find(query)
        .populate('assigneeId', 'name email')
        .populate('checkerId', 'name email')
        .populate('sampleId')
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(), Stage4RewriteAssignment.countDocuments(query)]);
      const version = await DatasetVersion.findById(versionId).select('projectName versionName versionNo').lean();
      res.json({
        tasks: tasks.map((task) => ({
          ...this.serializeRewriteTask(task),
          projectName: version?.projectName || '',
          dataset: version?.projectName || '',
          versionName: version?.versionName || (version?.versionNo ? `v${version.versionNo}` : ''),
        })),
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
      });
    } catch (error: any) {
      console.error('List rewrite assignments error:', error);
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to list rewrite assignments' });
    }
  }

  async assignRewrite(req: Request, res: Response): Promise<void> {
    try {
      const actorId = getAuthUserId(req);
      if (!actorId || !isAssignmentReviewer(req)) {
        res.status(actorId ? 403 : 401).json({ error: actorId ? 'Checker permission required' : 'Unauthorized' });
        return;
      }
      const { versionId } = req.params;
      const { sampleId, assigneeId, checkerId, convId, subject, reason, reasonSource, originalText } = req.body;
      const contextMode: RewriteContextMode = REWRITE_CONTEXT_MODES.includes(req.body?.contextMode)
        ? req.body.contextMode
        : 'n-2:n+3';
      if (!mongoose.Types.ObjectId.isValid(sampleId) || !mongoose.Types.ObjectId.isValid(assigneeId)) {
        res.status(400).json({ error: 'Invalid sampleId or assigneeId' });
        return;
      }
      const actorRole = String((req as any).user?.role || '');
      if (actorRole === 'supervisor' && !(await this.canManageVersion(req, versionId))) {
        res.status(403).json({ error: 'Supervisor can only assign rewrites in versions they manage.' });
        return;
      }
      if (actorRole === 'checker' && !(await this.canCheckerAccessSample(actorId, versionId, sampleId))) {
        res.status(403).json({ error: 'Checker can only create rewrites for samples assigned to them.' });
        return;
      }
      if (actorRole === 'checker' && checkerId && String(checkerId) !== String(actorId)) {
        res.status(403).json({ error: 'Checker cannot transfer a rewrite to another Checker.' });
        return;
      }
      if (checkerId && !mongoose.Types.ObjectId.isValid(checkerId)) {
        res.status(400).json({ error: 'Invalid checkerId' });
        return;
      }
      const staff = await User.findOne({ _id: assigneeId, role: 'staff', status: 'active' }).lean();
      if (!staff) {
        res.status(404).json({ error: 'Active staff not found' });
        return;
      }
      const item = await ProcessedDatasetItem.findOne({ _id: sampleId, datasetVersionId: versionId }).lean();
      if (!item) {
        res.status(404).json({ error: 'Sample not found in this dataset version' });
        return;
      }
      await this.ensureRewriteAssignmentIndexes();
      const itemMessages = Array.isArray((item.data as any)?.messages) ? (item.data as any).messages : [];
      const targetText = String(originalText || '').trim();
      const parsedTargetIndex = Number(req.body?.targetMessageIndex);
      const targetIndex = Number.isInteger(parsedTargetIndex) && parsedTargetIndex >= 0
        ? parsedTargetIndex
        : itemMessages.findIndex((message: any) => targetText && String(message?.content || '').trim() === targetText);
      const conversationMessages = this.buildRewriteContextMessages(itemMessages, targetIndex, contextMode);

      const existingTask = await Stage4RewriteAssignment.findOne({
        datasetVersionId: versionId,
        sampleId,
        targetMessageIndex: targetIndex >= 0 ? targetIndex : null,
      }).select('status').lean();
      if (existingTask && ['submitted', 'checker_approved', 'approved'].includes(String(existingTask.status))) {
        res.status(409).json({ error: `A ${existingTask.status} rewrite cannot be reassigned or overwritten.` });
        return;
      }
      
      const origAssignment = await DatasetSampleAssignment.findOne({
        datasetVersionId: versionId,
        sampleId,
        active: true
      }).select('checkerId').lean();
      const resolvedCheckerId = actorRole === 'checker'
        ? actorId
        : await this.resolveActiveCheckerId(checkerId, origAssignment?.checkerId ? String(origAssignment.checkerId) : undefined);
      if (!resolvedCheckerId) {
        res.status(400).json({ error: 'A specific active Checker must be assigned to this rewrite task.' });
        return;
      }
      const checker = await User.findOne({
        _id: resolvedCheckerId,
        role: 'checker',
        status: 'active',
      }).select('_id').lean();
      if (!checker) {
        res.status(400).json({ error: 'Assigned Checker is not active or does not have the Checker role.' });
        return;
      }

      const task = await Stage4RewriteAssignment.findOneAndUpdate(
        { datasetVersionId: versionId, sampleId, targetMessageIndex: targetIndex >= 0 ? targetIndex : null },
        {
          datasetVersionId: new mongoose.Types.ObjectId(versionId),
          sampleId: new mongoose.Types.ObjectId(sampleId),
          assigneeId: new mongoose.Types.ObjectId(assigneeId),
          ...(resolvedCheckerId ? { checkerId: new mongoose.Types.ObjectId(resolvedCheckerId) } : {}),
          assignedBy: new mongoose.Types.ObjectId(actorId),
          convId: convId || String((item as any).sampleId || sampleId),
          subject: subject || (item.data as any)?.subject || '',
          reason: reason || 'None',
          reasonSource: reasonSource || 'Quality Review (system aggregate)',
          sourceQualityBucket: 'Rewrite',
          originalText: originalText || '',
          targetMessageIndex: targetIndex >= 0 ? targetIndex : null,
          contextMode,
          conversationMessages,
          submittedText: '',
          status: 'assigned',
          reviewedBy: undefined,
          reviewNote: '',
          submittedAt: undefined,
          reviewedAt: undefined,
        },
        { upsert: true, new: true }
      ).populate('assigneeId', 'name email').populate('checkerId', 'name email');
      await this.notify({
        versionId,
        actorId,
        recipientId: assigneeId,
        type: 'info',
        message: `Rewrite assigned for ${convId || sampleId}.`,
      });
      res.json({ task: this.serializeRewriteTask(task) });
    } catch (error: any) {
      console.error('Assign rewrite error:', error);
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to assign rewrite' });
    }
  }

  async bulkAssignRewrite(req: Request, res: Response): Promise<void> {
    try {
      const actorId = getAuthUserId(req);
      if (!actorId || !isManager(req)) {
        res.status(actorId ? 403 : 401).json({ error: actorId ? 'Manager role required' : 'Unauthorized' });
        return;
      }
      const { versionId } = req.params;
      if (!(await this.canManageVersion(req, versionId))) {
        res.status(403).json({ error: 'Manager cannot modify rewrite tasks in this version.' });
        return;
      }
      const assignments = Array.isArray(req.body?.assignments) ? req.body.assignments : [];
      if (!mongoose.Types.ObjectId.isValid(versionId) || assignments.length === 0 || assignments.length > 1000) {
        res.status(400).json({ error: 'Bulk assignment requires 1-1000 valid items.' });
        return;
      }
      const invalidRow = assignments.find((row: any) =>
        !mongoose.Types.ObjectId.isValid(row?.sampleId) || !mongoose.Types.ObjectId.isValid(row?.assigneeId)
      );
      if (invalidRow) {
        res.status(400).json({ error: 'Every item requires valid sampleId and assigneeId.' });
        return;
      }
      const keys = assignments.map((row: any) => `${row.sampleId}:${Number.isInteger(Number(row.targetMessageIndex)) ? Number(row.targetMessageIndex) : 'null'}`);
      if (new Set(keys).size !== keys.length) {
        res.status(400).json({ error: 'A rewrite target may only be assigned to one Staff.' });
        return;
      }
      const staffIds: string[] = [...new Set<string>(assignments.map((row: any) => String(row.assigneeId)))];
      const sampleIds: string[] = [...new Set<string>(assignments.map((row: any) => String(row.sampleId)))];
      const [staff, samples, origAssignments] = await Promise.all([
        User.find({ _id: { $in: staffIds }, role: 'staff', status: 'active' }).select('_id').lean(),
        ProcessedDatasetItem.find({ _id: { $in: sampleIds }, datasetVersionId: versionId }).lean(),
        DatasetSampleAssignment.find({
          datasetVersionId: versionId,
          sampleId: { $in: sampleIds },
          active: true
        }).select('sampleId checkerId').lean()
      ]);
      if (staff.length !== staffIds.length || samples.length !== sampleIds.length) {
        res.status(400).json({ error: 'Batch contains inactive Staff or samples outside this dataset version.' });
        return;
      }
      
      const sampleCheckerMap = new Map<string, string>();
      origAssignments.forEach((assign: any) => {
        if (assign.checkerId) {
          sampleCheckerMap.set(String(assign.sampleId), String(assign.checkerId));
        }
      });
      const resolvedCheckerIds = await Promise.all(assignments.map((row: any) => this.resolveActiveCheckerId(
        row.checkerId,
        sampleCheckerMap.get(String(row.sampleId))
      )));
      if (resolvedCheckerIds.some((id: string) => !mongoose.Types.ObjectId.isValid(id))) {
        res.status(400).json({ error: 'Every rewrite item must have a specific Checker assignment.' });
        return;
      }
      const uniqueCheckerIds = [...new Set<string>(resolvedCheckerIds)];
      const activeCheckers = await User.find({
        _id: { $in: uniqueCheckerIds },
        role: 'checker',
        status: 'active',
      }).select('_id').lean();
      if (activeCheckers.length !== uniqueCheckerIds.length) {
        res.status(400).json({ error: 'Batch contains an inactive user or a non-Checker reviewer.' });
        return;
      }

      const existingTasks = await Stage4RewriteAssignment.find({
        datasetVersionId: versionId,
        sampleId: { $in: sampleIds },
        status: { $in: ['submitted', 'checker_approved', 'approved'] },
      }).select('sampleId targetMessageIndex status').lean();
      const hasLockedTarget = assignments.some((row: any) => {
        const parsedIndex = Number(row.targetMessageIndex);
        const targetIndex = Number.isInteger(parsedIndex) && parsedIndex >= 0 ? parsedIndex : null;
        return existingTasks.some((task: any) =>
          String(task.sampleId) === String(row.sampleId)
          && (task.targetMessageIndex == null ? null : Number(task.targetMessageIndex)) === targetIndex
        );
      });
      if (hasLockedTarget) {
        res.status(409).json({ error: 'Batch contains a submitted or approved rewrite target that cannot be overwritten.' });
        return;
      }

      await this.ensureRewriteAssignmentIndexes();
      const sampleMap = new Map(samples.map((sample: any) => [String(sample._id), sample]));
      const operations = assignments.map((row: any, rowIndex: number) => {
        const sample: any = sampleMap.get(String(row.sampleId));
        const messages = Array.isArray(sample?.data?.messages) ? sample.data.messages : [];
        const parsedIndex = Number(row.targetMessageIndex);
        const targetIndex = Number.isInteger(parsedIndex) && parsedIndex >= 0 ? parsedIndex : null;
        const contextMode: RewriteContextMode = REWRITE_CONTEXT_MODES.includes(row.contextMode) ? row.contextMode : 'n-2:n+3';
        const originalText = String(row.originalText || (targetIndex !== null ? messages[targetIndex]?.content : '') || '');
        
        const updateFields: any = {
          assigneeId: new mongoose.Types.ObjectId(row.assigneeId),
          assignedBy: new mongoose.Types.ObjectId(actorId),
          convId: String(row.convId || sample.sampleId || row.sampleId),
          subject: String(row.subject || sample?.data?.subject || ''),
          reason: String(row.reason || 'None'),
          reasonSource: String(row.reasonSource || 'Quality Review (system aggregate)'),
          sourceQualityBucket: 'Rewrite',
          originalText,
          targetMessageIndex: targetIndex,
          contextMode,
          conversationMessages: this.buildRewriteContextMessages(messages, targetIndex ?? -1, contextMode),
          submittedText: '',
          status: 'assigned',
          reviewNote: '',
          checkerReviewNote: ''
        };
        
        updateFields.checkerId = new mongoose.Types.ObjectId(resolvedCheckerIds[rowIndex]);

        return {
          updateOne: {
            filter: {
              datasetVersionId: new mongoose.Types.ObjectId(versionId),
              sampleId: new mongoose.Types.ObjectId(row.sampleId),
              targetMessageIndex: targetIndex
            },
            update: {
              $set: updateFields,
              $unset: { reviewedBy: '', submittedAt: '', reviewedAt: '', checkerReviewedAt: '' },
              $setOnInsert: {
                datasetVersionId: new mongoose.Types.ObjectId(versionId),
                sampleId: new mongoose.Types.ObjectId(row.sampleId)
              }
            },
            upsert: true
          }
        };
      });
      await Stage4RewriteAssignment.bulkWrite(operations, { ordered: true });
      await Promise.all(staffIds.map((recipientId) => this.notify({ versionId, actorId, recipientId, type: 'info', message: `You received rewrite tasks in a batch of ${assignments.length} items.` })));
      res.json({ success: true, assignedCount: assignments.length, requestedCount: assignments.length });
    } catch (error: any) {
      console.error('Bulk assign rewrite error:', error);
      res.status(500).json({ error: error.message || 'Failed to bulk assign rewrite tasks' });
    }
  }

  async listMyRewriteAssignments(req: Request, res: Response): Promise<void> {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const query: any = { sourceQualityBucket: 'Rewrite' };
      const role = (req as any).user?.role;
      if (role === 'checker') {
        query.checkerId = new mongoose.Types.ObjectId(userId);
      } else if (role === 'supervisor') {
        const [ownedVersions, supervisedVersions] = await Promise.all([
          DatasetVersion.find({ ownerId: userId }).distinct('_id'),
          DatasetAssignmentSubmission.find({ supervisor: userId, active: { $ne: false } }).distinct('datasetVersionId'),
        ]);
        query.datasetVersionId = { $in: [...ownedVersions, ...supervisedVersions] };
      } else if (!isManager(req)) {
        query.assigneeId = new mongoose.Types.ObjectId(userId);
      }
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 500));
      const [tasks, total] = await Promise.all([Stage4RewriteAssignment.find(query)
        .populate('assigneeId', 'name email')
        .populate('checkerId', 'name email')
        .populate('sampleId')
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(), Stage4RewriteAssignment.countDocuments(query)]);
      const versionIds = Array.from(new Set(tasks.map((task: any) => String(task.datasetVersionId)).filter(Boolean)));
      const versions = await DatasetVersion.find({ _id: { $in: versionIds } }).select('projectName versionName versionNo').lean();
      const versionMap = new Map(versions.map((version: any) => [String(version._id), version]));
      const submissions = await DatasetAssignmentSubmission.find({ datasetVersionId: { $in: versionIds } })
        .select('datasetVersionId assigneeId name dataset version batchStart batchCount deadline supervisor priority')
        .sort({ createdAt: -1 })
        .lean();
      const submissionByVersionAndStaff = new Map<string, any>();
      const submissionByVersion = new Map<string, any>();
      submissions.forEach((submission: any) => {
        const versionKey = String(submission.datasetVersionId);
        const exactKey = `${versionKey}:${String(submission.assigneeId)}`;
        if (!submissionByVersionAndStaff.has(exactKey)) submissionByVersionAndStaff.set(exactKey, submission);
        if (!submissionByVersion.has(versionKey)) submissionByVersion.set(versionKey, submission);
      });
      const supervisorIds = Array.from(new Set(submissions.map((submission: any) => String(submission.supervisor || '')).filter((id) => mongoose.Types.ObjectId.isValid(id))));
      const supervisors = await User.find({ _id: { $in: supervisorIds } }).select('name email').lean();
      const supervisorMap = new Map(supervisors.map((supervisor: any) => [String(supervisor._id), supervisor.name || supervisor.email]));
      res.json({
        tasks: tasks.map((task) => {
          const version = versionMap.get(String(task.datasetVersionId));
          const sourceAssignment = submissionByVersionAndStaff.get(`${String(task.datasetVersionId)}:${String((task as any).assigneeId?._id || (task as any).assigneeId)}`)
            || submissionByVersion.get(String(task.datasetVersionId));
          return {
            ...this.serializeRewriteTask(task),
            datasetVersionId: String(task.datasetVersionId),
            projectName: version?.projectName || '',
            dataset: version?.projectName || '',
            versionName: version?.versionName || (version?.versionNo ? `v${version.versionNo}` : ''),
            sourceTaskName: sourceAssignment?.name || '',
            sourceDataset: sourceAssignment?.dataset || version?.projectName || '',
            sourceVersion: sourceAssignment?.version || '',
            batchStart: Number(sourceAssignment?.batchStart || 1),
            batchCount: Number(sourceAssignment?.batchCount || 0),
            deadline: sourceAssignment?.deadline || null,
            priority: sourceAssignment?.priority || 'medium',
            supervisor: supervisorMap.get(String(sourceAssignment?.supervisor || '')) || sourceAssignment?.supervisor || '',
          };
        }),
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
      });
    } catch (error: any) {
      console.error('List my rewrite assignments error:', error);
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to list rewrite assignments' });
    }
  }

  async listMyNotifications(req: Request, res: Response): Promise<void> {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const role = (req as any).user?.role;
      // Backfill assignment notices created before auto-assign started emitting
      // per-user notifications. This also repairs the user's current test task.
      if (role === 'staff') {
        const assignedTasks = await DatasetAssignmentSubmission.find({ assigneeId: userId })
          .select('_id datasetVersionId name totalSamples createdAt')
          .sort({ createdAt: -1 })
          .limit(30)
          .lean();
        for (const task of assignedTasks) {
          const message = `Bạn được giao task "${task.name}" (${Number(task.totalSamples || 0)} mẫu).`;
          await Stage4Notification.updateOne(
            { datasetVersionId: task.datasetVersionId, recipientId: new mongoose.Types.ObjectId(userId), assignmentRef: task._id } as any,
            { $setOnInsert: { datasetVersionId: task.datasetVersionId, recipientId: new mongoose.Types.ObjectId(userId), type: 'info', message, assignmentRef: task._id, createdAt: (task as any).createdAt || new Date() } } as any,
            { upsert: true }
          );
        }
        // Old auto-assign code created a second role-less message without an
        // assignment reference. Backfilled records above supersede it.
        await Stage4Notification.deleteMany({
          recipientId: new mongoose.Types.ObjectId(userId),
          assignmentRef: { $exists: false },
          message: { $regex: '^Bạn được giao task ' },
        });
      }
      const recipientClauses: any[] = [{ recipientId: userId }];
      // Supervisor notifications are task-scoped and must target a concrete user.
      // Do not expose legacy role-wide notices to unrelated supervisors.
      if (role !== 'supervisor' && role !== 'checker') recipientClauses.push({ recipientRole: role });
      const notes = await Stage4Notification.find({
        $or: recipientClauses,
      }).sort({ createdAt: -1 }).limit(50).lean();
      res.json({ notifications: notes });
    } catch (error: any) {
      console.error('List my notifications error:', error);
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to list notifications' });
    }
  }

  async submitRewrite(req: Request, res: Response): Promise<void> {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const { versionId, taskId } = req.params;
      const { submittedText, expectedUpdatedAt } = req.body;
      if (!submittedText || !String(submittedText).trim()) {
        res.status(400).json({ error: 'submittedText is required' });
        return;
      }
      const task = await Stage4RewriteAssignment.findOne({
        _id: taskId,
        datasetVersionId: versionId,
        assigneeId: userId,
      }).populate('assigneeId', 'name email');
      if (!task) {
        res.status(404).json({ error: 'Rewrite task not found' });
        return;
      }
      if (!canStaffSubmitRewrite(String(task.status))) {
        res.status(409).json({ error: `Rewrite task cannot be submitted from status: ${task.status}` });
        return;
      }
      if (!task.checkerId) {
        res.status(409).json({ error: 'A Checker must be assigned before Staff can submit this rewrite.' });
        return;
      }
      if (expectedUpdatedAt) {
        const expectedTime = new Date(expectedUpdatedAt).getTime();
        const currentTime = new Date(task.updatedAt).getTime();
        if (!Number.isFinite(expectedTime) || expectedTime !== currentTime) {
          res.status(409).json({ error: 'Rewrite task đã thay đổi sau khi file được tải xuống. Hãy tải file mới trước khi nộp.' });
          return;
        }
      }
      const wasSubmitted = task.status === 'submitted';
      task.submittedText = String(submittedText).trim();
      task.status = 'submitted';
      task.submittedAt = new Date();
      await task.save();
      if (!wasSubmitted) {
        await this.notify({
          versionId,
          actorId: userId,
          recipientId: String(task.checkerId),
          type: 'success',
          message: `${(task.assigneeId as any)?.name || 'Staff'} đã nộp bài viết lại. Vui lòng kiểm duyệt.`,
        });
        await this.notify({
          versionId,
          actorId: userId,
          recipientRole: 'admin',
          type: 'success',
          message: `${(task.assigneeId as any)?.name || 'Staff'} submitted rewrite work. Open Assignment Review to see pending items.`,
        });
        const supervisorId = await this.findTaskSupervisorId(versionId, (task.assigneeId as any)?._id || task.assigneeId);
        if (supervisorId) await this.notify({
          versionId,
          actorId: userId,
          recipientId: supervisorId,
          type: 'success',
          message: `${(task.assigneeId as any)?.name || 'Staff'} submitted rewrite work. Open Assignment Review to see pending items.`,
        });
      }
      res.json({ task: this.serializeRewriteTask(task) });
    } catch (error: any) {
      console.error('Submit rewrite error:', error);
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to submit rewrite' });
    }
  }

  async adminSubmitRewrite(req: Request, res: Response): Promise<void> {
    try {
      const actorId = getAuthUserId(req);
      if (!actorId || String((req as any).user?.role || '') !== 'admin') {
        res.status(actorId ? 403 : 401).json({ error: actorId ? 'Admin role required' : 'Unauthorized' });
        return;
      }
      const { versionId } = req.params;
      const { sampleId, submittedText, reason, targetMessageIndex } = req.body;
      if (!sampleId || !mongoose.Types.ObjectId.isValid(String(sampleId))) {
        res.status(400).json({ error: 'sampleId is required' });
        return;
      }
      if (!submittedText || !String(submittedText).trim()) {
        res.status(400).json({ error: 'submittedText is required' });
        return;
      }

      const sample = await ProcessedDatasetItem.findOne({ _id: sampleId, datasetVersionId: versionId }).lean();
      if (!sample) {
        res.status(404).json({ error: 'Sample not found in this dataset version' });
        return;
      }

      const messages = Array.isArray((sample as any).data?.messages) ? (sample as any).data.messages : [];
      let messageIndex = Number(targetMessageIndex);
      if (!Number.isInteger(messageIndex) || messageIndex < 0 || !messages[messageIndex]) {
        messageIndex = -1;
        for (let i = messages.length - 1; i >= 0; i -= 1) {
          if (messages[i]?.role === 'assistant') {
            messageIndex = i;
            break;
          }
        }
      }
      if (messageIndex < 0 || !messages[messageIndex] || messages[messageIndex]?.role !== 'assistant') {
        res.status(400).json({ error: 'No assistant message found to rewrite' });
        return;
      }

      const originalText = String(messages[messageIndex]?.content || messages[messageIndex]?.text || '');
      await ConversationRewriteHistory.findOneAndUpdate(
        {
          datasetVersionId: new mongoose.Types.ObjectId(versionId),
          sampleId: new mongoose.Types.ObjectId(String(sampleId)),
          messageIndex,
        },
        {
          datasetVersionId: new mongoose.Types.ObjectId(versionId),
          sampleId: new mongoose.Types.ObjectId(String(sampleId)),
          messageIndex,
          originalText,
          proposedText: String(submittedText).trim(),
          approvedText: String(submittedText).trim(),
          editorId: new mongoose.Types.ObjectId(actorId),
          editReason: String(reason || 'Admin self rewrite'),
          editType: 'manual',
        },
        { upsert: true, new: true }
      );

      const task = await Stage4RewriteAssignment.findOneAndUpdate(
        {
          datasetVersionId: new mongoose.Types.ObjectId(versionId),
          sampleId: new mongoose.Types.ObjectId(String(sampleId)),
          targetMessageIndex: messageIndex,
        },
        {
          $set: {
            datasetVersionId: new mongoose.Types.ObjectId(versionId),
            sampleId: new mongoose.Types.ObjectId(String(sampleId)),
            assigneeId: new mongoose.Types.ObjectId(actorId),
            assignedBy: new mongoose.Types.ObjectId(actorId),
            convId: String((sample as any).sampleId || sampleId),
            subject: String((sample as any).data?.subject || ''),
            reason: String(reason || 'Admin self rewrite'),
            originalText,
            targetMessageIndex: messageIndex,
            contextMode: 'n-2:n+3',
            conversationMessages: this.buildRewriteContextMessages(messages, messageIndex, 'n-2:n+3'),
            submittedText: String(submittedText).trim(),
            status: 'approved',
            reviewedBy: new mongoose.Types.ObjectId(actorId),
            submittedAt: new Date(),
            reviewedAt: new Date(),
            reviewNote: 'Admin self rewrite',
          },
        },
        { upsert: true, new: true }
      ).populate('assigneeId', 'name email');

      res.json({ task: this.serializeRewriteTask(task) });
    } catch (error: any) {
      console.error('Admin submit rewrite error:', error);
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to save admin rewrite' });
    }
  }

  async validateRewrite(req: Request, res: Response): Promise<void> {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const { versionId, taskId } = req.params;
      const { submittedText } = req.body;
      if (!submittedText || !String(submittedText).trim()) {
        res.status(400).json({ error: 'submittedText is required' });
        return;
      }

      const task = await Stage4RewriteAssignment.findOne({
        _id: taskId,
        datasetVersionId: versionId,
        assigneeId: userId,
      }).lean();

      if (!task) {
        res.status(404).json({ error: 'Rewrite task not found' });
        return;
      }

      // Reconstruct messages with the submitted text
      const messages = [...(task.conversationMessages || [])].map((m: any, index: number) => ({
        messageIndex: index,
        role: m.role as 'user' | 'assistant',
        content: m.isTarget ? String(submittedText).trim() : m.content,
      }));

      // Find the target message index (assume it's the last assistant message if not marked)
      const targetIndex = messages.findIndex(m => (task.conversationMessages as any)?.[m.messageIndex]?.isTarget) !== -1 
        ? messages.findIndex(m => (task.conversationMessages as any)?.[m.messageIndex]?.isTarget)
        : messages.map(m => m.role).lastIndexOf('assistant');

      if (targetIndex === -1) {
        res.json({ pass: true, reason: 'No assistant target found to evaluate.' });
        return;
      }

      // We need to fetch the previous user intent to know what actions are expected
      // The previous user message is usually at targetIndex - 1
      let expectedActions: string[] = [];
      let previousUserIntent = 'ANSWER_ATTEMPT';

      if (targetIndex > 0 && messages[targetIndex - 1].role === 'user') {
        const userMsgIndexInSample = (task as any).targetMessageIndex ? (task as any).targetMessageIndex - 1 : targetIndex - 1;
        const userLabels = await LabelAssignment.find({
          sampleId: task.sampleId,
          messageIndex: userMsgIndexInSample,
          messageRole: 'user',
        }).lean();
        
        if (userLabels.length > 0) {
          // Assume the first one is the intent
          previousUserIntent = String(userLabels[0].name || '').toUpperCase();
          const { VALID_ACTIONS } = await import('./quality.service.js');
          if (VALID_ACTIONS[previousUserIntent]) {
            expectedActions = Array.from(VALID_ACTIONS[previousUserIntent]);
          }
        }
      }

      // Run AutoLabelV2Service to predict the action for the submitted text
      const providerName = String(req.body?.provider || 'gemini');
      const model = typeof req.body?.model === 'string' ? req.body.model.trim() : undefined;
      const provider = await apiKeyService.createProvider(userId, providerName, true, model || undefined);
      const autoLabelService = new AutoLabelV2Service(provider);
      
      let suggestion;
      try {
        suggestion = await autoLabelService.preview(messages);
      } catch (err: any) {
        res.status(502).json({ error: 'AI Evaluation failed: ' + (err.message || 'Unknown error') });
        return;
      }

      const assistantLabel = suggestion.messages.find((m: any) => m.messageIndex === targetIndex);
      if (!assistantLabel || !assistantLabel.action) {
        res.json({ pass: false, error: 'Không thể nhận diện nhãn hành động (Action) cho câu trả lời này.' });
        return;
      }

      const action = assistantLabel.action;
      
      // Check harmful actions
      const { HARMFUL_ACTIONS } = await import('./quality.service.js');
      const harmfulSet = HARMFUL_ACTIONS[previousUserIntent];
      if (harmfulSet && harmfulSet.has(action)) {
        res.json({ 
          pass: false, 
          error: `Hành động "${action}" được coi là độc hại (Harmful) đối với intent "${previousUserIntent}". Vui lòng sửa lại cách tiếp cận.` 
        });
        return;
      }

      // Check expected actions
      if (expectedActions.length > 0 && !expectedActions.includes(action)) {
        res.json({ 
          pass: false, 
          error: `Hành động "${action}" không khớp với yêu cầu của học sinh (Intent: ${previousUserIntent}). Các hành động hợp lệ: ${expectedActions.join(', ')}.` 
        });
        return;
      }

      res.json({ 
        pass: true, 
        message: `Phản hồi hợp lệ (Nhận diện hành động: ${action}).` 
      });

    } catch (error: any) {
      console.error('Validate rewrite error:', error);
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to validate rewrite' });
    }
  }

  async suggestRewrite(req: Request, res: Response): Promise<void> {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const { versionId, taskId } = req.params;
      const task = await Stage4RewriteAssignment.findOne({
        _id: taskId,
        datasetVersionId: versionId,
        assigneeId: userId,
      }).lean();
      if (!task) {
        res.status(404).json({ error: 'Rewrite task not found' });
        return;
      }

      const context = Array.isArray(task.conversationMessages) && task.conversationMessages.length
        ? task.conversationMessages
        : [{ role: 'assistant', content: task.originalText, isTarget: true }];
      const prompt = {
        task: 'Rewrite only the target AI tutor response. Do not rewrite student messages or non-target assistant turns.',
        reason: task.reason || 'Improve educational quality.',
        targetMessageIndex: task.targetMessageIndex,
        originalTargetResponse: task.originalText,
        conversationContext: context,
        requirements: [
          'Return a helpful tutor response in Vietnamese unless the original context is in another language.',
          'Prefer Socratic guidance, hints, and step-by-step scaffolding over giving the final answer too early.',
          'Keep the replacement concise, factual, and aligned with the conversation context.',
          'Return JSON only: {"suggestedText":"..."}',
        ],
      };
      const provider = await apiKeyService.createProvider(userId, 'gemini', true);
      const raw = await provider.generateContent(
        JSON.stringify(prompt, null, 2),
        undefined,
        'You are an educational QA assistant. Return only valid JSON with a single string field suggestedText.'
      );
      const first = raw.indexOf('{');
      const last = raw.lastIndexOf('}');
      const jsonText = first >= 0 && last > first ? raw.slice(first, last + 1) : raw;
      let parsed: any = {};
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        parsed = { suggestedText: raw };
      }
      const suggestedText = String(parsed?.suggestedText || '').trim();
      if (!suggestedText) {
        res.status(502).json({ error: 'AI did not return a rewrite suggestion.' });
        return;
      }
      res.json({ suggestedText });
    } catch (error: any) {
      console.error('Suggest rewrite error:', error);
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to generate rewrite suggestion' });
    }
  }

  async suggestRewriteGeneric(req: Request, res: Response): Promise<void> {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const { originalText, targetMessageIndex, messages, reason } = req.body;
      const context = Array.isArray(messages) && messages.length
        ? messages
        : [{ role: 'assistant', content: originalText, isTarget: true }];
      
      const prompt = {
        task: 'Rewrite only the target AI tutor response. Do not rewrite student messages or non-target assistant turns.',
        reason: reason || 'Improve educational quality.',
        targetMessageIndex: targetMessageIndex ?? 0,
        originalTargetResponse: originalText,
        conversationContext: context,
        requirements: [
          'Return a helpful tutor response in Vietnamese unless the original context is in another language.',
          'Prefer Socratic guidance, hints, and step-by-step scaffolding over giving the final answer too early.',
          'Keep the replacement concise, factual, and aligned with the conversation context.',
          'Return JSON only: {"suggestedText":"..."}',
        ],
      };

      const provider = await apiKeyService.createProvider(userId, 'gemini', true);
      const raw = await provider.generateContent(
        JSON.stringify(prompt, null, 2),
        undefined,
        'You are an educational QA assistant. Return only valid JSON with a single string field suggestedText.'
      );
      const first = raw.indexOf('{');
      const last = raw.lastIndexOf('}');
      const jsonText = first >= 0 && last > first ? raw.slice(first, last + 1) : raw;
      let parsed: any = {};
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        parsed = { suggestedText: raw };
      }
      const suggestedText = String(parsed?.suggestedText || '').trim();
      if (!suggestedText) {
        res.status(502).json({ error: 'AI did not return a rewrite suggestion.' });
        return;
      }
      res.json({ suggestedText });
    } catch (error: any) {
      console.error('Suggest rewrite generic error:', error);
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to generate generic rewrite suggestion' });
    }
  }

  async reviewRewrite(req: Request, res: Response): Promise<void> {
    try {
      const actorId = getAuthUserId(req);
      const actorRole = String((req as any).user?.role || '');
      if (!actorId || !['admin', 'checker'].includes(actorRole)) {
        res.status(actorId ? 403 : 401).json({ error: actorId ? 'Checker or Admin role required' : 'Unauthorized' });
        return;
      }
      const { versionId, taskId } = req.params;
      const { action, note } = req.body;
      if (!['approved', 'rejected', 'redo'].includes(action)) {
        res.status(400).json({ error: 'action must be approved, rejected, or redo' });
        return;
      }
      const task = await Stage4RewriteAssignment.findOne({ _id: taskId, datasetVersionId: versionId })
        .populate('assigneeId', 'name email');
      if (!task) {
        res.status(404).json({ error: 'Rewrite task not found' });
        return;
      }
      const previousStatus = task.status;
      if (action === 'approved' && !String(task.submittedText || '').trim()) {
        res.status(409).json({ error: 'Staff has not submitted rewritten text.' });
        return;
      }
      if ((action === 'redo' || action === 'rejected') && !String(note || '').trim()) {
        res.status(400).json({ error: 'A review note is required for redo or rejection.' });
        return;
      }

      const role = (req as any).user?.role;
      const isActorChecker = role === 'checker' && String(task.checkerId || '') === String(actorId);
      const isActorAdmin = role === 'admin';

      if (isActorChecker && canCheckerReviewRewrite(task.status)) {
        // Checker level review
        if (action === 'approved') {
          task.status = 'approved';
          task.checkerReviewedAt = new Date();
          task.checkerReviewNote = note || 'Checker approved';
          task.reviewedBy = new mongoose.Types.ObjectId(actorId);
          task.reviewNote = note || 'Checker approved';
          task.reviewedAt = new Date();
          await task.save();

          await ConversationRewriteHistory.findOneAndUpdate(
            { datasetVersionId: task.datasetVersionId, sampleId: task.sampleId, messageIndex: task.targetMessageIndex ?? 0 },
            { datasetVersionId: task.datasetVersionId, sampleId: task.sampleId, messageIndex: task.targetMessageIndex ?? 0, originalText: task.originalText, proposedText: task.submittedText, approvedText: task.submittedText, editorId: (task.assigneeId as any)?._id || task.assigneeId, editReason: task.reason || note || 'Checker approved rewrite', editType: 'manual' },
            { upsert: true, new: true }
          );

          const supervisorId = await this.findTaskSupervisorId(versionId, (task.assigneeId as any)?._id || task.assigneeId);
          if (supervisorId) await this.notify({
            versionId,
            actorId,
            recipientId: supervisorId,
            type: 'info',
            message: `Rewrite task for ${task.convId} was approved and published by Checker.`,
          });
        } else {
          task.status = action; // 'redo' or 'rejected'
          task.checkerReviewedAt = new Date();
          task.checkerReviewNote = note || '';
          await task.save();

          await this.notify({
            versionId,
            actorId,
            recipientId: String((task.assigneeId as any)?._id || task.assigneeId),
            type: 'warning',
            message: `Rewrite for ${task.convId} was rejected by Checker. Note: ${note}`,
          });
        }
      } else if (isActorAdmin) {
        // Admin-only emergency override. Normal approval belongs to Checker.
        if (task.status !== 'checker_approved' && task.status !== 'submitted' && task.status !== 'redo') {
          res.status(400).json({ error: `Không thể review task ở trạng thái: ${task.status}` });
          return;
        }

        if (action === 'approved') {
          task.status = 'approved';
          task.reviewedBy = new mongoose.Types.ObjectId(actorId);
          task.reviewNote = note || 'Admin override approved';
          task.reviewedAt = new Date();
          await task.save();

          await ConversationRewriteHistory.findOneAndUpdate(
            { datasetVersionId: task.datasetVersionId, sampleId: task.sampleId, messageIndex: task.targetMessageIndex ?? 0 },
            { datasetVersionId: task.datasetVersionId, sampleId: task.sampleId, messageIndex: task.targetMessageIndex ?? 0, originalText: task.originalText, proposedText: task.submittedText, approvedText: task.submittedText, editorId: (task.assigneeId as any)?._id || task.assigneeId, editReason: task.reason || note || 'Approved rewrite', editType: 'manual' },
            { upsert: true, new: true }
          );

          await this.notify({
            versionId,
            actorId,
            recipientId: String((task.assigneeId as any)?._id || task.assigneeId),
            type: 'success',
            message: `Rewrite for ${task.convId} was override-approved by Admin.`,
          });
        } else {
          task.status = action; // 'redo' or 'rejected'
          task.reviewedBy = new mongoose.Types.ObjectId(actorId);
          task.reviewNote = note || '';
          task.reviewedAt = new Date();
          await task.save();

          await this.notify({
            versionId,
            actorId,
            recipientId: String((task.assigneeId as any)?._id || task.assigneeId),
            type: 'warning',
            message: `Rewrite for ${task.convId} was rejected by Supervisor. Note: ${note}`,
          });
        }
      } else {
        res.status(403).json({ error: 'Bạn không có quyền thực hiện thao tác kiểm duyệt này.' });
        return;
      }

      const actor = await User.findById(actorId).select('name email').lean();
      if (actor) {
        const logAction = action === 'approved' ? 'rewrite_approved' : action === 'redo' ? 'rewrite_redo' : 'rewrite_rejected';
        await CheckerActivityLog.create({
          datasetVersionId: task.datasetVersionId,
          sampleId: (task.sampleId as any)?._id || task.sampleId,
          userId: new mongoose.Types.ObjectId(actorId),
          userName: actor.name || 'Unknown',
          userEmail: actor.email || 'unknown@test.com',
          action: logAction,
          targetScope: 'message',
          messageIndex: task.targetMessageIndex ?? null,
          messageRole: 'assistant',
          details: `${logAction}: ${task.convId}${note ? ` - ${note}` : ''}`,
          reason: String(note || ''),
          before: { status: previousStatus, text: task.originalText },
          after: { status: task.status, text: action === 'approved' ? task.submittedText : null },
        });
      }

      res.json({ task: this.serializeRewriteTask(task) });
    } catch (error: any) {
      console.error('Review rewrite error:', error);
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to review rewrite' });
    }
  }

  async autoBypassRewrite(req: Request, res: Response): Promise<void> {
    try {
      const actorId = getAuthUserId(req);
      const actorRole = String((req as any).user?.role || '').toLowerCase();
      if (!actorId || !['admin', 'supervisor'].includes(actorRole)) {
        res.status(actorId ? 403 : 401).json({ error: actorId ? 'Admin or Supervisor role required' : 'Unauthorized' });
        return;
      }
      const { versionId } = req.params;
      if (!(await this.canManageVersion(req, versionId))) {
        res.status(403).json({ error: 'Manager cannot auto-bypass rewrite tasks in this version.' });
        return;
      }
      const limit = Math.min(50, Math.max(1, Number(req.body?.limit) || 20));
      const requestedIds = Array.isArray(req.body?.taskIds) ? req.body.taskIds.filter((id: any) => mongoose.Types.ObjectId.isValid(String(id))) : [];
      const query: any = { datasetVersionId: versionId, status: { $in: ['assigned', 'redo', 'rejected'] } };
      if (requestedIds.length) query._id = { $in: requestedIds };
      const tasks = await Stage4RewriteAssignment.find(query).sort({ createdAt: 1 }).limit(limit);
      if (!tasks.length) {
        res.json({ processedCount: 0, failedCount: 0, failures: [] });
        return;
      }
      const provider = await apiKeyService.createProvider(actorId, 'gemini', true);
      const failures: Array<{ taskId: string; error: string }> = [];
      let processedCount = 0;
      for (const task of tasks) {
        try {
          const context = Array.isArray(task.conversationMessages) && task.conversationMessages.length
            ? task.conversationMessages
            : [{ role: 'assistant', content: task.originalText, isTarget: true }];
          const prompt = {
            task: 'Rewrite only the target AI tutor response.', reason: task.reason,
            originalTargetResponse: task.originalText, conversationContext: context,
            requirements: ['Use the conversation language.', 'Prefer Socratic guidance.', 'Be concise and factual.', 'Return JSON only: {"suggestedText":"..."}'],
          };
          const raw = await provider.generateContent(JSON.stringify(prompt), undefined, 'Return valid JSON only.');
          const first = raw.indexOf('{'); const last = raw.lastIndexOf('}');
          const parsed = JSON.parse(first >= 0 && last > first ? raw.slice(first, last + 1) : raw);
          const suggestedText = String(parsed?.suggestedText || '').trim();
          if (!suggestedText) throw new Error('AI returned empty rewrite');
          task.submittedText = suggestedText;
          task.status = 'approved';
          task.submittedAt = new Date();
          task.reviewedAt = new Date();
          task.reviewedBy = new mongoose.Types.ObjectId(actorId);
          task.reviewNote = 'Auto-Bypass: generated and approved by Admin configuration';
          await task.save();
          await ConversationRewriteHistory.findOneAndUpdate(
            { datasetVersionId: task.datasetVersionId, sampleId: task.sampleId, messageIndex: task.targetMessageIndex ?? 0 },
            { datasetVersionId: task.datasetVersionId, sampleId: task.sampleId, messageIndex: task.targetMessageIndex ?? 0, originalText: task.originalText, proposedText: suggestedText, approvedText: suggestedText, editorId: new mongoose.Types.ObjectId(actorId), editReason: task.reason || 'Auto-Bypass rewrite', editType: 'ai' },
            { upsert: true, new: true }
          );
          processedCount += 1;
        } catch (error: any) {
          failures.push({ taskId: String(task._id), error: error.message || 'Unknown AI error' });
        }
      }
      res.json({ processedCount, failedCount: failures.length, failures });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message || 'Auto-Bypass failed' });
    }
  }

  async remindRewrite(req: Request, res: Response): Promise<void> {
    try {
      const actorId = getAuthUserId(req);
      if (!actorId || !isManager(req)) {
        res.status(actorId ? 403 : 401).json({ error: actorId ? 'Manager role required' : 'Unauthorized' });
        return;
      }
      const { versionId, taskId } = req.params;
      if (!(await this.canManageVersion(req, versionId))) {
        res.status(403).json({ error: 'Manager cannot remind tasks in this version.' });
        return;
      }
      const task = await Stage4RewriteAssignment.findOne({ _id: taskId, datasetVersionId: versionId });
      if (!task) {
        res.status(404).json({ error: 'Rewrite task not found' });
        return;
      }
      await this.notify({
        versionId,
        actorId,
        recipientId: String(task.assigneeId),
        type: 'warning',
        message: `Reminder: rewrite task ${task.convId} is waiting for submission.`,
      });
      res.json({ ok: true });
    } catch (error: any) {
      console.error('Remind rewrite error:', error);
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to remind staff' });
    }
  }

  async listNotifications(req: Request, res: Response): Promise<void> {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const { versionId } = req.params;
      const role = (req as any).user?.role;
      const recipientClauses: any[] = [{ recipientId: userId }];
      if (role !== 'supervisor') recipientClauses.push({ recipientRole: role });
      const notes = await Stage4Notification.find({
        datasetVersionId: versionId,
        $or: recipientClauses,
      }).sort({ createdAt: -1 }).limit(20).lean();
      res.json({ notifications: notes });
    } catch (error: any) {
      console.error('List notifications error:', error);
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to list notifications' });
    }
  }

  async createNotification(req: Request, res: Response): Promise<void> {
    try {
      const actorId = getAuthUserId(req);
      if (!actorId || !isManager(req)) {
        res.status(actorId ? 403 : 401).json({ error: actorId ? 'Manager role required' : 'Unauthorized' });
        return;
      }
      const { versionId } = req.params;
      const { recipientId, recipientRole, type, message } = req.body;
      if (!message || (!recipientId && !recipientRole)) {
        res.status(400).json({ error: 'message and recipientId or recipientRole are required' });
        return;
      }
      await this.notify({
        versionId,
        actorId,
        recipientId,
        recipientRole,
        type: ['success', 'warning', 'info'].includes(type) ? type : 'info',
        message: String(message),
      });
      res.status(201).json({ ok: true });
    } catch (error: any) {
      console.error('Create notification error:', error);
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to create notification' });
    }
  }

  async markNotificationsRead(req: Request, res: Response): Promise<void> {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const { versionId } = req.params;
      const role = (req as any).user?.role;
      const recipientClauses: any[] = [{ recipientId: userId }];
      if (role !== 'supervisor') recipientClauses.push({ recipientRole: role });
      const result = await Stage4Notification.updateMany(
        {
          datasetVersionId: versionId,
          readAt: { $exists: false },
          $or: recipientClauses,
        },
        { $set: { readAt: new Date() } }
      );
      res.json({ ok: true, modifiedCount: result.modifiedCount || 0 });
    } catch (error: any) {
      console.error('Mark notifications read error:', error);
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to mark notifications read' });
    }
  }
}
