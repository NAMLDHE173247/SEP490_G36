import { Request, Response } from 'express';
import { DatasetVersion } from '../../../models/DatasetVersion';
import { DatasetAssignmentSubmission } from '../../../models/DatasetAssignmentSubmission';
import { LabelAssignment } from '../../../models/LabelAssignment';
import { DatasetCanonicalLabel } from '../../../models/DatasetCanonicalLabel';

function normalizeSubjectName(value: unknown): string {
  return String(value || '').replace(/^SUBJECT:\s*/i, '').trim();
}
import { LabelSnapshot } from '../../../models/LabelSnapshot';
import { ProcessedDatasetItem } from '../../../models/ProcessedDatasetItem';
import { ConversationRewriteHistory } from '../../../models/ConversationRewriteHistory';
import { PromptLibraryItem } from '../../../models/PromptLibraryItem';
import { getAuthUserId } from '../../../utils/auth';
import { buildAssignmentConflictList } from '../../../services/labelAssignmentService';
import { User } from '../../../models/User';

export class CanonicalizeController {
  async getTrainingData(req: Request, res: Response): Promise<void> {
    try {
      const { versionId } = req.params;
      const version = await DatasetVersion.findById(versionId).lean();
      if (!version) {
        res.status(404).json({ error: 'Version not found' });
        return;
      }
      const viewerId = getAuthUserId(req);
      const role = String((req as any).user?.role || '').toLowerCase();
      if (String(version.ownerId) !== String(viewerId) && !['admin', 'supervisor', 'checker'].includes(role)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      let systemPromptContent = String((version as any).promptContentSnapshot || '').trim();
      let systemPromptName = '';
      const systemPromptId = (version as any).promptId ? String((version as any).promptId) : null;
      if (systemPromptId) {
        const prompt = await PromptLibraryItem.findOne({
          _id: (version as any).promptId,
          ownerId: version.ownerId,
        }).lean();
        if (prompt) {
          systemPromptName = String((prompt as any).name || '');
          if (!systemPromptContent) systemPromptContent = String((prompt as any).content || '').trim();
        }
      }

      const items = await ProcessedDatasetItem.find({ datasetVersionId: versionId }).sort({ createdAt: 1 }).lean();
      const itemIds = items.map((item: any) => item._id);
      const [canonicalLabels, rewrites] = await Promise.all([
        DatasetCanonicalLabel.find({ datasetVersionId: versionId, sampleId: { $in: itemIds } }).sort({ createdAt: 1 }).lean(),
        ConversationRewriteHistory.find({ datasetVersionId: versionId, approvedText: { $nin: ['', null] } }).lean(),
      ]);
      let activeCanonical = canonicalLabels;
      if (activeCanonical.length === 0) {
        const hardLabels = await LabelAssignment.find({
          sampleId: { $in: itemIds },
          type: 'hard',
        }).lean();
        if (hardLabels.length > 0) {
          activeCanonical = hardLabels.map((hl: any) => ({
            sampleId: hl.sampleId,
            targetScope: hl.targetScope || 'sample',
            messageIndex: hl.messageIndex ?? null,
            messageRole: hl.messageRole ?? null,
            labels: hl.name ? [hl.name] : [],
          })) as any[];
        }
      }

      if (activeCanonical.length === 0) {
        res.status(409).json({ error: 'Dataset has no published canonical labels. Canonicalize it before training export.' });
        return;
      }

      const labelsBySample = new Map<string, any[]>();
      for (const label of activeCanonical) {
        const key = String(label.sampleId);
        const rows = labelsBySample.get(key) || [];
        rows.push(label);
        labelsBySample.set(key, rows);
      }

      // Supplement with message-level LabelAssignment labels when canonical labels
      // exist only at sample-level (e.g. SUBJECT labels after canonicalize) but the
      // admin assigned message intents via Step 7 that were never promoted to
      // DatasetCanonicalLabel.  This ensures intent labels always appear in the export.

      const hasCanonicalMessageLabels = activeCanonical.some(
        (l: any) => l.targetScope === 'message' && l.messageIndex != null
      );
      
      const msgHardLabels = await LabelAssignment.find({
        sampleId: { $in: itemIds },
        targetScope: 'message',
        type: 'hard',
      }).lean();

      const ROUTER_INTENTS = new Set([
        'solve_problem', 'explain_concept', 'give_hint', 'check_answer',
        'diagnose_error', 'ask_follow_up', 'ask_clarification'
      ]);

      for (const hl of msgHardLabels) {
        // Always include intents, because admins assign intents in Step 7 which might not be canonicalized.
        // If not an intent, only include if there are no canonical message labels to avoid resurrecting rejected staff labels.
        if (!hasCanonicalMessageLabels || ROUTER_INTENTS.has(String(hl.name || ''))) {
          const key = String(hl.sampleId);
          const rows = labelsBySample.get(key) || [];
          rows.push({
            sampleId: hl.sampleId,
            targetScope: 'message',
            messageIndex: hl.messageIndex ?? null,
            messageRole: hl.messageRole ?? null,
            labels: hl.name ? [hl.name] : [],
          });
          labelsBySample.set(key, rows);
        }
      }
      const rewritesBySample = new Map<string, Map<number, string>>();
      for (const rewrite of rewrites) {
        const key = String(rewrite.sampleId);
        const rows = rewritesBySample.get(key) || new Map<number, string>();
        rows.set(rewrite.messageIndex, String(rewrite.approvedText));
        rewritesBySample.set(key, rows);
      }

      const data = items.map((item: any) => {
        let messages: Array<any> = [];
        if (Array.isArray(item.data?.messages)) messages = item.data.messages.map((message: any) => ({ ...message }));
        else {
          if (item.data?.prompt) messages.push({ role: 'user', content: String(item.data.prompt) });
          if (item.data?.response) messages.push({ role: 'assistant', content: String(item.data.response) });
        }
        for (const [index, approvedText] of rewritesBySample.get(String(item._id)) || []) {
          if (messages[index]) messages[index].content = approvedText;
        }

        const sampleLabels = new Set<string>();
        const messageLabelMap = new Map<string, { messageIndex: number; role: string; labels: Set<string> }>();
        for (const label of labelsBySample.get(String(item._id)) || []) {
          const canonicalNames = Array.isArray(label.labels) ? label.labels : [];
          if (label.targetScope === 'message' && Number.isInteger(label.messageIndex)) {
            const mapKey = `${label.messageIndex}:${label.messageRole || ''}`;
            const entry = messageLabelMap.get(mapKey) || { messageIndex: label.messageIndex, role: label.messageRole || '', labels: new Set<string>() };
            canonicalNames.forEach((name: string) => entry.labels.add(String(name)));
            messageLabelMap.set(mapKey, entry);
          } else canonicalNames.forEach((name: string) => sampleLabels.add(String(name)));
        }
        const messageLabels = Array.from(messageLabelMap.values()).map(entry => ({
          messageIndex: entry.messageIndex,
          role: entry.role,
          labels: Array.from(entry.labels),
        }));
        messageLabels.forEach(entry => {
          if (messages[entry.messageIndex]) messages[entry.messageIndex].labels = entry.labels;
        });

        // === Plan B: Đọc môn học theo thứ tự ưu tiên ===
        const itemDataAny = (item.data || {}) as any;
        const subClass = (itemDataAny.subject_classification || {}) as any;
        const subject: string = normalizeSubjectName(
          subClass.subject_final ||
          subClass.subject_ai ||
          itemDataAny.subject ||
          itemDataAny.subjectLabel ||
          itemDataAny.subject_label ||
          itemDataAny.groupLabel ||
          itemDataAny.group_label ||
          itemDataAny.meta?.subject ||
          'Ungrouped'
        ) || 'Ungrouped';

        return {
          id: String(item.sampleId || item._id),
          conversation_id: String(item.sampleId || item._id),
          subject,
          messages,
          labels: { sample: Array.from(sampleLabels), messages: messageLabels },
        };
      });
      res.json({
        versionId,
        total: data.length,
        labeledSamples: data.filter(item => item.labels.sample.length || item.labels.messages.length).length,
        systemPrompt: {
          id: systemPromptId,
          name: systemPromptName || null,
          content: systemPromptContent || null,
        },
        data,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to build training data' });
    }
  }
  /**
   * API: Chốt nhãn (Canonicalization) — gom hard labels → DatasetCanonicalLabel
   * POST /api/dataprep/export/:versionId/canonicalize
   * Yêu cầu: Tất cả submissions phải ở trạng thái 'approved'
   */
  async canonicalizeVersion(req: Request, res: Response): Promise<void> {
    try {
      const { versionId } = req.params;
      const userId = getAuthUserId(req);
      const role = String((req as any).user?.role || '').toLowerCase();
      if (!userId) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      const version = await DatasetVersion.findById(versionId).lean();
      if (!version) {
        res.status(404).json({ error: 'Version not found' });
        return;
      }
      if (String(version.ownerId) !== String(userId) && !['admin', 'supervisor', 'checker'].includes(role)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      // 0. Kiểm tra xem có conflict nào chưa xử lý không
      const conflicts = await buildAssignmentConflictList(versionId, { status: 'pending' });
      if (conflicts.length > 0) {
        res.status(400).json({
          success: false,
          error: `Vẫn còn ${conflicts.length} conflict chưa được giải quyết. Yêu cầu Checker xử lý xong mới được chốt nhãn.`,
          pendingConflicts: conflicts.length
        });
        return;
      }

      // 1. Kiểm tra tất cả submissions đã approved (bỏ qua các submission đã bị revoked/inactive)
      const submissions = await DatasetAssignmentSubmission.find({ datasetVersionId: versionId, active: { $ne: false } });
      if (submissions.length === 0) {
        // Có thể admin tự gán nhãn mà không qua task assignment
        // Không return lỗi ở đây nữa, chỉ tiếp tục.
      }

      const notApproved = submissions.filter(s => s.status !== 'approved');
      if (notApproved.length > 0) {
        res.status(400).json({
          success: false,
          error: `Còn ${notApproved.length} submission chưa được duyệt (approved). Vui lòng duyệt hết trước khi chốt nhãn.`,
          pendingSubmissions: notApproved.map(s => ({
            id: s._id,
            assigneeId: s.assigneeId,
            status: s.status,
          })),
        });
        return;
      }

      // 2. Gom hard labels
      const assigneeIds = submissions.map(s => s.assigneeId);
      
      // Cho phép admin và supervisor tự gán nhãn
      const privilegedUsers = await User.find({ role: { $in: ['admin', 'supervisor'] } }).select('_id').lean();
      const privilegedIds = privilegedUsers.map(u => u._id);
      const allowedIds = [...assigneeIds, ...privilegedIds];

      const versionItems = await ProcessedDatasetItem.find({ datasetVersionId: versionId }).select('_id').lean();
      const versionItemIds = versionItems.map(item => item._id);
      const hardLabels = await LabelAssignment.find({
        sampleId: { $in: versionItemIds },
        createdBy: { $in: allowedIds },
        type: 'hard',
      }).lean();

      if (hardLabels.length === 0) {
        res.status(400).json({ success: false, error: 'Không tìm thấy hard labels nào để chốt' });
        return;
      }

      // Preserve existing Checker-published canonical decisions for this version.
      const existingCanonical = await DatasetCanonicalLabel.find({ datasetVersionId: versionId }).lean();
      const existingKeys = new Set(existingCanonical.map((row: any) => [
        String(row.sampleId),
        String(row.targetScope || 'sample'),
        row.messageIndex ?? '',
        row.messageRole ?? '',
      ].join(':')));

      // Create canonical rows only for non-conflicting targets not already published.
      const groupedLabels = new Map<string, any>();
      for (const label of hardLabels) {
        const key = [
          String(label.sampleId),
          String(label.targetScope || 'sample'),
          label.messageIndex ?? '',
          label.messageRole ?? '',
        ].join(':');
        if (existingKeys.has(key)) continue;
        const row = groupedLabels.get(key) || {
          ...label,
          labels: new Set<string>(),
          annotators: new Set<string>(),
          labelsByAnnotator: new Map<string, Set<string>>(),
        };
        const annotatorId = String(label.createdBy);
        if (!row.labelsByAnnotator.has(annotatorId)) row.labelsByAnnotator.set(annotatorId, new Set<string>());
        if (label.name) {
          row.labels.add(String(label.name));
          row.labelsByAnnotator.get(annotatorId).add(String(label.name));
        }
        row.annotators.add(annotatorId);
        groupedLabels.set(key, row);
      }

      // One annotator can proceed without conflict comparison. With two or more
      // annotators, use the version's configured Jaccard agreement threshold.
      // Accepted multi-annotator targets publish majority labels, never the raw
      // union, so a label selected by only one Staff is not promoted to truth.
      const agreementThreshold = Number.isFinite(Number((version as any).similarityThreshold))
        ? Number((version as any).similarityThreshold)
        : 0.6;
      const unresolvedTargets = Array.from(groupedLabels.entries()).filter(([, row]) => {
        const decisions = Array.from(row.labelsByAnnotator.values() as Iterable<Set<string>>);
        if (decisions.length === 1) {
          row.canonicalLabels = Array.from(decisions[0]);
          row.canonicalSourceType = 'single_annotator';
          return row.canonicalLabels.length === 0;
        }

        const pairScores: number[] = [];
        for (let i = 0; i < decisions.length; i += 1) {
          for (let j = i + 1; j < decisions.length; j += 1) {
            const union = new Set([...decisions[i], ...decisions[j]]);
            const intersectionSize = Array.from(decisions[i]).filter(label => decisions[j].has(label)).length;
            pairScores.push(union.size === 0 ? 1 : intersectionSize / union.size);
          }
        }
        const agreement = pairScores.reduce((sum, score) => sum + score, 0) / pairScores.length;
        const counts = new Map<string, number>();
        decisions.forEach(labels => labels.forEach(label => counts.set(label, (counts.get(label) || 0) + 1)));
        row.canonicalLabels = Array.from(counts.entries())
          .filter(([, count]) => count > decisions.length / 2)
          .map(([label]) => label);
        row.canonicalSourceType = 'staff_consensus';
        row.agreementScore = agreement;
        return agreement < agreementThreshold || row.canonicalLabels.length === 0;
      });
      if (unresolvedTargets.length > 0) {
        res.status(409).json({
          success: false,
          error: `${unresolvedTargets.length} targets are below the configured agreement threshold or have no majority label. Checker adjudication is required.`,
          unresolvedTargets: unresolvedTargets.length,
        });
        return;
      }

      const canonicalDocs = Array.from(groupedLabels.values()).map(label => ({
        datasetVersionId: versionId,
        sampleId: label.sampleId,
        targetScope: label.targetScope || 'sample',
        messageIndex: label.messageIndex ?? null,
        messageRole: label.messageRole ?? null,
        labels: label.canonicalLabels,
        targetTextSnapshot: label.targetTextSnapshot || '',
        sourceType: label.canonicalSourceType,
        sourceAnnotatorIds: Array.from(label.annotators),
        publishedBy: userId,
        publishedAt: new Date(),
      }));

      // Bulk upsert — dùng ordered: false để skip duplicates
      let insertedCount = 0;
      try {
        const result = await DatasetCanonicalLabel.insertMany(canonicalDocs, { ordered: false });
        insertedCount = result.length;
      } catch (err: any) {
        if (err?.code === 11000) {
          // Duplicate key errors are expected due to unique index
          insertedCount = err.insertedDocs?.length || canonicalDocs.length - (err.writeErrors?.length || 0);
        } else {
          throw err;
        }
      }

      // Update ProcessedDatasetItem subject_classification inside data
      try {
        for (const doc of canonicalDocs) {
          if (doc.targetScope === 'sample') {
            const item = await ProcessedDatasetItem.findById(doc.sampleId);
            if (item) {
              const itemData = item.data || {};
              const currentClass = (itemData.subject_classification || {}) as any;
              const finalSubject = Array.isArray(doc.labels) && doc.labels.length > 0 ? doc.labels[0] : 'Unclear';

              const isCorrected = currentClass.subject_ai && currentClass.subject_ai !== finalSubject;

              itemData.subject_classification = {
                subject_ai: currentClass.subject_ai || finalSubject,
                confidence: currentClass.confidence ?? null,
                subject_final: finalSubject,
                status: isCorrected ? 'corrected' : 'approved',
                reviewed_by: userId,
              };

              item.markModified('data');
              await item.save();
            }
          }
        }
      } catch (err) {
        console.error('[CanonicalizeController] canonicalizeVersion - update subject_classification failed:', err);
      }

      const [totalCanonicalLabels, canonicalSampleIds] = await Promise.all([
        DatasetCanonicalLabel.countDocuments({ datasetVersionId: versionId }),
        DatasetCanonicalLabel.distinct('sampleId', { datasetVersionId: versionId }),
      ]);
      const samplesCovered = canonicalSampleIds.length;

      res.status(200).json({
        success: true,
        message: `Đã chốt ${insertedCount} canonical labels cho ${samplesCovered} samples`,
        totalCanonicalLabels,
        samplesCovered,
      });
    } catch (error: any) {
      console.error('[CanonicalizeController] canonicalizeVersion error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * API: Đóng băng version — tạo LabelSnapshot
   * POST /api/dataprep/export/:versionId/snapshot
   */
  async snapshotVersion(req: Request, res: Response): Promise<void> {
    try {
      const { versionId } = req.params;
      const userId = getAuthUserId(req);
      const role = String((req as any).user?.role || '').toLowerCase();
      const { name, description } = req.body;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      const version = await DatasetVersion.findById(versionId).lean();
      if (!version) {
        res.status(404).json({ error: 'Version not found' });
        return;
      }
      if (String(version.ownerId) !== String(userId) && !['admin', 'supervisor'].includes(role)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      // Lấy toàn bộ labels cho version
      const submissions = await DatasetAssignmentSubmission.find({ datasetVersionId: versionId, active: { $ne: false } }).lean();
      const assigneeIds = submissions.map(s => s.assigneeId);
      
      const privilegedUsers = await User.find({ role: { $in: ['admin', 'supervisor'] } }).select('_id').lean();
      const privilegedIds = privilegedUsers.map(u => u._id);
      const allowedIds = [...assigneeIds, ...privilegedIds];

      const versionItems = await ProcessedDatasetItem.find({ datasetVersionId: versionId }).select('_id').lean();

      const allLabels = await LabelAssignment.find({
        sampleId: { $in: versionItems.map(item => item._id) },
        createdBy: { $in: allowedIds },
      }).lean();

      const snapshot = await LabelSnapshot.create({
        datasetVersionId: versionId,
        name: name || `Snapshot ${new Date().toISOString().split('T')[0]}`,
        description: description || 'Auto-generated snapshot before export',
        createdBy: userId,
        labelAssignments: allLabels.map(l => ({
          sampleId: l.sampleId,
          name: l.name,
          type: l.type,
          targetScope: l.targetScope || 'sample',
          messageIndex: l.messageIndex ?? null,
          messageRole: l.messageRole ?? null,
          targetTextSnapshot: l.targetTextSnapshot || '',
          createdBy: l.createdBy,
          legacyLabelId: l._id,
        })),
      });

      res.status(201).json({
        success: true,
        snapshotId: snapshot._id,
        totalLabels: allLabels.length,
        message: `Đã tạo snapshot "${snapshot.name}" với ${allLabels.length} labels`,
      });
    } catch (error: any) {
      console.error('[CanonicalizeController] snapshotVersion error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * API: Xuất JSONL — sử dụng MongoDB Cursor + Node Streams tránh OOM
   * GET /api/dataprep/export/:versionId/jsonl
   * 
   * Flow: Đọc 1 sample từ DB → lấy nhãn + rewrites → JSON.stringify → res.write() → giải phóng RAM → đọc tiếp
   */
  async exportJSONL(req: Request, res: Response): Promise<void> {
    try {
      const { versionId } = req.params;

      const version = await DatasetVersion.findById(versionId).lean();
      if (!version) {
        res.status(404).json({ error: 'Version not found' });
        return;
      }
      const viewerId = getAuthUserId(req);
      const role = String((req as any).user?.role || '').toLowerCase();
      if (String(version.ownerId) !== String(viewerId) && !['admin', 'supervisor', 'checker'].includes(role)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      // Kiểm tra xem có conflict nào chưa xử lý không
      const conflicts = await buildAssignmentConflictList(versionId, { status: 'pending' });
      if (conflicts.length > 0) {
        res.status(400).json({
          success: false,
          error: `Vẫn còn ${conflicts.length} conflict chưa được giải quyết. Yêu cầu Checker xử lý xong mới được xuất dữ liệu.`,
          pendingConflicts: conflicts.length
        });
        return;
      }

      // Pre-load canonical labels và rewrites vào Maps cho lookup nhanh
      const canonicalLabels = await DatasetCanonicalLabel.find({ datasetVersionId: versionId }).lean();
      let activeCanonical = canonicalLabels;
      if (activeCanonical.length === 0) {
        const items = await ProcessedDatasetItem.find({ datasetVersionId: versionId }).select('_id').lean();
        const itemIds = items.map(item => item._id);
        const hardLabels = await LabelAssignment.find({
          sampleId: { $in: itemIds },
          type: 'hard',
        }).lean();
        if (hardLabels.length > 0) {
          activeCanonical = hardLabels.map((hl: any) => ({
            sampleId: hl.sampleId,
            targetScope: hl.targetScope || 'sample',
            messageIndex: hl.messageIndex ?? null,
            messageRole: hl.messageRole ?? null,
            labels: hl.name ? [hl.name] : [],
          })) as any[];
        }
      }

      if (activeCanonical.length === 0) {
        res.status(409).json({ error: 'Dataset has no published canonical labels. Canonicalize it before export.' });
        return;
      }
      const canonicalMap = new Map<string, any[]>();
      for (const cl of activeCanonical) {
        const key = String(cl.sampleId);
        if (!canonicalMap.has(key)) canonicalMap.set(key, []);
        canonicalMap.get(key)!.push(cl);
      }

      const rewrites = await ConversationRewriteHistory.find({
        datasetVersionId: versionId,
        approvedText: { $nin: ['', null] },
      }).lean();
      const rewriteMap = new Map<string, Map<number, any>>();
      for (const rw of rewrites) {
        const key = String(rw.sampleId);
        if (!rewriteMap.has(key)) rewriteMap.set(key, new Map());
        rewriteMap.get(key)!.set(rw.messageIndex, rw);
      }

      // Set headers cho JSONL streaming
      const filename = `${version.projectName || 'dataset'}_${version.versionName || 'v1'}_labeled.jsonl`;
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Transfer-Encoding', 'chunked');

      // Stream từng sample qua cursor — KHÔNG load toàn bộ vào RAM
      const cursor = ProcessedDatasetItem.find({ datasetVersionId: versionId }).sort({ _id: 1 }).cursor();

      let count = 0;
      for await (const item of cursor) {
        const sampleId = String(item._id);
        const data = item.data || {};

        // 1. Lấy messages gốc
        let messages: Array<{ role: string; content: string }> = [];
        if (Array.isArray(data.messages)) {
          messages = data.messages.filter((m: any) => m?.role && m?.content).map((m: any) => ({
            role: m.role,
            content: String(m.content),
          }));
        } else if (data.prompt || data.response) {
          if (data.prompt) messages.push({ role: 'user', content: String(data.prompt) });
          if (data.response) messages.push({ role: 'assistant', content: String(data.response) });
        }

        // 2. Merge rewrites (approvedText thay thế content gốc)
        const sampleRewrites = rewriteMap.get(sampleId);
        if (sampleRewrites) {
          for (const [msgIdx, rw] of sampleRewrites) {
            if (msgIdx < messages.length && rw.approvedText) {
              messages[msgIdx].content = rw.approvedText;
            }
          }
        }

        // 3. Lấy canonical labels
        const sampleCanonicals = canonicalMap.get(sampleId) || [];
        const labels: string[] = [];
        for (const cl of sampleCanonicals) {
          if (cl.targetScope === 'sample') {
            labels.push(...cl.labels);
          }
        }

        // 4. Ghi dòng JSONL
        const line = JSON.stringify({ messages, labels }) + '\n';
        res.write(line);
        count++;
      }

      // Kết thúc stream
      res.end();
      console.log(`[ExportJSONL] Exported ${count} samples for version ${versionId}`);
    } catch (error: any) {
      console.error('[CanonicalizeController] exportJSONL error:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: error.message });
      } else {
        res.end();
      }
    }
  }
}

export const canonicalizeController = new CanonicalizeController();
