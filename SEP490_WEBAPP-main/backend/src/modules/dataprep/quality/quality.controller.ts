import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { getAuthUserId, isManager } from '../../../utils/auth';
import { QualityService } from './quality.service';
import { Stage4RewriteAssignment } from '../../../models/Stage4RewriteAssignment';
import { Stage4Notification } from '../../../models/Stage4Notification';
import { ProcessedDatasetItem } from '../../../models/ProcessedDatasetItem';
import { User } from '../../../models/User';
import { GeminiProvider } from '../../../services/providers/GeminiProvider';

const qualityService = new QualityService();
const REWRITE_CONTEXT_MODES = ['n-2:n+2', 'n-1:n+1', 'n-1:n', 'target-only', 'full'] as const;
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
      originalText: task.originalText || '',
      targetMessageIndex: Number.isInteger(Number(task.targetMessageIndex)) ? Number(task.targetMessageIndex) : null,
      contextMode: task.contextMode || 'n-2:n+2',
      conversationMessages: Array.isArray(task.conversationMessages) && task.conversationMessages.length
        ? task.conversationMessages
        : fallbackConversationMessages,
      submittedText: task.submittedText || '',
      status: task.status,
      staffName: task.assigneeId?.name || task.assigneeId?.email || String(task.assigneeId),
      assigneeId: String(task.assigneeId?._id || task.assigneeId),
      updatedAt: task.updatedAt,
      submittedAt: task.submittedAt,
      reviewedAt: task.reviewedAt,
      reviewNote: task.reviewNote || '',
    };
  }

  private async notify(params: {
    versionId: string;
    actorId?: string;
    recipientId?: string;
    recipientRole?: 'admin' | 'supervisor' | 'staff';
    type?: 'info' | 'success' | 'warning';
    message: string;
  }) {
    await Stage4Notification.create({
      datasetVersionId: new mongoose.Types.ObjectId(params.versionId),
      actorId: params.actorId && mongoose.Types.ObjectId.isValid(params.actorId) ? new mongoose.Types.ObjectId(params.actorId) : undefined,
      recipientId: params.recipientId && mongoose.Types.ObjectId.isValid(params.recipientId) ? new mongoose.Types.ObjectId(params.recipientId) : undefined,
      recipientRole: params.recipientRole,
      type: params.type || 'info',
      message: params.message,
    });
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
      const query: any = { datasetVersionId: new mongoose.Types.ObjectId(versionId) };
      if (!isManager(req)) {
        query.assigneeId = new mongoose.Types.ObjectId(userId);
      }
      const tasks = await Stage4RewriteAssignment.find(query)
        .populate('assigneeId', 'name email')
        .populate('sampleId')
        .sort({ updatedAt: -1 })
        .lean();
      res.json({ tasks: tasks.map((task) => this.serializeRewriteTask(task)) });
    } catch (error: any) {
      console.error('List rewrite assignments error:', error);
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to list rewrite assignments' });
    }
  }

  async assignRewrite(req: Request, res: Response): Promise<void> {
    try {
      const actorId = getAuthUserId(req);
      if (!actorId || !isManager(req)) {
        res.status(actorId ? 403 : 401).json({ error: actorId ? 'Manager role required' : 'Unauthorized' });
        return;
      }
      const { versionId } = req.params;
      const { sampleId, assigneeId, convId, subject, reason, originalText } = req.body;
      const contextMode: RewriteContextMode = REWRITE_CONTEXT_MODES.includes(req.body?.contextMode)
        ? req.body.contextMode
        : 'n-2:n+2';
      if (!mongoose.Types.ObjectId.isValid(sampleId) || !mongoose.Types.ObjectId.isValid(assigneeId)) {
        res.status(400).json({ error: 'Invalid sampleId or assigneeId' });
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
      const task = await Stage4RewriteAssignment.findOneAndUpdate(
        { datasetVersionId: versionId, sampleId, targetMessageIndex: targetIndex >= 0 ? targetIndex : null },
        {
          datasetVersionId: new mongoose.Types.ObjectId(versionId),
          sampleId: new mongoose.Types.ObjectId(sampleId),
          assigneeId: new mongoose.Types.ObjectId(assigneeId),
          assignedBy: new mongoose.Types.ObjectId(actorId),
          convId: convId || String((item as any).sampleId || sampleId),
          subject: subject || (item.data as any)?.subject || '',
          reason: reason || 'None',
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
      ).populate('assigneeId', 'name email');
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

  async listMyRewriteAssignments(req: Request, res: Response): Promise<void> {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const query: any = {};
      if (!isManager(req)) {
        query.assigneeId = new mongoose.Types.ObjectId(userId);
      }
      const tasks = await Stage4RewriteAssignment.find(query)
        .populate('assigneeId', 'name email')
        .populate('sampleId')
        .sort({ updatedAt: -1 })
        .limit(100)
        .lean();
      res.json({ tasks: tasks.map((task) => ({ ...this.serializeRewriteTask(task), datasetVersionId: String(task.datasetVersionId) })) });
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
      const notes = await Stage4Notification.find({
        $or: [
          { recipientId: userId },
          { recipientRole: role },
        ],
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
      const { submittedText } = req.body;
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
      const wasSubmitted = task.status === 'submitted';
      task.submittedText = String(submittedText).trim();
      task.status = 'submitted';
      task.submittedAt = new Date();
      await task.save();
      if (!wasSubmitted) {
        await this.notify({
          versionId,
          actorId: userId,
          recipientRole: 'admin',
          type: 'success',
          message: `${(task.assigneeId as any)?.name || 'Staff'} submitted rewrite for ${task.convId}.`,
        });
        await this.notify({
          versionId,
          actorId: userId,
          recipientRole: 'supervisor',
          type: 'success',
          message: `${(task.assigneeId as any)?.name || 'Staff'} submitted rewrite for ${task.convId}.`,
        });
      }
      res.json({ task: this.serializeRewriteTask(task) });
    } catch (error: any) {
      console.error('Submit rewrite error:', error);
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to submit rewrite' });
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
      const provider = new GeminiProvider();
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

  async reviewRewrite(req: Request, res: Response): Promise<void> {
    try {
      const actorId = getAuthUserId(req);
      if (!actorId || !isManager(req)) {
        res.status(actorId ? 403 : 401).json({ error: actorId ? 'Manager role required' : 'Unauthorized' });
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
      task.status = action;
      task.reviewedBy = new mongoose.Types.ObjectId(actorId);
      task.reviewNote = note || '';
      task.reviewedAt = new Date();
      await task.save();
      await this.notify({
        versionId,
        actorId,
        recipientId: String((task.assigneeId as any)?._id || task.assigneeId),
        type: action === 'approved' ? 'success' : 'warning',
        message: `Rewrite for ${task.convId} was ${action}.`,
      });
      res.json({ task: this.serializeRewriteTask(task) });
    } catch (error: any) {
      console.error('Review rewrite error:', error);
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to review rewrite' });
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
      const notes = await Stage4Notification.find({
        datasetVersionId: versionId,
        $or: [
          { recipientId: userId },
          { recipientRole: role },
        ],
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
      const result = await Stage4Notification.updateMany(
        {
          datasetVersionId: versionId,
          readAt: { $exists: false },
          $or: [
            { recipientId: userId },
            { recipientRole: role },
          ],
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
