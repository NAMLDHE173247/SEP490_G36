import { Request, Response } from 'express';
import { DatasetVersion } from '../../../models/DatasetVersion';
import { DatasetAssignmentSubmission } from '../../../models/DatasetAssignmentSubmission';
import { LabelAssignment } from '../../../models/LabelAssignment';
import { DatasetCanonicalLabel } from '../../../models/DatasetCanonicalLabel';
import { LabelSnapshot } from '../../../models/LabelSnapshot';
import { ProcessedDatasetItem } from '../../../models/ProcessedDatasetItem';
import { ConversationRewriteHistory } from '../../../models/ConversationRewriteHistory';

export class CanonicalizeController {
  /**
   * API: Chốt nhãn (Canonicalization) — gom hard labels → DatasetCanonicalLabel
   * POST /api/dataprep/export/:versionId/canonicalize
   * Yêu cầu: Tất cả submissions phải ở trạng thái 'approved'
   */
  async canonicalizeVersion(req: Request, res: Response): Promise<void> {
    try {
      const { versionId } = req.params;
      const userId = (req as any).user?.id || (req as any).user?._id || 'admin';

      // 1. Kiểm tra tất cả submissions đã approved
      const submissions = await DatasetAssignmentSubmission.find({ datasetVersionId: versionId });
      if (submissions.length === 0) {
        res.status(400).json({ success: false, error: 'Không có submission nào cho version này' });
        return;
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
      const hardLabels = await LabelAssignment.find({
        createdBy: { $in: assigneeIds },
        type: 'hard',
      }).lean();

      if (hardLabels.length === 0) {
        res.status(400).json({ success: false, error: 'Không tìm thấy hard labels nào để chốt' });
        return;
      }

      // 3. Xóa canonical labels cũ của version
      await DatasetCanonicalLabel.deleteMany({ datasetVersionId: versionId });

      // 4. Tạo canonical labels mới
      const canonicalDocs = hardLabels.map(label => ({
        datasetVersionId: versionId,
        sampleId: label.sampleId,
        targetScope: label.targetScope || 'sample',
        messageIndex: label.messageIndex ?? null,
        messageRole: label.messageRole ?? null,
        labels: [label.name],
        targetTextSnapshot: label.targetTextSnapshot || '',
        sourceType: 'owner_manual_resolution' as const,
        sourceAnnotatorIds: [String(label.createdBy)],
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

      const samplesCovered = new Set(hardLabels.map(l => String(l.sampleId))).size;

      res.status(200).json({
        success: true,
        message: `Đã chốt ${insertedCount} canonical labels cho ${samplesCovered} samples`,
        totalCanonicalLabels: insertedCount,
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
      const userId = (req as any).user?.id || (req as any).user?._id || 'admin';
      const { name, description } = req.body;

      // Lấy toàn bộ labels cho version
      const submissions = await DatasetAssignmentSubmission.find({ datasetVersionId: versionId }).lean();
      const assigneeIds = submissions.map(s => s.assigneeId);

      const allLabels = await LabelAssignment.find({
        createdBy: { $in: assigneeIds },
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

      // Pre-load canonical labels và rewrites vào Maps cho lookup nhanh
      const canonicalLabels = await DatasetCanonicalLabel.find({ datasetVersionId: versionId }).lean();
      const canonicalMap = new Map<string, any[]>();
      for (const cl of canonicalLabels) {
        const key = String(cl.sampleId);
        if (!canonicalMap.has(key)) canonicalMap.set(key, []);
        canonicalMap.get(key)!.push(cl);
      }

      const rewrites = await ConversationRewriteHistory.find({ datasetVersionId: versionId }).lean();
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
