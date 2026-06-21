import { Request, Response } from 'express';
import { DatasetAssignmentSubmission } from '../../../models/DatasetAssignmentSubmission';
import { DatasetSampleAssignment } from '../../../models/DatasetSampleAssignment';
import { LabelAssignment } from '../../../models/LabelAssignment';
import { ProcessedDatasetItem } from '../../../models/ProcessedDatasetItem';
import { DatasetVersion } from '../../../models/DatasetVersion';
import { DatasetAssignmentActivity } from '../../../models/DatasetAssignmentActivity';
import { DatasetCanonicalLabel } from '../../../models/DatasetCanonicalLabel';
import { User } from '../../../models/User';
import { Stage4Notification } from '../../../models/Stage4Notification';
import mongoose from 'mongoose';
import { USER_MESSAGE_LABELS, ASSISTANT_MESSAGE_LABELS } from './messageAutoLabel.service';
import { broadcastAssignmentUpdate } from './assignment.events';

function isCompleteStaffLabel(label: any): boolean {
  return Boolean(label?.subject && label?.completion && label?.quality);
}

function parseSavedLabel(snapshot?: string): any {
  if (!snapshot) return null;
  try {
    return JSON.parse(snapshot);
  } catch {
    return null;
  }
}

export class AssignmentController {

  /**
   * API: Xóa toàn bộ dữ liệu Test của Assignment
   * POST /api/dataprep/assignments/reset
   */
  async resetData(_req: Request, res: Response) {
    try {
      await DatasetAssignmentSubmission.deleteMany({});
      await DatasetSampleAssignment.deleteMany({});
      await LabelAssignment.deleteMany({});
      return res.status(200).json({ success: true, message: 'Reset OK' });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  /**
   * API: Lấy danh sách Staff khả dụng kèm workload chi tiết (sample-level)
   * GET /api/dataprep/labeling/assignments/available-staff
   * Response: { success, data: [{ id, name, email, pendingTasks, totalAssigned, labeledSoFar, remainingSamples }] }
   */
  async getAvailableStaff(_req: Request, res: Response) {
    try {
      // 1. Lấy danh sách staff active
      const staffList = await User.find({ role: 'staff', status: 'active' })
        .select('_id email name')
        .lean();

      // 2. Aggregate workload từ DatasetAssignmentSubmission (pending/in_progress)
      //    - pendingTasks: số batch/đợt giao việc đang chờ
      //    - totalAssigned: tổng số câu (samples) được giao
      //    - labeledSoFar: tổng số câu đã gán nhãn xong
      //    - remainingSamples = totalAssigned - labeledSoFar
      const workloadAgg = await DatasetAssignmentSubmission.aggregate([
        { $match: { status: { $in: ['pending', 'in_progress'] } } },
        {
          $group: {
            _id: '$assigneeId',
            pendingTasks: { $sum: 1 },
            totalAssigned: { $sum: { $ifNull: ['$totalSamples', 0] } },
            labeledSoFar: { $sum: { $ifNull: ['$labeledCount', 0] } },
          }
        },
        {
          $addFields: {
            remainingSamples: { $subtract: ['$totalAssigned', '$labeledSoFar'] }
          }
        }
      ]);
      const workloadMap = new Map(workloadAgg.map((w: any) => [String(w._id), w]));

      const result = staffList.map(s => {
        const wl = workloadMap.get(String(s._id)) || {
          pendingTasks: 0, totalAssigned: 0, labeledSoFar: 0, remainingSamples: 0
        };
        return {
          id: String(s._id),
          name: s.name,
          email: s.email,
          pendingTasks: wl.pendingTasks,
          totalAssigned: wl.totalAssigned,
          labeledSoFar: wl.labeledSoFar,
          remainingSamples: Math.max(0, wl.remainingSamples),
        };
      });

      return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      console.error('[AssignmentController] getAvailableStaff error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * API: Tự động chia hội thoại cho danh sách nhân viên
   * Hỗ trợ 2 chế độ:
   *   - overlapCount = 1 (mặc định): Chia đều, mỗi người nhận phần riêng
   *   - overlapCount > 1: Gom nhóm, mỗi nhóm overlapCount người cùng gán nhãn cho CÙNG 1 lô samples
   *     VD: 9 staff, overlapCount=3, 90 samples → 3 nhóm x 3 người, mỗi nhóm làm 30 câu giống nhau
   * POST /api/dataprep/versions/:versionId/assignments/auto-assign
   * Body: { assigneeIds: string[], taskName: string, priority?: string, deadline?: string, overlapCount?: number }
   */
  async createAutoAssignment(req: Request, res: Response) {
    try {
      const { versionId } = req.params;
      const { assigneeIds, taskName, priority, deadline, overlapCount: rawOverlap, aiAssigneeIds } = req.body;
      const assignedBy = (req as any).user?.id || (req as any).user?._id || 'admin';

      if (!assigneeIds || !assigneeIds.length) {
        return res.status(400).json({ success: false, error: 'Cần chọn ít nhất 1 nhân viên' });
      }

      // Danh sách nhân viên được phép dùng AI key của hệ thống
      const aiAllowed = new Set<string>((Array.isArray(aiAssigneeIds) ? aiAssigneeIds : []).map((x: any) => String(x)));

      // Bắt buộc đặt tên Task
      const cleanTaskName = String(taskName ?? '').trim();
      if (!cleanTaskName) {
        return res.status(400).json({ success: false, error: 'Tên Task là bắt buộc' });
      }

      const overlapCount = Math.max(1, parseInt(rawOverlap) || 1);
      const M = assigneeIds.length;

      if (overlapCount > M) {
        return res.status(400).json({ success: false, error: `Số người trùng lặp (${overlapCount}) không được lớn hơn tổng số nhân viên (${M})` });
      }

      // 1. Lấy version metadata
      const version = await DatasetVersion.findById(versionId).lean();
      if (!version) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy DatasetVersion' });
      }
      // Mỗi version phải thuộc 1 Project — task kế thừa projectId này
      const projectId = (version as any).projectId;
      if (!projectId) {
        return res.status(400).json({ success: false, error: 'DatasetVersion chưa thuộc Project nào. Vui lòng tạo/chọn Project trước.' });
      }
      const datasetName = version.projectName || version.versionName || 'Dataset';

      // 2. Lấy TOÀN BỘ danh sách sample IDs
      const allSamples = await ProcessedDatasetItem.find({ datasetVersionId: versionId })
        .select('_id')
        .sort({ _id: 1 })
        .lean();

      const N = allSamples.length;
      if (N === 0) {
        return res.status(400).json({ success: false, error: 'Version này chưa có dữ liệu (0 samples)' });
      }

      // 3. Tính toán phân bổ — hỗ trợ M không chia hết cho overlapCount
      //    VD: 5 staff, overlap=2 → 3 nhóm (2+2+1), 5 staff overlap=3 → 2 nhóm (3+2)
      const numberOfGroups = Math.ceil(M / overlapCount);
      const perGroup = Math.floor(N / numberOfGroups);
      const remainder = N % numberOfGroups;

      // 4. Tạo các nhóm staff
      const groups: Array<{ staffIds: string[]; sampleIds: any[]; startIndex: number }> = [];
      let sampleCursor = 0;
      let staffCursor = 0;
      for (let g = 0; g < numberOfGroups; g++) {
        const chunkSize = perGroup + (g < remainder ? 1 : 0);
        const groupStaffIds = assigneeIds.slice(staffCursor, Math.min(staffCursor + overlapCount, M));
        staffCursor += overlapCount;
        groups.push({
          staffIds: groupStaffIds,
          sampleIds: allSamples.slice(sampleCursor, sampleCursor + chunkSize),
          startIndex: sampleCursor + 1, // 1-indexed
        });
        sampleCursor += chunkSize;
      }

      // 5. Ghi DB — mỗi người trong nhóm nhận CÙNG MỘT lô samples
      const allActivityDocs: any[] = [];
      const distributionResult: any[] = [];

      for (const group of groups) {
        for (const staffId of group.staffIds) {
          // 5a. Tạo DatasetAssignmentSubmission cho từng người
          const submission = new DatasetAssignmentSubmission({
            projectId,
            datasetVersionId: versionId,
            assigneeId: staffId,
            status: 'pending' as const,
            name: `${cleanTaskName} - Batch ${group.startIndex}`,
            aiAssistEnabled: aiAllowed.has(String(staffId)),
            batchStart: group.startIndex,
            batchCount: group.sampleIds.length,
            taskType: 'labeling',
            priority: priority || 'medium',
            deadline: deadline ? new Date(deadline) : undefined,
            supervisor: supervisorId || assignedBy,
            labeledCount: 0,
            totalSamples: group.sampleIds.length,
            dataset: datasetName,
            version: version.versionName || 'v1',
            progressSnapshot: { totalAssigned: group.sampleIds.length },
          });
          await submission.save();

          // 5b. Tạo DatasetSampleAssignment — ánh xạ sampleId cụ thể
          const sampleDocs = group.sampleIds.map((item, i) => ({
            projectId,
            datasetVersionId: versionId,
            sampleId: item._id,
            assigneeId: staffId,
            assignedBy,
            sampleIndex: group.startIndex + i,
            taskType: 'labeling',
            priority: priority || 'medium',
          }));
          await DatasetSampleAssignment.insertMany(sampleDocs);

          // 5c. Audit log
          for (const item of group.sampleIds) {
            allActivityDocs.push({
              datasetVersionId: versionId,
              sampleId: item._id,
              annotatorId: staffId,
              labelName: 'assignment',
              labelType: 'hard',
              targetScope: 'sample',
              activityType: 'assign',
            });
          }

          distributionResult.push({
            assigneeId: staffId,
            groupIndex: groups.indexOf(group) + 1,
            sampleCount: group.sampleIds.length,
            range: `${group.startIndex}–${group.startIndex + group.sampleIds.length - 1}`,
          });
        }
      }

      // 5d. Bulk insert audit logs
      if (allActivityDocs.length > 0) {
        await DatasetAssignmentActivity.insertMany(allActivityDocs);
      }

      // 6. Broadcast SSE update
      broadcastAssignmentUpdate({ type: 'assignment_created', versionId, action: 'auto_assign' });

      const overlapMsg = overlapCount > 1
        ? ` (${numberOfGroups} nhóm x ${overlapCount} người/nhóm, mỗi nhóm cùng gán ${perGroup} câu)`
        : '';

      return res.status(201).json({
        success: true,
        message: `Đã giao ${N} samples cho ${M} nhân viên${overlapMsg}`,
        distribution: distributionResult,
      });
    } catch (error: any) {
      console.error('[AssignmentController] createAutoAssignment error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * API: Tạo hàng loạt Assignment cho một Batch
   * POST /api/dataprep/versions/:versionId/assignments/batch
   */
  async createBatchAssignment(req: Request, res: Response) {
    try {
      const { versionId } = req.params;
      const { assigneeIds, sampleStartIndex, sampleCount, taskType, priority, batchName, aiAssigneeIds } = req.body;
      const assignedBy = (req as any).user?.id || (req as any).user?._id || 'admin';

      if (!assigneeIds || !assigneeIds.length || !sampleCount) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
      }

      const aiAllowed = new Set<string>((Array.isArray(aiAssigneeIds) ? aiAssigneeIds : []).map((x: any) => String(x)));

      // Bắt buộc đặt tên Task
      const cleanBatchName = String(batchName ?? '').trim();
      if (!cleanBatchName) {
        return res.status(400).json({ success: false, error: 'Tên Task là bắt buộc' });
      }

      // Version phải thuộc 1 Project — task kế thừa projectId
      const versionDoc = await DatasetVersion.findById(versionId).lean();
      if (!versionDoc) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy DatasetVersion' });
      }
      const projectId = (versionDoc as any).projectId;
      if (!projectId) {
        return res.status(400).json({ success: false, error: 'DatasetVersion chưa thuộc Project nào. Vui lòng tạo/chọn Project trước.' });
      }

      for (const assigneeId of assigneeIds) {
        const version = versionDoc;
        const datasetName = version ? version.projectName || version.versionName || 'Dataset' : 'Dataset';

        // Create the submission (batch block)
        const submission = new DatasetAssignmentSubmission({
          projectId,
          datasetVersionId: versionId,
          assigneeId: assigneeId,
          status: 'pending' as const,
          progressSnapshot: { totalAssigned: sampleCount },
          name: cleanBatchName,
          aiAssistEnabled: aiAllowed.has(String(assigneeId)),
          batchStart: sampleStartIndex,
          batchCount: sampleCount,
          priority: priority || 'medium',
          taskType: taskType || 'labeling',
          labeledCount: 0,
          totalSamples: sampleCount,
          dataset: datasetName,
          version: version?.versionName || 'v1',
          supervisor: supervisorId || assignedBy
        });

        await submission.save();

        // Fetch actual ProcessedDatasetItem from DB for this version
        const items = await ProcessedDatasetItem.find({ datasetVersionId: versionId })
          .sort({ _id: 1 })
          .skip(sampleStartIndex - 1)
          .limit(sampleCount);

        const sampleDocs = [];
        for (let i = 0; i < sampleCount; i++) {
          const actualItem = items[i];
          sampleDocs.push({
            projectId,
            datasetVersionId: versionId,
            sampleId: actualItem ? actualItem._id : new mongoose.Types.ObjectId().toHexString(), // fallback if not found
            assigneeId: assigneeId,
            assignedBy: assignedBy,
            sampleIndex: sampleStartIndex + i,
            taskType: taskType || 'labeling',
            priority: priority || 'medium',
          });
        }
        await DatasetSampleAssignment.insertMany(sampleDocs);

        if (mongoose.Types.ObjectId.isValid(String(assigneeId))) {
          await Stage4Notification.create({
            datasetVersionId: versionId,
            recipientId: new mongoose.Types.ObjectId(String(assigneeId)),
            actorId: mongoose.Types.ObjectId.isValid(String(assignedBy)) ? new mongoose.Types.ObjectId(String(assignedBy)) : undefined,
            type: 'info',
            message: `New labeling batch assigned: ${submission.name} (${sampleCount} samples).`,
          });
        }
      }

      return res.status(201).json({
        success: true,
        message: 'Batch assignments created successfully',
        assignedCount: assigneeIds.length
      });
    } catch (error: any) {
      console.error('[AssignmentController] Error creating batch assignment:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * API: Thay thế nhân sự giữa chừng
   * POST /api/dataprep/versions/:versionId/assignments/replace
   * Body: { fromAssigneeId, toAssigneeId, aiAssistEnabled?, reason? }
   * Rút phần đang active của người cũ, gán người mới tiếp tục. Giữ nhãn & lịch sử người cũ để tính công, khóa không cho họ sửa.
   */
  async replaceAssignee(req: Request, res: Response) {
    try {
      const { versionId } = req.params;
      const { fromAssigneeId, toAssigneeId, aiAssistEnabled, reason } = req.body;
      const assignedBy = (req as any).user?.id || (req as any).user?._id || 'admin';

      if (!fromAssigneeId || !toAssigneeId) {
        return res.status(400).json({ success: false, error: 'Cần chọn người cũ và người thay thế' });
      }
      if (String(fromAssigneeId) === String(toAssigneeId)) {
        return res.status(400).json({ success: false, error: 'Người thay thế phải khác người cũ' });
      }

      const version = await DatasetVersion.findById(versionId).lean();
      if (!version) return res.status(404).json({ success: false, error: 'Không tìm thấy DatasetVersion' });
      const projectId = (version as any).projectId;

      const fromSamples = await DatasetSampleAssignment.find({
        datasetVersionId: versionId, assigneeId: fromAssigneeId, active: { $ne: false },
      });
      if (fromSamples.length === 0) {
        return res.status(404).json({ success: false, error: 'Người này không còn mẫu nào đang xử lý trong dataset' });
      }

      // 1) Gán mẫu cho người mới (giữ nguyên sampleIndex/sampleId)
      const newSampleDocs = fromSamples.map((s: any) => ({
        projectId,
        datasetVersionId: versionId,
        sampleId: s.sampleId,
        assigneeId: toAssigneeId,
        assignedBy,
        sampleIndex: s.sampleIndex,
        taskType: s.taskType || 'labeling',
        priority: s.priority || 'medium',
        active: true,
      }));
      await DatasetSampleAssignment.insertMany(newSampleDocs, { ordered: false }).catch(() => {});

      // 2) Khóa mẫu của người cũ (giữ để tính công)
      await DatasetSampleAssignment.updateMany(
        { _id: { $in: fromSamples.map((s: any) => s._id) } },
        { $set: { active: false, revokedAt: new Date() } }
      );

      // 3) Tạo submission cho người mới + khóa submission người cũ
      const fromSubs = await DatasetAssignmentSubmission.find({
        datasetVersionId: versionId, assigneeId: fromAssigneeId, active: { $ne: false },
      });

      const buildSub = (src: any) => ({
        projectId,
        datasetVersionId: versionId,
        assigneeId: toAssigneeId,
        status: 'pending' as const,
        name: src?.name || `Task - Batch ${fromSamples[0].sampleIndex}`,
        batchStart: src?.batchStart || fromSamples[0].sampleIndex,
        batchCount: src?.batchCount || fromSamples.length,
        taskType: src?.taskType || 'labeling',
        priority: src?.priority || 'medium',
        deadline: src?.deadline,
        supervisor: assignedBy,
        dataset: src?.dataset || version.projectName,
        version: src?.version || version.versionName,
        totalSamples: src?.totalSamples || fromSamples.length,
        labeledCount: 0,
        aiAssistEnabled: aiAssistEnabled !== undefined ? !!aiAssistEnabled : !!src?.aiAssistEnabled,
        active: true,
      });

      if (fromSubs.length > 0) {
        for (const sub of fromSubs) {
          await DatasetAssignmentSubmission.create(buildSub(sub));
          sub.active = false;
          (sub as any).revokedAt = new Date();
          (sub as any).revokedReason = reason || 'Thay thế nhân sự';
          (sub as any).replacedByAssigneeId = toAssigneeId;
          await sub.save();
        }
      } else {
        await DatasetAssignmentSubmission.create(buildSub(null));
      }

      broadcastAssignmentUpdate({ type: 'assignment_updated', versionId, action: 'replace_assignee' });
      if (mongoose.Types.ObjectId.isValid(String(toAssigneeId))) {
        await Stage4Notification.create({
          datasetVersionId: versionId,
          recipientId: new mongoose.Types.ObjectId(String(toAssigneeId)),
          actorId: mongoose.Types.ObjectId.isValid(String(assignedBy)) ? new mongoose.Types.ObjectId(String(assignedBy)) : undefined,
          type: 'info',
          message: `Bạn được giao tiếp nhận ${fromSamples.length} mẫu (thay thế nhân sự).`,
        }).catch(() => {});
      }

      return res.status(200).json({
        success: true,
        message: `Đã chuyển ${fromSamples.length} mẫu sang người mới. Người cũ được giữ lịch sử để tính công.`,
        replacedSamples: fromSamples.length,
        lockedSubmissions: fromSubs.length,
      });
    } catch (error: any) {
      console.error('[AssignmentController] replaceAssignee error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * API: Thêm nhân viên vào tập dữ liệu đã assign (overlap/cross-check)
   * POST /api/dataprep/versions/:versionId/assignments/add-staff
   * Body: { assigneeIds: string[], aiAssigneeIds?: string[], fromAssigneeId?: string, taskName? }
   * Nếu có fromAssigneeId: copy đúng lô mẫu của người đó. Nếu không: lấy toàn bộ mẫu đang active của version.
   */
  async addAssignee(req: Request, res: Response) {
    try {
      const { versionId } = req.params;
      const { assigneeIds, aiAssigneeIds, fromAssigneeId, taskName } = req.body;
      const assignedBy = (req as any).user?.id || (req as any).user?._id || 'admin';

      if (!Array.isArray(assigneeIds) || assigneeIds.length === 0) {
        return res.status(400).json({ success: false, error: 'Cần chọn ít nhất 1 nhân viên để thêm' });
      }
      const aiAllowed = new Set<string>((Array.isArray(aiAssigneeIds) ? aiAssigneeIds : []).map((x: any) => String(x)));

      const version = await DatasetVersion.findById(versionId).lean();
      if (!version) return res.status(404).json({ success: false, error: 'Không tìm thấy DatasetVersion' });
      const projectId = (version as any).projectId;

      // Nguồn mẫu để copy
      const sampleQuery: any = { datasetVersionId: versionId, active: { $ne: false } };
      if (fromAssigneeId) sampleQuery.assigneeId = fromAssigneeId;
      let sourceSamples = await DatasetSampleAssignment.find(sampleQuery).sort({ sampleIndex: 1 }).lean();
      // Khử trùng theo sampleIndex (nếu lấy toàn version có thể trùng do overlap)
      const seen = new Set<number>();
      sourceSamples = sourceSamples.filter((s: any) => {
        if (seen.has(s.sampleIndex)) return false;
        seen.add(s.sampleIndex);
        return true;
      });
      if (sourceSamples.length === 0) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy mẫu nào để gán thêm' });
      }
      const startIndex = sourceSamples[0].sampleIndex;

      let added = 0;
      for (const assigneeId of assigneeIds) {
        const docs = sourceSamples.map((s: any) => ({
          projectId,
          datasetVersionId: versionId,
          sampleId: s.sampleId,
          assigneeId,
          assignedBy,
          sampleIndex: s.sampleIndex,
          taskType: s.taskType || 'labeling',
          priority: s.priority || 'medium',
          active: true,
        }));
        await DatasetSampleAssignment.insertMany(docs, { ordered: false }).catch(() => {});

        await DatasetAssignmentSubmission.create({
          projectId,
          datasetVersionId: versionId,
          assigneeId,
          status: 'pending' as const,
          name: (taskName && String(taskName).trim()) ? `${String(taskName).trim()} - Batch ${startIndex}` : `${version.projectName} Labeling - Batch ${startIndex}`,
          batchStart: startIndex,
          batchCount: sourceSamples.length,
          taskType: 'labeling',
          priority: 'medium',
          supervisor: assignedBy,
          dataset: version.projectName,
          version: version.versionName,
          totalSamples: sourceSamples.length,
          labeledCount: 0,
          aiAssistEnabled: aiAllowed.has(String(assigneeId)),
          active: true,
        });
        added++;

        if (mongoose.Types.ObjectId.isValid(String(assigneeId))) {
          await Stage4Notification.create({
            datasetVersionId: versionId,
            recipientId: new mongoose.Types.ObjectId(String(assigneeId)),
            actorId: mongoose.Types.ObjectId.isValid(String(assignedBy)) ? new mongoose.Types.ObjectId(String(assignedBy)) : undefined,
            type: 'info',
            message: `Bạn được thêm vào xử lý ${sourceSamples.length} mẫu.`,
          }).catch(() => {});
        }
      }

      broadcastAssignmentUpdate({ type: 'assignment_created', versionId, action: 'add_assignee' });
      return res.status(201).json({ success: true, message: `Đã thêm ${added} nhân viên vào ${sourceSamples.length} mẫu.`, addedStaff: added });
    } catch (error: any) {
      console.error('[AssignmentController] addAssignee error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * API: Gỡ nhân viên khỏi task (không thay người mới)
   * POST /api/dataprep/versions/:versionId/assignments/revoke
   * Body: { assigneeId, reason? }
   * Khóa phần của người đó nhưng GIỮ nhãn & lịch sử để tính công.
   */
  async revokeAssignee(req: Request, res: Response) {
    try {
      const { versionId } = req.params;
      const { assigneeId, reason } = req.body;
      if (!assigneeId) return res.status(400).json({ success: false, error: 'Thiếu assigneeId' });

      const sampleRes = await DatasetSampleAssignment.updateMany(
        { datasetVersionId: versionId, assigneeId, active: { $ne: false } },
        { $set: { active: false, revokedAt: new Date() } }
      );
      const subRes = await DatasetAssignmentSubmission.updateMany(
        { datasetVersionId: versionId, assigneeId, active: { $ne: false } },
        { $set: { active: false, revokedAt: new Date(), revokedReason: reason || 'Gỡ khỏi task' } }
      );

      broadcastAssignmentUpdate({ type: 'assignment_updated', versionId, action: 'revoke_assignee' });
      return res.status(200).json({
        success: true,
        message: 'Đã gỡ nhân viên khỏi task. Lịch sử & nhãn vẫn được giữ để tính công.',
        revokedSamples: sampleRes.modifiedCount || 0,
        lockedSubmissions: subRes.modifiedCount || 0,
      });
    } catch (error: any) {
      console.error('[AssignmentController] revokeAssignee error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * API: Lấy danh sách Tasks (Batches/Submissions) của Staff hiện tại
   * GET /api/dataprep/assignments/my-tasks
   */
  async getMyTasks(req: Request, res: Response) {
    try {
      const userId = req.query.userId || (req as any).user?.id || (req as any).user?._id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const myTasks = await DatasetAssignmentSubmission.find({ assigneeId: userId }).sort({ createdAt: -1 });

      // Transform _id to id for frontend compatibility
      const transformedTasks = myTasks.map(t => ({
        ...t.toObject(),
        id: t._id.toString()
      }));

      return res.status(200).json({ success: true, data: transformedTasks });
    } catch (error: any) {
      console.error('[AssignmentController] Error fetching my tasks:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * API: Lấy TẤT CẢ các Tasks cho Manager (Manager Dashboard)
   * GET /api/dataprep/assignments/all (LEGACY - keep for now)
   */
  async getAllTasks(_req: Request, res: Response) {
    try {
      const allTasks = await DatasetAssignmentSubmission.find().sort({ createdAt: -1 });
      return res.status(200).json({ success: true, data: allTasks });
    } catch (error: any) {
      console.error('[AssignmentController] Error fetching all tasks:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * API: Lấy Manager Overview (Grouped by Dataset Version / Task)
   * GET /api/dataprep/assignments/manager/overview
   */
  async getManagerOverview(req: Request, res: Response) {
    try {
      const authUser = (req as any).user;
      const role = String(authUser?.role || '').toLowerCase();
      const viewerId = String(authUser?._id || authUser?.userId || authUser?.id || '');
      if (role === 'supervisor' && !viewerId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }
      // Supervisors may only see submissions explicitly assigned to them.
      // Admin keeps the system-wide overview.
      const submissionFilter = role === 'supervisor' ? { supervisor: viewerId } : {};
      const submissions = await DatasetAssignmentSubmission.find(submissionFilter);
      const versionIds = [...new Set(submissions.map(s => String(s.datasetVersionId)))];
      const versions = await DatasetVersion.find({ _id: { $in: versionIds } });
      const versionMap = new Map(versions.map(v => [String(v._id), v]));

      const assigneeIds = [...new Set(submissions.map(s => String(s.assigneeId)))];
      const validAssigneeIds = assigneeIds.filter(id => mongoose.Types.ObjectId.isValid(id));
      const users = await User.find({ _id: { $in: validAssigneeIds } });
      const userMap = new Map(users.map(u => [String(u._id), u.email || u.name || String(u._id)]));

      const grouped: { [key: string]: any } = {};

      submissions.forEach(sub => {
        const vid = String(sub.datasetVersionId);
        const versionDoc = versionMap.get(vid);

        let baseName = sub.name;
        if (baseName && baseName.includes(' - Batch')) {
          baseName = baseName.split(' - Batch')[0];
        } else if (baseName && baseName.match(/^Batch \d+$/)) {
          baseName = 'Default Task';
        }

        const groupId = `${vid}_${baseName}`;

        if (!grouped[groupId]) {
          const resolvedProjectId = (sub as any).projectId
            ? String((sub as any).projectId)
            : (versionDoc && (versionDoc as any).projectId ? String((versionDoc as any).projectId) : '');
          grouped[groupId] = {
            id: groupId,
            projectId: resolvedProjectId,
            projectName: versionDoc ? versionDoc.projectName : (sub.dataset || 'Project Dataset'),
            name: baseName !== 'Default Task' ? baseName : (versionDoc ? versionDoc.versionName : `Dataset Version ${vid.substring(0, 6)}...`),
            dataset: versionDoc ? versionDoc.projectName : (sub.dataset || 'Project Dataset'),
            version: sub.version || vid,
            totalSamples: 0,
            labeledCount: 0,
            dueDate: sub.deadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            status: 'in_progress',
            priority: sub.priority || 'medium',
            batches: []
          };
        }

        let batch = grouped[groupId].batches.find((b: any) => b.name === sub.name);
        if (!batch) {
          batch = {
            id: `batch-${sub.batchStart}`,
            name: sub.name,
            totalSamples: sub.totalSamples,
            status: sub.status,
            assignees: []
          };
          grouped[groupId].batches.push(batch);
          grouped[groupId].totalSamples += sub.totalSamples;
          grouped[groupId].labeledCount += (sub.status === 'submitted' ? sub.totalSamples : sub.labeledCount || 0);
        }

        let finalName = userMap.get(String(sub.assigneeId));
        if (!finalName) {
          if (sub.assigneeId === 'fake-staff-1') finalName = 'Nguyễn Văn A';
          else if (sub.assigneeId === 'fake-staff-2') finalName = 'Trần Thị B';
          else finalName = String(sub.assigneeId);
        }

        batch.assignees.push({
          id: sub.assigneeId,
          submissionId: String(sub._id),
          name: finalName,
          progress: sub.status === 'submitted' ? 100 : (sub.labeledCount / (sub.totalSamples || 1)) * 100 || 0,
          status: sub.status,
          active: (sub as any).active !== false,
          aiAssistEnabled: !!(sub as any).aiAssistEnabled,
        });
        // A grouped batch is reviewable as soon as any assignee submits. Do not
        // leave its status stuck on whichever submission was iterated first.
        const statusRank: Record<string, number> = { rejected: 0, pending: 1, in_progress: 2, draft: 2, submitted: 3, approved: 4, completed: 4 };
        if ((statusRank[String(sub.status)] || 0) > (statusRank[String(batch.status)] || 0)) {
          batch.status = sub.status;
        }
      });

      return res.status(200).json({ success: true, data: Object.values(grouped) });
    } catch (error: any) {
      console.error('[AssignmentController] Error fetching manager overview:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * API: Lấy chi tiết một Task (Version) cho Manager Monitoring
   * GET /api/dataprep/assignments/manager/task/:taskId
   */
  async getTaskDetail(req: Request, res: Response) {
    try {
      const { taskId } = req.params;

      let versionId = taskId;
      let baseName = '';
      if (taskId.includes('_')) {
        const parts = taskId.split('_');
        versionId = parts[0];
        baseName = parts.slice(1).join('_');
      }

      const query: any = { datasetVersionId: versionId };
      if (baseName && baseName !== 'Default Task') {
        query.name = new RegExp('^' + baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      } else if (baseName === 'Default Task') {
        query.name = /^Batch \d+$/;
      }

      const subs = await DatasetAssignmentSubmission.find(query);
      if (subs.length === 0) {
        // Return empty structure instead of 404 so UI can render
        return res.status(200).json({
          success: true,
          data: { id: taskId, batches: [], staffList: [], conflicts: [], samples: [] }
        });
      }

      // Lấy version metadata cho tên hiển thị
      const version = await DatasetVersion.findById(versionId).lean();

      const batchesMap: { [key: string]: any } = {};
      const staffMap: { [key: string]: any } = {};
      let totalSamples = 0;
      let totalLabeled = 0;

      const assigneeIds = [...new Set(subs.map(s => String(s.assigneeId)))];
      const validAssigneeIds = assigneeIds.filter(id => mongoose.Types.ObjectId.isValid(id));
      const users = await User.find({ _id: { $in: validAssigneeIds } });
      const userMap = new Map(users.map(u => [String(u._id), u.email || u.name || String(u._id)]));

      subs.forEach(sub => {
        const assigneeIdStr = String(sub.assigneeId);

        let finalName = userMap.get(assigneeIdStr);
        if (!finalName) {
          if (assigneeIdStr === 'fake-staff-1') finalName = 'Nguyễn Văn A';
          else if (assigneeIdStr === 'fake-staff-2') finalName = 'Trần Thị B';
          else finalName = assigneeIdStr;
        }

        // Build Staff — tích lũy submissionIds
        if (!staffMap[assigneeIdStr]) {
          staffMap[assigneeIdStr] = {
            id: assigneeIdStr,
            name: finalName,
            progress: 0,
            total: 0,
            status: sub.status,
            submittedAt: sub.submittedAt || null,
            submissionId: String(sub._id), // Trả submissionId cho Approve/Reject
            submissionIds: [String(sub._id)],
            aiAssistEnabled: !!(sub as any).aiAssistEnabled,
          };
        } else {
          staffMap[assigneeIdStr].submissionIds.push(String(sub._id));
          // Ưu tiên status submitted > in_progress > pending
          const statusPriority: any = { submitted: 3, in_progress: 2, pending: 1, approved: 4, rejected: 0 };
          if ((statusPriority[sub.status] || 0) > (statusPriority[staffMap[assigneeIdStr].status] || 0)) {
            staffMap[assigneeIdStr].status = sub.status;
            staffMap[assigneeIdStr].submissionId = String(sub._id);
          }
          // OR aiAssistEnabled: nếu bất kỳ submission nào được phép thì coi là bật
          staffMap[assigneeIdStr].aiAssistEnabled =
            staffMap[assigneeIdStr].aiAssistEnabled || !!(sub as any).aiAssistEnabled;
        }
        staffMap[assigneeIdStr].total += sub.totalSamples;
        const subLabeled = sub.status === 'submitted' || sub.status === 'approved' ? sub.totalSamples : (sub.labeledCount || 0);
        staffMap[assigneeIdStr].progress += subLabeled;

        // Build Batch
        let batch = batchesMap[sub.name];
        if (!batch) {
          batch = {
            id: `batch-${sub.batchStart}`,
            name: sub.name,
            totalSamples: sub.totalSamples,
            labeledCount: sub.labeledCount || 0,
            status: sub.status,
            batchStart: sub.batchStart,
            batchEnd: sub.batchStart + (sub.batchCount || sub.totalSamples) - 1,
            assignees: [],
            staffIds: [] as string[],
          };
          batchesMap[sub.name] = batch;
          totalSamples += sub.totalSamples;
          totalLabeled += subLabeled;
        }
        batch.assignees.push(staffMap[assigneeIdStr].name);
        if (!batch.staffIds.includes(assigneeIdStr)) batch.staffIds.push(assigneeIdStr);
      });

      // === FIX: Dùng versionId (không phải taskId composite) để query samples ===
      const sampleAssigns = await DatasetSampleAssignment.find({ datasetVersionId: versionId }).sort({ sampleIndex: 1 });
      const samplesMap: { [key: number]: any } = {};
      const sampleIdMap: { [key: string]: number } = {};
      const allSampleObjectIds: string[] = [];

      for (const sa of sampleAssigns) {
        if (!samplesMap[sa.sampleIndex]) {
          samplesMap[sa.sampleIndex] = {
            id: sa.sampleIndex,
            sampleObjectId: String(sa.sampleId), // ID thật để mở SplitView
            key: `sample_${String(sa.sampleIndex).padStart(3, '0')}`,
            preview: '',
            assignees: [],
            staffStatus: {},
            staffLabels: {},
            conflict: false,
          };
          sampleIdMap[String(sa.sampleId)] = sa.sampleIndex;
          allSampleObjectIds.push(String(sa.sampleId));
        }
        const assigneeName = staffMap[String(sa.assigneeId)]?.name || String(sa.assigneeId);
        if (!samplesMap[sa.sampleIndex].assignees.includes(assigneeName)) {
          samplesMap[sa.sampleIndex].assignees.push(assigneeName);
        }
        samplesMap[sa.sampleIndex].staffStatus[String(sa.assigneeId)] = 'pending';
      }

      // === FIX: Fetch nội dung thật từ ProcessedDatasetItem thay vì placeholder ===
      if (allSampleObjectIds.length > 0) {
        const validIds = allSampleObjectIds.filter(id => mongoose.Types.ObjectId.isValid(id));
        const processedItems = await ProcessedDatasetItem.find({ _id: { $in: validIds } }).select('_id data').lean();
        const itemMap = new Map(processedItems.map(item => [String(item._id), item]));

        for (const sampleObjId of allSampleObjectIds) {
          const sIndex = sampleIdMap[sampleObjId];
          const item = itemMap.get(sampleObjId);
          if (item && sIndex && samplesMap[sIndex]) {
            const data = (item as any).data || {};
            let preview = '';
            if (Array.isArray(data.messages) && data.messages.length > 0) {
              // Lấy 2 tin nhắn đầu, mỗi tin cắt 100 ký tự
              preview = data.messages.slice(0, 2).map((m: any) => {
                const role = m.role === 'user' ? 'U' : 'A';
                const text = (m.content || '').substring(0, 100);
                return `[${role}] ${text}`;
              }).join(' | ');
            } else if (data.prompt || data.response) {
              preview = `[U] ${(data.prompt || '').substring(0, 80)} | [A] ${(data.response || '').substring(0, 80)}`;
            }
            samplesMap[sIndex].preview = preview || `Sample #${sIndex}`;
          }
        }
      }

      const sampleIdArray = Object.keys(sampleIdMap);
      const sampleObjectIdArray = sampleIdArray.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));
      const labels = await LabelAssignment.find({ sampleId: { $in: sampleObjectIdArray } });

      const conflictMap: { [key: number]: any } = {};

      for (const label of labels) {
        const sIndex = sampleIdMap[String(label.sampleId)];
        if (sIndex && samplesMap[sIndex]) {
          // Only mark 'done' if the saved label is complete (has subject + completion + quality)
          const parsed = parseSavedLabel(label.targetTextSnapshot);
          const isComplete = isCompleteStaffLabel(parsed);
          samplesMap[sIndex].staffStatus[String(label.createdBy)] = isComplete ? 'done' : 'in_progress';
          samplesMap[sIndex].staffLabels[String(label.createdBy)] = {
            name: label.name,
            subject: parsed?.subject || null,
            quality: parsed?.quality || null,
            completion: parsed?.completion || null,
            isDraft: !isComplete,
            raw: parsed?.subject || label.name,
          };
          if (!conflictMap[sIndex]) conflictMap[sIndex] = [];
          conflictMap[sIndex].push(label);
        }
      }

      const samples = Object.values(samplesMap);
      const conflicts = [];
      for (const sIndexStr of Object.keys(conflictMap)) {
        const sIndex = Number(sIndexStr);
        const sLabels = conflictMap[sIndex];
        if (sLabels.length > 1) {
          const firstLabelName = sLabels[0].name;
          const hasConflict = sLabels.some((l: any) => l.name !== firstLabelName);
          if (hasConflict || true) { // Always show as conflict for now if > 1 label for demo purposes
            samplesMap[sIndex].conflict = true;
            conflicts.push({
              sampleId: sIndex,
              key: samplesMap[sIndex].key,
              annotators: sLabels.length,
              iaa: 0.45,
              status: 'pending' as const,
              labelA: { subject: staffMap[String(sLabels[0].createdBy)]?.name || String(sLabels[0].createdBy), quality: sLabels[0].name },
              labelB: { subject: staffMap[String(sLabels[1].createdBy)]?.name || String(sLabels[1].createdBy), quality: sLabels[1].name }
            });
          }
        }
      }

      // Tên hiển thị: ưu tiên dataset + taskName
      const displayName = baseName && baseName !== 'Default Task'
        ? `${version?.projectName || 'Dataset'} - ${baseName}`
        : version?.projectName || version?.versionName || `Dataset Version`;

      const data = {
        id: taskId,
        name: displayName,
        totalSamples,
        labeledCount: totalLabeled,
        batches: Object.values(batchesMap),
        staffList: Object.values(staffMap).map((s: any) => ({
          ...s,
          completion: s.total > 0 ? (s.progress / s.total) * 100 : 0
        })),
        samples,
        conflicts
      };

      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error('[AssignmentController] Error fetching task detail:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * API: Lấy chi tiết mẫu câu hội thoại của 1 Batch (cho Staff Workspace)
   * GET /api/dataprep/assignments/my-task/:submissionId/samples
   */
  async getBatchSamples(req: Request, res: Response) {
    try {
      const { submissionId } = req.params;
      const submission = await DatasetAssignmentSubmission.findById(submissionId);

      if (!submission) {
        return res.status(404).json({ success: false, error: 'Submission not found' });
      }

      // Find the assignments for this batch/submission
      // In our logic, the samples for this batch start at submission.batchStart with length batchCount
      const sampleAssigns = await DatasetSampleAssignment.find({
        datasetVersionId: submission.datasetVersionId,
        assigneeId: submission.assigneeId,
        sampleIndex: { $gte: submission.batchStart, $lt: submission.batchStart + submission.batchCount }
      }).sort({ sampleIndex: 1 });

      // Fetch processed dataset items to get the REAL data
      const processedItems = await ProcessedDatasetItem.find({
        _id: { $in: sampleAssigns.map(sa => sa.sampleId) }
      });

      const samples = sampleAssigns.map(sa => {
        const item = processedItems.find(p => p._id.toString() === sa.sampleId.toString());
        const data = item?.data || {};

        let messages = [];
        if (Array.isArray(data.messages)) {
          messages = data.messages;
        } else if (data.prompt || data.response) {
          messages = [];
          if (data.prompt) messages.push({ role: 'user', content: data.prompt });
          if (data.response) messages.push({ role: 'assistant', content: data.response });
        } else {
          messages = [
            { role: 'user', content: `[Lô ${submission.name} - Câu ${sa.sampleIndex}] Xin chào, em cần trợ giúp.` },
            { role: 'assistant', content: `Đây là dữ liệu của câu ${sa.sampleIndex}. Tôi có thể giúp gì cho bạn?` },
          ];
        }

        return {
          id: sa.sampleIndex, // use index as ID for frontend
          messages: messages,
          savedLabel: null,
          reviewStatus: (sa as any).reviewStatus || 'labeling',
          rejectReason: (sa as any).rejectReason || '',
          _dbId: sa._id // keep db id
        };
      });

      // Fetch saved labels for this assignee
      const labels = await LabelAssignment.find({
        createdBy: submission.assigneeId,
        sampleId: { $in: sampleAssigns.map(sa => sa.sampleId) },
        type: 'soft',
        targetScope: 'sample'
      });

      // Map labels to samples
      samples.forEach(s => {
        const sa = sampleAssigns.find(a => a.sampleIndex === s.id);
        if (sa) {
          const l = labels.find(lb => lb.sampleId.toString() === sa.sampleId.toString());
          if (l) {
            // Mock reconstruct the label format
            s.savedLabel = l.targetTextSnapshot ? JSON.parse(l.targetTextSnapshot) : null;
          }
        }
      });

      return res.status(200).json({ success: true, data: { submission, samples } });
    } catch (error: any) {
      console.error('[AssignmentController] Error fetching batch samples:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * API: Lưu nhãn cho một Sample (cho Staff Workspace)
   * POST /api/dataprep/assignments/my-task/:submissionId/save-label
   */
  async saveSampleLabel(req: Request, res: Response) {
    try {
      const { submissionId } = req.params;
      const { sampleId, label } = req.body;

      const submission = await DatasetAssignmentSubmission.findById(submissionId);
      if (!submission) {
        return res.status(404).json({ success: false, error: 'Submission not found' });
      }

      if (submission.status === 'submitted') {
        return res.status(400).json({ success: false, error: 'Batch already submitted' });
      }

      // Đã bị rút/thay thế: giữ lịch sử nhưng không cho sửa tiếp
      if ((submission as any).active === false) {
        return res.status(403).json({ success: false, error: 'Task này đã bị thu hồi/thay thế. Bạn không thể chỉnh sửa tiếp.' });
      }

      // Find the specific assignment (sampleId from FE is the sampleIndex, may come as string)
      const sa = await DatasetSampleAssignment.findOne({
        datasetVersionId: submission.datasetVersionId,
        assigneeId: submission.assigneeId,
        sampleIndex: Number(sampleId)
      });

      if (!sa) {
        return res.status(404).json({ success: false, error: 'Sample assignment not found' });
      }

      // Câu đã nộp/đã duyệt thì không cho sửa (câu bị từ chối thì được mở lại)
      if ((sa as any).reviewStatus === 'submitted' || (sa as any).reviewStatus === 'approved') {
        return res.status(403).json({ success: false, error: 'Câu này đã nộp/được duyệt, không thể sửa.' });
      }

      // Upsert label
      const existingLabel = await LabelAssignment.findOne({
        createdBy: submission.assigneeId,
        sampleId: sa.sampleId,
        type: 'soft',
        targetScope: 'sample'
      });

      if (existingLabel) {
        existingLabel.targetTextSnapshot = JSON.stringify(label);
        await existingLabel.save();
      } else {
        await LabelAssignment.create({
          sampleId: sa.sampleId,
          createdBy: submission.assigneeId,
          name: 'Label',
          type: 'soft',
          targetScope: 'sample',
          targetTextSnapshot: JSON.stringify(label)
        });
      }

      const submissionAssignments = await DatasetSampleAssignment.find({
        datasetVersionId: submission.datasetVersionId,
        assigneeId: submission.assigneeId,
        sampleIndex: { $gte: submission.batchStart, $lt: submission.batchStart + submission.batchCount }
      }).select('sampleId').lean();
      const assignmentSampleIds = submissionAssignments.map((item: any) => item.sampleId);
      const savedLabels = assignmentSampleIds.length
        ? await LabelAssignment.find({
          createdBy: submission.assigneeId,
          sampleId: { $in: assignmentSampleIds },
          targetScope: 'sample',
        }).select('targetTextSnapshot').lean()
        : [];
      submission.labeledCount = savedLabels.filter((item: any) => isCompleteStaffLabel(parseSavedLabel(item.targetTextSnapshot))).length;

      if (submission.status === 'pending') {
        submission.status = 'in_progress';
      }

      await submission.save();

      // Trigger SSE update for Step 7 real-time reflection
      broadcastAssignmentUpdate({ type: 'assignment_updated', submissionId, action: 'save_draft' });

      return res.status(200).json({ success: true, data: submission });
    } catch (error: any) {
      console.error('[AssignmentController] Error saving sample label:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * API: Staff NỘP LẺ một hoặc nhiều câu (không cần xong cả lô)
   * POST /api/dataprep/assignments/my-task/:submissionId/samples/submit
   * Body: { sampleIndexes: number[], labels?: Record<string|number, any> }
   */
  async submitSamples(req: Request, res: Response) {
    try {
      const { submissionId } = req.params;
      const { sampleIndexes, labels } = req.body;

      const submission = await DatasetAssignmentSubmission.findById(submissionId);
      if (!submission) {
        return res.status(404).json({ success: false, error: 'Submission not found' });
      }
      if ((submission as any).active === false) {
        return res.status(403).json({ success: false, error: 'Task này đã bị thu hồi/thay thế.' });
      }
      const indexes: number[] = Array.isArray(sampleIndexes) ? sampleIndexes.map((n: any) => Number(n)).filter((n) => Number.isFinite(n)) : [];
      if (indexes.length === 0) {
        return res.status(400).json({ success: false, error: 'Chưa chọn câu nào để nộp' });
      }

      const sampleAssigns = await DatasetSampleAssignment.find({
        datasetVersionId: submission.datasetVersionId,
        assigneeId: submission.assigneeId,
        sampleIndex: { $in: indexes },
        active: { $ne: false },
      });

      let submitted = 0;
      for (const sa of sampleAssigns) {
        if ((sa as any).reviewStatus === 'approved') continue; // đã duyệt thì bỏ qua
        // Lưu nhãn kèm theo nếu có
        const labelData = labels ? (labels[(sa as any).sampleIndex] ?? labels[String((sa as any).sampleIndex)]) : undefined;
        if (labelData && typeof labelData === 'object' && Object.keys(labelData).length > 0) {
          await LabelAssignment.findOneAndUpdate(
            { createdBy: submission.assigneeId, sampleId: sa.sampleId },
            { $set: { name: 'Label', type: 'soft', targetScope: 'sample', targetTextSnapshot: JSON.stringify(labelData) } },
            { upsert: true }
          );
        }
        (sa as any).reviewStatus = 'submitted';
        (sa as any).submittedAt = new Date();
        (sa as any).rejectReason = '';
        await sa.save();
        submitted++;
      }

      await this.recomputeSubmissionCounts(submission);

      broadcastAssignmentUpdate({ type: 'assignment_updated', submissionId, action: 'submit_samples' });
      return res.status(200).json({ success: true, message: `Đã nộp ${submitted} câu.`, submitted });
    } catch (error: any) {
      console.error('[AssignmentController] submitSamples error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /** Tính lại tiến độ submission từ trạng thái review thực tế của các câu */
  private async recomputeSubmissionCounts(submission: any) {
    const sas = await DatasetSampleAssignment.find({
      datasetVersionId: submission.datasetVersionId,
      assigneeId: submission.assigneeId,
      sampleIndex: { $gte: submission.batchStart, $lt: submission.batchStart + submission.batchCount },
    }).select('reviewStatus').lean();
    const submittedCount = sas.filter((s: any) => s.reviewStatus === 'submitted' || s.reviewStatus === 'approved').length;
    const approvedCount = sas.filter((s: any) => s.reviewStatus === 'approved').length;
    submission.labeledCount = submittedCount;
    (submission as any).submittedCount = submittedCount;
    (submission as any).approvedCount = approvedCount;
    // Trạng thái lô suy ra từ tiến độ
    if (approvedCount >= submission.batchCount && submission.batchCount > 0) submission.status = 'approved';
    else if (submittedCount >= submission.batchCount && submission.batchCount > 0) submission.status = 'submitted';
    else if (submittedCount > 0) submission.status = 'in_progress';
    await submission.save();
  }

  /**
   * API: Hàng đợi duyệt (Review Queue) — danh sách câu đã nộp theo Project/Version
   * GET /api/dataprep/assignments/review-queue?projectId=&versionId=&assigneeId=&status=submitted&q=&page=&limit=
   */
  async getReviewQueue(req: Request, res: Response) {
    try {
      const { projectId, versionId, assigneeId, status, q, page, limit } = req.query as any;
      if (!projectId && !versionId) {
        return res.status(400).json({ success: false, error: 'Cần chọn Project (hoặc Version) để xem hàng đợi.' });
      }
      const filter: any = { active: { $ne: false } };
      if (projectId) filter.projectId = projectId;
      if (versionId) filter.datasetVersionId = versionId;
      if (assigneeId) filter.assigneeId = assigneeId;
      if (status && status !== 'all') filter.reviewStatus = status;
      else filter.reviewStatus = { $in: ['submitted', 'approved', 'rejected'] };

      const pageN = Math.max(1, parseInt(page) || 1);
      const lim = Math.min(100, Math.max(1, parseInt(limit) || 20));

      const total = await DatasetSampleAssignment.countDocuments(filter);
      const rows = await DatasetSampleAssignment.find(filter)
        .sort({ sampleIndex: 1, assigneeId: 1 })
        .skip((pageN - 1) * lim)
        .limit(lim)
        .lean();

      const sampleIds = rows.map((r: any) => r.sampleId);
      const [items, labels] = await Promise.all([
        ProcessedDatasetItem.find({ _id: { $in: sampleIds } }).select('_id data').lean(),
        LabelAssignment.find({ sampleId: { $in: sampleIds } }).lean(),
      ]);
      const itemMap = new Map(items.map((i: any) => [String(i._id), i]));
      const userIds = [...new Set(rows.map((r: any) => String(r.assigneeId)).filter((id: string) => mongoose.Types.ObjectId.isValid(id)))];
      const users = await User.find({ _id: { $in: userIds } }).lean();
      const userMap = new Map(users.map((u: any) => [String(u._id), u.email || u.name || String(u._id)]));

      const preview = (data: any): string => {
        if (!data) return '';
        if (Array.isArray(data.messages) && data.messages.length) {
          const u = data.messages.find((m: any) => m.role === 'user');
          const a = data.messages.find((m: any) => m.role === 'assistant');
          return `[U] ${String(u?.content || '').slice(0, 80)} | [A] ${String(a?.content || '').slice(0, 80)}`;
        }
        return String(data.prompt || data.text || '').slice(0, 140);
      };
      const safeParse = (s?: string) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

      const data = rows.map((r: any) => {
        const item = itemMap.get(String(r.sampleId));
        const label = labels.find((l: any) => String(l.sampleId) === String(r.sampleId) && String(l.createdBy) === String(r.assigneeId));
        return {
          assignmentId: String(r._id),
          sampleIndex: r.sampleIndex,
          sampleId: String(r.sampleId),
          versionId: String(r.datasetVersionId),
          projectId: r.projectId ? String(r.projectId) : '',
          assigneeId: String(r.assigneeId),
          assigneeName: userMap.get(String(r.assigneeId)) || String(r.assigneeId),
          reviewStatus: r.reviewStatus || 'labeling',
          rejectReason: r.rejectReason || '',
          preview: preview(item?.data),
          label: label ? safeParse(label.targetTextSnapshot) : null,
        };
      });

      const filtered = q && String(q).trim()
        ? data.filter((d) => d.preview.toLowerCase().includes(String(q).toLowerCase()) || d.assigneeName.toLowerCase().includes(String(q).toLowerCase()))
        : data;

      return res.status(200).json({ success: true, data: filtered, total, page: pageN, limit: lim });
    } catch (error: any) {
      console.error('[AssignmentController] getReviewQueue error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * API: Duyệt / Từ chối nhiều câu (lẻ hoặc hàng loạt)
   * POST /api/dataprep/assignments/samples/review
   * Body: { assignmentIds: string[], action: 'approve'|'reject', reason? }
   */
  async reviewSamples(req: Request, res: Response) {
    try {
      const { assignmentIds, action, reason } = req.body;
      const reviewerId = (req as any).user?.id || (req as any).user?._id || 'admin';
      if (!Array.isArray(assignmentIds) || assignmentIds.length === 0) {
        return res.status(400).json({ success: false, error: 'Chưa chọn câu nào' });
      }
      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ success: false, error: 'action không hợp lệ' });
      }

      const sas = await DatasetSampleAssignment.find({ _id: { $in: assignmentIds } });
      for (const sa of sas) {
        (sa as any).reviewStatus = action === 'approve' ? 'approved' : 'rejected';
        (sa as any).reviewedAt = new Date();
        (sa as any).reviewedBy = reviewerId;
        (sa as any).rejectReason = action === 'reject' ? (reason || 'Cần chỉnh sửa') : '';
        await sa.save();
      }

      // Tính lại tiến độ các submission bị ảnh hưởng
      const affected = new Set(sas.map((sa: any) => `${sa.datasetVersionId}|${sa.assigneeId}`));
      for (const key of affected) {
        const [vid, aid] = key.split('|');
        const subs = await DatasetAssignmentSubmission.find({ datasetVersionId: vid, assigneeId: aid });
        for (const sub of subs) await this.recomputeSubmissionCounts(sub);
      }

      broadcastAssignmentUpdate({ type: 'assignment_updated', action: 'review_samples' } as any);
      return res.status(200).json({ success: true, message: `Đã ${action === 'approve' ? 'duyệt' : 'từ chối'} ${sas.length} câu.`, updated: sas.length });
    } catch (error: any) {
      console.error('[AssignmentController] reviewSamples error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * API: Chốt nhãn chuẩn (Canonical) cho 1 câu — tách khỏi duyệt cá nhân
   * POST /api/dataprep/assignments/samples/canonical
   * Body: { versionId, sampleId, labels?: string[], targetTextSnapshot?, sourceAnnotatorIds?: string[] }
   */
  async setCanonical(req: Request, res: Response) {
    try {
      const { versionId, sampleId, labels, targetTextSnapshot, sourceAnnotatorIds } = req.body;
      const publishedBy = (req as any).user?.id || (req as any).user?._id;
      if (!versionId || !sampleId) {
        return res.status(400).json({ success: false, error: 'Thiếu versionId/sampleId' });
      }
      const doc = await DatasetCanonicalLabel.findOneAndUpdate(
        { datasetVersionId: versionId, sampleId, targetScope: 'sample', messageIndex: null, messageRole: null },
        {
          $set: {
            labels: Array.isArray(labels) ? labels : [],
            targetTextSnapshot: targetTextSnapshot || '',
            sourceType: 'owner_manual_resolution',
            sourceAnnotatorIds: Array.isArray(sourceAnnotatorIds) ? sourceAnnotatorIds : [],
            publishedBy,
            publishedAt: new Date(),
          },
        },
        { upsert: true, new: true }
      );
      return res.status(200).json({ success: true, canonical: doc });
    } catch (error: any) {
      console.error('[AssignmentController] setCanonical error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * API: Staff nộp bài (Submit Batch)
   * POST /api/dataprep/versions/:versionId/assignments/submit
   * Body: { submissionId, labels?: Record<string|number, any> }
   *   labels: map từ sampleIndex -> label object (gửi kèm để đảm bảo không mất data dù staff chưa Save Draft)
   */
  async submitTask(req: Request, res: Response) {
    try {
      const { submissionId, labels: labelsPayload } = req.body;

      if (!submissionId) {
        return res.status(400).json({ success: false, error: 'Missing submissionId' });
      }

      const submission = await DatasetAssignmentSubmission.findById(submissionId);
      if (!submission) {
        return res.status(404).json({ success: false, error: 'Submission not found' });
      }

      // ── Step 1: Nếu FE gửi kèm labels, upsert soft-label trước khi promote ──
      // Điều này đảm bảo staff chưa Save Draft vẫn có labels được lưu đúng.
      if (labelsPayload && typeof labelsPayload === 'object') {
        const sampleAssigns = await DatasetSampleAssignment.find({
          datasetVersionId: submission.datasetVersionId,
          assigneeId: submission.assigneeId,
          sampleIndex: { $gte: submission.batchStart, $lt: submission.batchStart + submission.batchCount }
        }).lean();

        const upsertOps = sampleAssigns.flatMap((sa: any) => {
          const labelData = labelsPayload[sa.sampleIndex] ?? labelsPayload[String(sa.sampleIndex)];
          if (!labelData || (typeof labelData === 'object' && Object.keys(labelData).length === 0)) return [];
          return [{
            updateOne: {
              filter: {
                createdBy: submission.assigneeId,
                sampleId: sa.sampleId,
                type: 'soft',
                targetScope: 'sample',
              },
              update: { $set: {
                name: 'Label',
                type: 'soft',
                targetScope: 'sample',
                targetTextSnapshot: JSON.stringify(labelData),
              } },
              upsert: true,
            }
          }];
        });
        if (upsertOps.length > 0) {
          await LabelAssignment.bulkWrite(upsertOps as any, { ordered: false });
        }
      }

      // ── Step 2: Mark submitted & promote to hard labels ──
      const wasSubmitted = submission.status === 'submitted';
      submission.status = 'submitted';
      submission.submittedAt = new Date();

      const { hardLabels, messagesBySample } = await promoteSubmissionLabels(submission);

      // Prefer the rule-based score (intent/action matching, mirrors the Quality stage).
      // Fall back to the coverage-based score only when no sample has a scorable turn.
      const ruleScore = computeRuleBasedHumanScore(hardLabels || [], messagesBySample);
      submission.humanScore = ruleScore != null
        ? ruleScore
        : calculateHumanScore(hardLabels || [], submission.totalSamples || 0);

      await submission.save();

      if (!wasSubmitted) {
        const actorId = mongoose.Types.ObjectId.isValid(String(submission.assigneeId))
          ? new mongoose.Types.ObjectId(String(submission.assigneeId))
          : undefined;
        const actor = actorId ? await User.findById(actorId).select('name email').lean() : null;
        const actorName = String((actor as any)?.name || (actor as any)?.email || submission.assigneeId || 'Staff');
        const submitMessage = `${actorName} submitted ${submission.name || 'labeling task'}.`;
        await Stage4Notification.insertMany([
          {
            datasetVersionId: submission.datasetVersionId,
            recipientRole: 'admin',
            actorId,
            type: 'success',
            message: submitMessage,
          },
          {
            datasetVersionId: submission.datasetVersionId,
            recipientRole: 'supervisor',
            actorId,
            type: 'success',
            message: submitMessage,
          },
        ]);
      }

      // Trigger SSE update for Step 7 real-time reflection
      broadcastAssignmentUpdate({ type: 'assignment_updated', submissionId, action: 'submit' });

      return res.status(200).json({ success: true, data: submission });
    } catch (error: any) {
      console.error('[AssignmentController] Error submitting task:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * API: Lấy dữ liệu Split-View cho Supervisor (Bản gốc vs Bản Preview)
   * GET /api/dataprep/assignments/manager/sample/:sampleId/split-view?staffId=xxx
   */
  async getSampleSplitView(req: Request, res: Response) {
    try {
      const { sampleId } = req.params;
      const staffId = req.query.staffId as string;

      // 1. NỬA TRÁI: Bản gốc
      const item = await ProcessedDatasetItem.findById(sampleId).lean();
      if (!item) {
        return res.status(404).json({ success: false, error: 'Sample not found' });
      }

      let originalMessages: any[] = [];
      const data = item.data || {};
      if (Array.isArray(data.messages)) {
        originalMessages = data.messages;
      } else if (data.prompt || data.response) {
        if (data.prompt) originalMessages.push({ role: 'user', content: data.prompt });
        if (data.response) originalMessages.push({ role: 'assistant', content: data.response });
      }

      // 2. NỬA PHẢI: Labels overlay
      // Query with $or for both ObjectId and string representations to be robust
      const sampleObjectId = mongoose.Types.ObjectId.isValid(sampleId) ? new mongoose.Types.ObjectId(sampleId) : sampleId;
      const sampleQuery = mongoose.Types.ObjectId.isValid(sampleId)
        ? { $or: [{ sampleId: new mongoose.Types.ObjectId(sampleId) }, { sampleId: sampleId }] }
        : { sampleId: sampleId };
      let labelQuery: any = { ...sampleQuery };
      if (staffId) {
        const createdByVariants: any[] = [staffId]; // always include string form
        if (mongoose.Types.ObjectId.isValid(staffId)) createdByVariants.push(new mongoose.Types.ObjectId(staffId));
        labelQuery.createdBy = { $in: createdByVariants };
      }
      let labels = await LabelAssignment.find(labelQuery).lean();
      // Fallback: if no labels found with staffId filter, try without (show any label for sample)
      if (labels.length === 0 && staffId) {
        labels = await LabelAssignment.find(sampleQuery).lean();
      }

      // 3. NỬA PHẢI: Rewrites overlay
      const { ConversationRewriteHistory } = require('../../../models/ConversationRewriteHistory');
      const rewriteQuery: any = { sampleId };
      if (staffId) rewriteQuery.editorId = staffId;
      const rewrites = await ConversationRewriteHistory.find(rewriteQuery).lean();

      // 4. Map labels và rewrites theo messageIndex
      const labelsByMsg: Record<number, any[]> = {};
      const sampleLabels: any[] = [];
      for (const label of labels) {
        if (label.targetScope === 'message' && label.messageIndex != null) {
          if (!labelsByMsg[label.messageIndex]) labelsByMsg[label.messageIndex] = [];
          labelsByMsg[label.messageIndex].push({
            name: label.name,
            type: label.type,
            role: label.messageRole,
          });
        } else if (label.targetScope === 'sample') {
          // Parse soft label blob for Socratic taxonomy (subject/completion/quality + per-message intent/action)
          const parsed = parseSavedLabel((label as any).targetTextSnapshot);
          if (parsed) {
            // Conversation-level summary
            const parts: string[] = [];
            if (parsed.subject) parts.push(parsed.subject);
            if (parsed.quality) parts.push('Chất lượng: ' + parsed.quality);
            if (parsed.completion) parts.push('Hoàn thành: ' + parsed.completion);
            if (parts.length) sampleLabels.push({ name: parts.join(' · '), type: label.type });
            // Message-level intent/action extracted from blob
            if (parsed.messages && typeof parsed.messages === 'object') {
              for (const [msgIdxStr, msgData] of Object.entries(parsed.messages as Record<string, any>)) {
                const msgIdx = parseInt(msgIdxStr);
                if (isNaN(msgIdx)) continue;
                if (!labelsByMsg[msgIdx]) labelsByMsg[msgIdx] = [];
                const labelName = msgData.intent || msgData.action || '';
                if (labelName) {
                  const conf = msgData.confidence != null ? Math.round(msgData.confidence * 100) + '%' : '';
                  const pedFlag = msgData.is_correct_pedagogy === false ? ' ⚠️' : '';
                  labelsByMsg[msgIdx].push({
                    name: labelName + (conf ? ' (' + conf + ')' : '') + pedFlag,
                    type: 'soft',
                    role: msgData.intent ? 'user' : 'assistant',
                    pedagogy_note: msgData.pedagogy_note || '',
                  });
                }
              }
            }
          } else {
            sampleLabels.push({ name: label.name, type: label.type });
          }
        }
      }

      const rewritesByMsg: Record<number, any> = {};
      for (const rw of rewrites) {
        rewritesByMsg[rw.messageIndex] = {
          originalText: rw.originalText,
          proposedText: rw.proposedText,
          approvedText: rw.approvedText,
          editReason: rw.editReason,
          editType: rw.editType,
        };
      }

      return res.status(200).json({
        success: true,
        data: {
          original: { messages: originalMessages },
          labeled: {
            sampleLabels,
            messageLabels: labelsByMsg,
            rewrites: rewritesByMsg,
          },
        },
      });
    } catch (error: any) {
      console.error('[AssignmentController] getSampleSplitView error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * API: Supervisor duyệt (Approve) submission của nhân viên
   * POST /api/dataprep/assignments/manager/submission/:submissionId/approve
   */
  async approveSubmission(req: Request, res: Response) {
    try {
      const { submissionId } = req.params;
      const userId = (req as any).user?.id || (req as any).user?._id || 'admin';

      const submission = await DatasetAssignmentSubmission.findById(submissionId);
      if (!submission) {
        return res.status(404).json({ success: false, error: 'Submission not found' });
      }

      if (submission.status !== 'submitted') {
        return res.status(400).json({ success: false, error: `Không thể duyệt submission ở trạng thái "${submission.status}". Chỉ duyệt được khi status = "submitted".` });
      }

      submission.status = 'approved';
      submission.approvedBy = userId;
      submission.approvedAt = new Date();
      await submission.save();

      broadcastAssignmentUpdate({ type: 'assignment_updated', submissionId, action: 'approve' });

      return res.status(200).json({ success: true, data: submission });
    } catch (error: any) {
      console.error('[AssignmentController] approveSubmission error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * API: Supervisor từ chối (Reject) submission — revert về in_progress
   * POST /api/dataprep/assignments/manager/submission/:submissionId/reject
   * Body: { reason: string }
   */
  async rejectSubmission(req: Request, res: Response) {
    try {
      const { submissionId } = req.params;
      const { reason } = req.body;

      const submission = await DatasetAssignmentSubmission.findById(submissionId);
      if (!submission) {
        return res.status(404).json({ success: false, error: 'Submission not found' });
      }

      if (submission.status !== 'submitted') {
        return res.status(400).json({ success: false, error: `Không thể reject submission ở trạng thái "${submission.status}".` });
      }

      // Revert status → rejected (staff sẽ thấy task đỏ, sửa lại rồi submit lại)
      submission.status = 'rejected';
      submission.rejectReason = reason || '';
      submission.submittedAt = undefined;
      await submission.save();

      broadcastAssignmentUpdate({ type: 'assignment_updated', submissionId, action: 'reject' });

      return res.status(200).json({ success: true, data: submission });
    } catch (error: any) {
      console.error('[AssignmentController] rejectSubmission error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * API: Bật / Tắt AI Assist cho một nhân viên trong một version
   * PATCH /api/dataprep/versions/:versionId/assignments/toggle-ai
   * Body: { assigneeId: string, enabled: boolean }
   */
  async toggleAiAssist(req: Request, res: Response) {
    try {
      const { versionId } = req.params;
      const { assigneeId, enabled } = req.body;

      if (!assigneeId || typeof enabled !== 'boolean') {
        return res.status(400).json({ success: false, error: 'Thiếu assigneeId hoặc enabled' });
      }

      const result = await DatasetAssignmentSubmission.updateMany(
        { datasetVersionId: versionId, assigneeId },
        { $set: { aiAssistEnabled: enabled } }
      );

      return res.status(200).json({
        success: true,
        message: `Đã ${enabled ? 'bật' : 'tắt'} AI cho nhân viên`,
        modifiedCount: result.modifiedCount,
      });
    } catch (error: any) {
      console.error('[AssignmentController] toggleAiAssist error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}
// --- AUTO SCORE LOGIC ---
function calculateHumanScore(hardLabels: any[], totalSamples: number): number {
  if (totalSamples <= 0 || !hardLabels.length) return 0;

  const labeledSamples = new Set(hardLabels.map(l => String(l.sampleId)));
  const coverageRatio = labeledSamples.size / totalSamples;
  let score = coverageRatio * 8;
  const messageLabels = hardLabels.filter(l => l.targetScope === 'message');
  const sampleLabels = hardLabels.filter(l => l.targetScope === 'sample');
  const samplesWithMessageLabels = new Set(messageLabels.map(l => String(l.sampleId)));

  if (labeledSamples.size > 0) {
    score += (samplesWithMessageLabels.size / labeledSamples.size) * 2;
  }
  if (sampleLabels.length > 0 && messageLabels.length === 0) {
    score = Math.min(score, 7);
  }

  let conflicts = 0;

  labeledSamples.forEach(sampleId => {
    const sampleLabels = hardLabels.filter(l => String(l.sampleId) === sampleId && l.targetScope === 'message');
    const userIntents = sampleLabels.filter(l => l.messageRole === 'user').map(l => l.name);
    const assistantActions = sampleLabels.filter(l => l.messageRole === 'assistant').map(l => l.name);

    if (userIntents.includes('REQUEST_HINT') && assistantActions.includes('DIRECT_ANSWER')) {
      conflicts++;
    }
  });

  score -= conflicts * 1.5;

  return Number(Math.max(0, Math.min(10, score)).toFixed(1));
}

// --- RULE-BASED HUMAN SCORE (mirrors quality.service intent/action logic) ---
// Maps staff per-message intent (user) + action (assistant) labels to a 0-10 score
// using the same valid/harmful action rules as the Quality stage, so the Staff Rule
// Score is computed the moment a staff member submits.
const RULE_INTENTS = [
  'CORRECT', 'INCORRECT', 'REQUEST_HINT', 'ASK_THEORY', 'REQUEST_EXPLANATION',
  'REQUEST_SIMPLER', 'SKIP_EXERCISE', 'ENCOURAGE', 'OFF_TOPIC', 'NEXT_SECTION',
] as const;
const RULE_VALID_ACTIONS: Record<string, ReadonlySet<string>> = {
  CORRECT: new Set(['PRAISING']),
  INCORRECT: new Set(['SCAFFOLDING']),
  REQUEST_HINT: new Set(['HINTING', 'SCAFFOLDING']),
  ASK_THEORY: new Set(['CONCEPT_CLARIFY', 'LOGIC_BREAKDOWN']),
  REQUEST_EXPLANATION: new Set(['LOGIC_BREAKDOWN', 'CONCEPT_CLARIFY']),
  REQUEST_SIMPLER: new Set(['SIMPLIFYING']),
  SKIP_EXERCISE: new Set(['NAVIGATING']),
  ENCOURAGE: new Set(['MOTIVATING']),
  OFF_TOPIC: new Set(['REDIRECTING', 'TRANSITIONING']),
  NEXT_SECTION: new Set(['TRANSITIONING', 'NAVIGATING']),
};
const RULE_HARMFUL_ACTIONS: Record<string, ReadonlySet<string>> = {
  INCORRECT: new Set(['PRAISING']),
  REQUEST_HINT: new Set(['LOGIC_BREAKDOWN']),
};
const RULE_USER_INTENT_SET = new Set<string>(RULE_INTENTS);
const RULE_ASSISTANT_ACTION_SET = new Set<string>(
  Array.from(new Set(Object.values(RULE_VALID_ACTIONS).flatMap((actions) => Array.from(actions))))
);

function ruleToTenPointScore(raw: number): number {
  return Number(Math.max(0, Math.min(10, ((raw + 1) / 2) * 10)).toFixed(1));
}

/**
 * Computes the average rule-based human score (0-10) across all submitted samples.
 * Returns null when no sample has a scorable turn (so caller can fall back).
 */
function computeRuleBasedHumanScore(
  hardLabels: any[],
  messagesBySample: Map<string, Array<{ messageIndex: number; role: 'user' | 'assistant'; content: string }>>
): number | null {
  if (!hardLabels.length) return null;

  // Group message-level hard labels by sample -> "index:role" -> Set(label names)
  const labelMap = new Map<string, Set<string>>();
  for (const label of hardLabels) {
    if (label.targetScope !== 'message') continue;
    const role = label.messageRole === 'assistant' || label.messageRole === 'user' ? label.messageRole : null;
    if (!role) continue;
    const key = `${String(label.sampleId)}:${Number(label.messageIndex)}:${role}`;
    const set = labelMap.get(key) || new Set<string>();
    const name = String(label.name || '').trim().toUpperCase();
    if (name) set.add(name);
    labelMap.set(key, set);
  }

  const perSampleScores: number[] = [];

  messagesBySample.forEach((messages, sampleId) => {
    let totalTurnScore = 0;
    let scorableTurns = 0;

    for (let index = 0; index < messages.length; index += 1) {
      const userMessage = messages[index];
      if (userMessage.role !== 'user') continue;
      const assistantMessage = messages.slice(index + 1).find((m) => m.role === 'assistant');
      if (!assistantMessage) continue;

      const userLabels = Array.from(labelMap.get(`${sampleId}:${userMessage.messageIndex}:user`) || [])
        .filter((label) => RULE_USER_INTENT_SET.has(label));
      const assistantLabels = Array.from(labelMap.get(`${sampleId}:${assistantMessage.messageIndex}:assistant`) || [])
        .filter((label) => RULE_ASSISTANT_ACTION_SET.has(label));
      if (!userLabels.length || !assistantLabels.length) continue;

      const intentValues: number[] = [];
      for (const userLabel of userLabels) {
        const validActions = RULE_VALID_ACTIONS[userLabel];
        if (!validActions) continue;
        const matched = assistantLabels.some((action) => validActions.has(action));
        const harmfulCount = assistantLabels.filter((action) => RULE_HARMFUL_ACTIONS[userLabel]?.has(action)).length;
        const value = harmfulCount > 0 ? -1 : matched ? 1 : -0.5;
        intentValues.push(value);
      }
      if (!intentValues.length) continue;

      // Multiple labels are alternative descriptions of the same turn. A valid
      // intent/action pair should not be cancelled by an additional label.
      totalTurnScore += intentValues.includes(-1) ? -1 : Math.max(...intentValues);
      scorableTurns += 1;
    }

    if (scorableTurns > 0) {
      perSampleScores.push(ruleToTenPointScore(totalTurnScore / scorableTurns));
    }
  });

  if (!perSampleScores.length) return null;
  const avg = perSampleScores.reduce((sum, v) => sum + v, 0) / perSampleScores.length;
  return Number(Math.max(0, Math.min(10, avg)).toFixed(1));
}

// --- MAPPING UTILITIES & PROMOTION HELPER ---

const SUBJECT_MAP: Record<string, string> = {
  'Toán': 'MATH',
  'Vật lý': 'PHYSICAL',
  'Hóa học': 'CHEMISTRY',
  'Sinh học': 'BIOLOGY',
  'Ngữ văn': 'LITERATURE',
  'Lịch sử': 'LITERATURE',
  'Địa lý': 'LITERATURE',
  'Tiếng Anh': 'LITERATURE',
  'GDCD': 'LITERATURE',
  'Tin học': 'LITERATURE'
};

const INTENT_MAP: Record<string, string> = {
  'Ask Explanation': 'REQUEST_EXPLANATION',
  'Solve Exercise': 'INCORRECT',
  'Request Formula': 'ASK_THEORY',
  'Confirm Understanding': 'NEXT_SECTION',
  'Ask Example': 'REQUEST_SIMPLER',
  'Hint': 'REQUEST_HINT',
  'Ques': 'REQUEST_EXPLANATION',
  'Ques/Hint': 'REQUEST_HINT',
  'Other': 'WAIT_READY'
};

const ACTION_MAP: Record<string, string> = {
  'Guide Step-by-step': 'LOGIC_BREAKDOWN',
  'Give Hint': 'HINTING',
  'Ask Probing Question': 'SCAFFOLDING',
  'Provide Formula': 'CONCEPT_CLARIFY',
  'Encourage': 'MOTIVATING',
  'Correct Error': 'SCAFFOLDING',
  'Summarize': 'TRANSITIONING',
  'Hint': 'HINTING',
  'Ques': 'SCAFFOLDING',
  'Ques/Hint': 'SCAFFOLDING',
  'Other': 'WAITING'
};

function mapToStandardIntent(rawIntent: string): string {
  const trimmed = rawIntent.trim();
  if (INTENT_MAP[trimmed]) return INTENT_MAP[trimmed];
  const upper = trimmed.toUpperCase();
  if ((USER_MESSAGE_LABELS as readonly string[]).includes(upper)) return upper;
  return 'WAIT_READY';
}

function mapToStandardAction(rawAction: string): string {
  const trimmed = rawAction.trim();
  if (ACTION_MAP[trimmed]) return ACTION_MAP[trimmed];
  const upper = trimmed.toUpperCase();
  if ((ASSISTANT_MESSAGE_LABELS as readonly string[]).includes(upper)) return upper;
  return 'WAITING';
}

function mapToStandardSubject(rawSubject: string): string {
  const trimmed = rawSubject.trim();
  if (SUBJECT_MAP[trimmed]) return SUBJECT_MAP[trimmed];
  const upper = trimmed.toUpperCase();
  if (['MATH', 'PHYSICAL', 'CHEMISTRY', 'BIOLOGY', 'LITERATURE'].includes(upper)) return upper;
  return 'LITERATURE';
}

function serializeMessages(data: Record<string, any>): Array<{ messageIndex: number; role: 'user' | 'assistant'; content: string }> {
  if (Array.isArray(data?.messages)) {
    return data.messages
      .map((message: any, index: number) => ({
        messageIndex: index,
        role: message.role,
        content: String(message?.content || ''),
      }))
      .filter((message: any) =>
        (message.role === 'user' || message.role === 'assistant') && message.content.trim().length > 0
      );
  }

  const instruction = String(data?.instruction || data?.userText || '').trim();
  const output = String(data?.output || data?.assistantText || '').trim();
  const messages: Array<{ messageIndex: number; role: 'user' | 'assistant'; content: string }> = [];
  if (instruction) {
    messages.push({ messageIndex: 0, role: 'user', content: instruction });
  }
  if (output) {
    messages.push({ messageIndex: 1, role: 'assistant', content: output });
  }
  return messages;
}

type PromotionResult = {
  hardLabels: any[];
  messagesBySample: Map<string, Array<{ messageIndex: number; role: 'user' | 'assistant'; content: string }>>;
};

async function promoteSubmissionLabels(submission: any): Promise<PromotionResult> {
  const messagesBySample = new Map<string, Array<{ messageIndex: number; role: 'user' | 'assistant'; content: string }>>();
  try {
    const sampleAssigns = await DatasetSampleAssignment.find({
      datasetVersionId: submission.datasetVersionId,
      assigneeId: submission.assigneeId,
      sampleIndex: { $gte: submission.batchStart, $lt: submission.batchStart + submission.batchCount }
    }).lean();

    const sampleIds = sampleAssigns.map(sa => sa.sampleId);
    if (!sampleIds.length) {
      return { hardLabels: [], messagesBySample };
    }

    const softLabels = await LabelAssignment.find({
      sampleId: { $in: sampleIds },
      createdBy: submission.assigneeId,
      type: 'soft'
    }).lean();

    if (!softLabels.length) {
      return { hardLabels: [], messagesBySample };
    }

    const processedItems = await ProcessedDatasetItem.find({
      _id: { $in: sampleIds }
    }).lean();

    const hardLabelsToInsert: any[] = [];

    for (const softLabel of softLabels) {
      if (!softLabel.targetTextSnapshot) continue;

      let labelObj: any;
      try {
        labelObj = JSON.parse(softLabel.targetTextSnapshot);
      } catch (e) {
        console.error('[Promotion] Failed to parse soft label JSON:', e);
        continue;
      }

      const sampleIdStr = String(softLabel.sampleId);
      const item = processedItems.find(p => String(p._id) === sampleIdStr);
      const serializedMsgs = item ? serializeMessages(item.data || {}) : [];
      if (serializedMsgs.length) {
        messagesBySample.set(sampleIdStr, serializedMsgs);
      }

      // 1. Promote subject as a hard sample-level label
      if (labelObj.subject) {
        const mappedSubject = mapToStandardSubject(labelObj.subject);
        hardLabelsToInsert.push({
          sampleId: softLabel.sampleId,
          name: mappedSubject,
          type: 'hard',
          targetScope: 'sample',
          createdBy: submission.assigneeId
        });
      }

      // 2. Promote message-level intents and actions
      if (labelObj.messages && typeof labelObj.messages === 'object') {
        for (const msgIdxStr of Object.keys(labelObj.messages)) {
          const msgIdx = parseInt(msgIdxStr);
          if (isNaN(msgIdx)) continue;

          const msgLabel = labelObj.messages[msgIdxStr];
          const matchingMsg = serializedMsgs.find(m => m.messageIndex === msgIdx);
          const contentSnapshot = matchingMsg ? matchingMsg.content.slice(0, 2000) : '';

          if (matchingMsg?.role === 'user' && msgLabel.intent) {
            const mappedIntent = mapToStandardIntent(msgLabel.intent);
            hardLabelsToInsert.push({
              sampleId: softLabel.sampleId,
              name: mappedIntent,
              type: 'hard',
              targetScope: 'message',
              messageIndex: msgIdx,
              messageRole: 'user',
              targetTextSnapshot: contentSnapshot,
              createdBy: submission.assigneeId
            });
          }

          if (matchingMsg?.role === 'assistant' && msgLabel.action) {
            const mappedAction = mapToStandardAction(msgLabel.action);
            hardLabelsToInsert.push({
              sampleId: softLabel.sampleId,
              name: mappedAction,
              type: 'hard',
              targetScope: 'message',
              messageIndex: msgIdx,
              messageRole: 'assistant',
              targetTextSnapshot: contentSnapshot,
              createdBy: submission.assigneeId
            });
          }
        }
      }
    }

    return { hardLabels: hardLabelsToInsert, messagesBySample };
  } catch (e) {
    console.error('[promoteSubmissionLabels]', e);
    return { hardLabels: [], messagesBySample };
  }
}
