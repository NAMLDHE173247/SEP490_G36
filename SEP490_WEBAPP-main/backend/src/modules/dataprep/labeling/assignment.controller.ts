import { Request, Response } from 'express';
import { DatasetAssignmentSubmission } from '../../../models/DatasetAssignmentSubmission';
import { DatasetSampleAssignment } from '../../../models/DatasetSampleAssignment';
import { LabelAssignment } from '../../../models/LabelAssignment';
import { ProcessedDatasetItem } from '../../../models/ProcessedDatasetItem';
import { DatasetVersion } from '../../../models/DatasetVersion';
import { DatasetAssignmentActivity } from '../../../models/DatasetAssignmentActivity';
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
   * API: Tự động chia đều hội thoại cho danh sách nhân viên (Array Chunking)
   * POST /api/dataprep/versions/:versionId/assignments/auto-assign
   * Body: { assigneeIds: string[], taskName: string, priority?: string, deadline?: string }
   */
  async createAutoAssignment(req: Request, res: Response) {
    try {
      const { versionId } = req.params;
      const { assigneeIds, taskName, priority, deadline } = req.body;
      const assignedBy = (req as any).user?.id || (req as any).user?._id || 'admin';

      if (!assigneeIds || !assigneeIds.length) {
        return res.status(400).json({ success: false, error: 'Cần chọn ít nhất 1 nhân viên' });
      }

      // 1. Lấy version metadata
      const version = await DatasetVersion.findById(versionId).lean();
      if (!version) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy DatasetVersion' });
      }
      const datasetName = version.projectName || version.versionName || 'Dataset';

      // 2. Lấy TOÀN BỘ danh sách sample IDs (Array Chunking cần ID cụ thể)
      const allSamples = await ProcessedDatasetItem.find({ datasetVersionId: versionId })
        .select('_id')
        .sort({ _id: 1 })
        .lean();

      const N = allSamples.length;
      if (N === 0) {
        return res.status(400).json({ success: false, error: 'Version này chưa có dữ liệu (0 samples)' });
      }

      const M = assigneeIds.length;
      const perStaff = Math.floor(N / M);
      const remainder = N % M;

      // 3. Array Chunking: chia mảng ID thành các cụm
      const chunks: Array<{ assigneeId: string; sampleIds: any[]; startIndex: number }> = [];
      let cursor = 0;
      for (let i = 0; i < M; i++) {
        const chunkSize = perStaff + (i < remainder ? 1 : 0);
        chunks.push({
          assigneeId: assigneeIds[i],
          sampleIds: allSamples.slice(cursor, cursor + chunkSize),
          startIndex: cursor + 1, // 1-indexed for display
        });
        cursor += chunkSize;
      }

      // 4. Ghi DB trực tiếp (không dùng transaction — standalone MongoDB)
      const allActivityDocs: any[] = [];

      for (const chunk of chunks) {
        // 4a. Tạo DatasetAssignmentSubmission
        const submission = new DatasetAssignmentSubmission({
          datasetVersionId: versionId,
          assigneeId: chunk.assigneeId,
          status: 'pending',
          name: `${taskName} - Batch ${chunk.startIndex}`,
          batchStart: chunk.startIndex,
          batchCount: chunk.sampleIds.length,
          taskType: 'labeling',
          priority: priority || 'medium',
          deadline: deadline ? new Date(deadline) : undefined,
          supervisor: assignedBy,
          labeledCount: 0,
          totalSamples: chunk.sampleIds.length,
          dataset: datasetName,
          version: version.versionName || 'v1',
          progressSnapshot: { totalAssigned: chunk.sampleIds.length },
        });
        await submission.save();

        // 4b. Tạo DatasetSampleAssignment (ánh xạ sampleId cụ thể)
        const sampleDocs = chunk.sampleIds.map((item, i) => ({
          datasetVersionId: versionId,
          sampleId: item._id,
          assigneeId: chunk.assigneeId,
          assignedBy,
          sampleIndex: chunk.startIndex + i,
          taskType: 'labeling',
          priority: priority || 'medium',
        }));
        await DatasetSampleAssignment.insertMany(sampleDocs);

        // 4c. Ghi Audit log (DatasetAssignmentActivity)
        for (const item of chunk.sampleIds) {
          allActivityDocs.push({
            datasetVersionId: versionId,
            sampleId: item._id,
            annotatorId: chunk.assigneeId,
            labelName: 'assignment',
            labelType: 'hard',
            targetScope: 'sample',
            activityType: 'assign',
          });
        }
      }

      // 4d. Bulk insert audit logs
      if (allActivityDocs.length > 0) {
        await DatasetAssignmentActivity.insertMany(allActivityDocs);
      }

      // 5. Broadcast SSE update
      broadcastAssignmentUpdate({ type: 'assignment_created', versionId, action: 'auto_assign' });

      return res.status(201).json({
        success: true,
        message: `Đã giao ${N} samples cho ${M} nhân viên`,
        distribution: chunks.map(c => ({
          assigneeId: c.assigneeId,
          sampleCount: c.sampleIds.length,
          range: `${c.startIndex}–${c.startIndex + c.sampleIds.length - 1}`,
        })),
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
      const { assigneeIds, sampleStartIndex, sampleCount, taskType, priority, batchName } = req.body;
      const assignedBy = (req as any).user?.id || (req as any).user?._id || 'admin';

      if (!assigneeIds || !assigneeIds.length || !sampleCount) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
      }

      for (const assigneeId of assigneeIds) {
        const version = await DatasetVersion.findById(versionId).lean();
        const datasetName = version ? version.projectName || version.versionName || 'Dataset' : 'Dataset';

        // Create the submission (batch block)
        const submission = new DatasetAssignmentSubmission({
          datasetVersionId: versionId,
          assigneeId: assigneeId,
          status: 'pending',
          progressSnapshot: { totalAssigned: sampleCount },
          name: batchName || `Batch ${sampleStartIndex}`,
          batchStart: sampleStartIndex,
          batchCount: sampleCount,
          priority: priority || 'medium',
          taskType: taskType || 'labeling',
          labeledCount: 0,
          totalSamples: sampleCount,
          dataset: datasetName,
          version: version?.versionName || 'v1'
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
  async getManagerOverview(_req: Request, res: Response) {
    try {
      const submissions = await DatasetAssignmentSubmission.find();
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
          grouped[groupId] = {
            id: groupId,
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
          name: finalName,
          progress: sub.status === 'submitted' ? 100 : (sub.labeledCount / (sub.totalSamples || 1)) * 100 || 0,
          status: sub.status
        });
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
          };
        } else {
          staffMap[assigneeIdStr].submissionIds.push(String(sub._id));
          // Ưu tiên status submitted > in_progress > pending
          const statusPriority: any = { submitted: 3, in_progress: 2, pending: 1, approved: 4, rejected: 0 };
          if ((statusPriority[sub.status] || 0) > (statusPriority[staffMap[assigneeIdStr].status] || 0)) {
            staffMap[assigneeIdStr].status = sub.status;
            staffMap[assigneeIdStr].submissionId = String(sub._id);
          }
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
            assignees: []
          };
          batchesMap[sub.name] = batch;
          totalSamples += sub.totalSamples;
          totalLabeled += subLabeled;
        }
        batch.assignees.push(staffMap[assigneeIdStr].name);
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
      const labels = await LabelAssignment.find({ sampleId: { $in: sampleIdArray } });

      const conflictMap: { [key: number]: any } = {};

      for (const label of labels) {
        const sIndex = sampleIdMap[String(label.sampleId)];
        if (sIndex && samplesMap[sIndex]) {
          samplesMap[sIndex].staffStatus[String(label.createdBy)] = 'done';
          samplesMap[sIndex].staffLabels[String(label.createdBy)] = label.name;
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
              status: 'pending',
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
          _dbId: sa._id // keep db id
        };
      });

      // Fetch saved labels for this assignee
      const labels = await LabelAssignment.find({
        createdBy: submission.assigneeId,
        sampleId: { $in: sampleAssigns.map(sa => sa.sampleId) }
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

      // Find the specific assignment (sampleId from FE is the sampleIndex, may come as string)
      const sa = await DatasetSampleAssignment.findOne({
        datasetVersionId: submission.datasetVersionId,
        assigneeId: submission.assigneeId,
        sampleIndex: Number(sampleId)
      });

      if (!sa) {
        return res.status(404).json({ success: false, error: 'Sample assignment not found' });
      }

      // Upsert label
      const existingLabel = await LabelAssignment.findOne({
        createdBy: submission.assigneeId,
        sampleId: sa.sampleId
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

        const upsertOps = sampleAssigns.map(async (sa: any) => {
          const labelData = labelsPayload[sa.sampleIndex] ?? labelsPayload[String(sa.sampleIndex)];
          if (!labelData || (typeof labelData === 'object' && Object.keys(labelData).length === 0)) return;
          await LabelAssignment.findOneAndUpdate(
            { createdBy: submission.assigneeId, sampleId: sa.sampleId },
            {
              $set: {
                name: 'Label',
                type: 'soft',
                targetScope: 'sample',
                targetTextSnapshot: JSON.stringify(labelData),
              }
            },
            { upsert: true }
          );
        });
        await Promise.all(upsertOps);
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
        const submitMessage = `Staff submitted ${submission.name || 'labeling task'}.`;
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
      const labelQuery: any = { sampleId };
      if (staffId) labelQuery.createdBy = staffId;
      const labels = await LabelAssignment.find(labelQuery).lean();

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
          sampleLabels.push({ name: label.name, type: label.type });
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
const RULE_HARMFUL_ACTION_PENALTY = -2;
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
        const value = (matched ? 1 : -1) + (harmfulCount * RULE_HARMFUL_ACTION_PENALTY);
        intentValues.push(value);
      }
      if (!intentValues.length) continue;

      totalTurnScore += intentValues.reduce((sum, v) => sum + v, 0) / intentValues.length;
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
      .filter((message: any) => message?.role === 'user' || message?.role === 'assistant')
      .map((message: any, index: number) => ({
        messageIndex: index,
        role: message.role,
        content: String(message?.content || ''),
      }));
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
          } else if (matchingMsg?.role === 'assistant' && msgLabel.action) {
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

    // Delete old hard labels first
    await LabelAssignment.deleteMany({
      sampleId: { $in: sampleIds },
      createdBy: submission.assigneeId,
      type: 'hard'
    });

    // Bulk insert new hard labels
    if (hardLabelsToInsert.length > 0) {
      try {
        await LabelAssignment.insertMany(hardLabelsToInsert, { ordered: false });
      } catch (error: any) {
        if (error?.code !== 11000) {
          console.error('[Promotion] Error inserting hard labels:', error);
        }
      }
    }
    return { hardLabels: hardLabelsToInsert, messagesBySample };
  } catch (error) {
    console.error('[Promotion] Error promoting soft labels to hard:', error);
    return { hardLabels: [], messagesBySample };
  }
}
