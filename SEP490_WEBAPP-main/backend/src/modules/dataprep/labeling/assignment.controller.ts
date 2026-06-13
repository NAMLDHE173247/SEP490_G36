import { Request, Response } from 'express';
import { DatasetAssignmentSubmission } from '../../../models/DatasetAssignmentSubmission';
import { DatasetSampleAssignment } from '../../../models/DatasetSampleAssignment';
import { LabelAssignment } from '../../../models/LabelAssignment';
import { ProcessedDatasetItem } from '../../../models/ProcessedDatasetItem';
import { DatasetVersion } from '../../../models/DatasetVersion';
import mongoose from 'mongoose';

export class AssignmentController {
  
  /**
   * API: Xóa toàn bộ dữ liệu Test của Assignment
   * POST /api/dataprep/assignments/reset
   */
  async resetData(req: Request, res: Response) {
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
   * API: Tạo hàng loạt Assignment cho một Batch
   * POST /api/dataprep/versions/:versionId/assignments/batch
   */
  async createBatchAssignment(req: Request, res: Response) {
    try {
      const { versionId } = req.params;
      const { assigneeIds, sampleStartIndex, sampleCount, taskType, priority, batchName } = req.body;
      const assignedBy = req.user?.id || req.user?._id || 'admin';

      if (!assigneeIds || !assigneeIds.length || !sampleCount) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
      }

      for (const assigneeId of assigneeIds) {
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
          dataset: 'Default Dataset', // Normally queried from versionId
          version: 'v1'
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
      const userId = req.query.userId || req.user?.id || req.user?._id || 'fake-staff-1';
      
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
  async getAllTasks(req: Request, res: Response) {
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
      const submissions = await DatasetAssignmentSubmission.find();
      const versionIds = [...new Set(submissions.map(s => String(s.datasetVersionId)))];
      const versions = await DatasetVersion.find({ _id: { $in: versionIds } });
      const versionMap = new Map(versions.map(v => [String(v._id), v]));

      const grouped: { [key: string]: any } = {};
      
      submissions.forEach(sub => {
        const vid = String(sub.datasetVersionId);
        const versionDoc = versionMap.get(vid);
        
        if (!grouped[vid]) {
          grouped[vid] = {
            id: vid,
            name: versionDoc ? versionDoc.versionName : `Dataset Version ${vid.substring(0,6)}...`,
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
        
        let batch = grouped[vid].batches.find((b: any) => b.name === sub.name);
        if (!batch) {
          batch = {
            id: `batch-${sub.batchStart}`,
            name: sub.name,
            totalSamples: sub.totalSamples,
            status: sub.status,
            assignees: []
          };
          grouped[vid].batches.push(batch);
          grouped[vid].totalSamples += sub.totalSamples;
          grouped[vid].labeledCount += (sub.status === 'submitted' ? sub.totalSamples : sub.labeledCount || 0);
        }
        
        batch.assignees.push({
          id: sub.assigneeId,
          name: sub.assigneeId === 'fake-staff-1' ? 'Nguyễn Văn A' : (sub.assigneeId === 'fake-staff-2' ? 'Trần Thị B' : String(sub.assigneeId)),
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
      const subs = await DatasetAssignmentSubmission.find({ datasetVersionId: taskId });
      if (subs.length === 0) {
        // Return empty structure instead of 404 so UI can render
        return res.status(200).json({ 
          success: true, 
          data: { id: taskId, batches: [], staffList: [], conflicts: [], samples: [] } 
        });
      }

      const batchesMap: { [key: string]: any } = {};
      const staffMap: { [key: string]: any } = {};
      let totalSamples = 0;

      subs.forEach(sub => {
        // Build Staff
        if (!staffMap[sub.assigneeId]) {
          staffMap[sub.assigneeId] = {
            id: sub.assigneeId,
            name: sub.assigneeId === '6a293e9365e356a409f3023f' ? 'System Staff' : (sub.assigneeId === 'fake-staff-2' ? 'Trần Thị B' : sub.assigneeId),
            progress: 0,
            total: 0,
            status: sub.status,
            submittedAt: sub.submittedAt || null,
            labelsPerHour: Math.floor(Math.random() * 5) + 5 // Mock productivity
          };
        }
        staffMap[sub.assigneeId].total += sub.totalSamples;
        staffMap[sub.assigneeId].progress += sub.status === 'submitted' ? sub.totalSamples : sub.labeledCount || 0;

        // Build Batch
        let batch = batchesMap[sub.name];
        if (!batch) {
          batch = {
            id: `batch-${sub.batchStart}`,
            name: sub.name,
            totalSamples: sub.totalSamples,
            status: sub.status,
            assignees: []
          };
          batchesMap[sub.name] = batch;
          totalSamples += sub.totalSamples;
        }
        batch.assignees.push(staffMap[sub.assigneeId].name);
      });

      const sampleAssigns = await DatasetSampleAssignment.find({ datasetVersionId: taskId }).sort({ sampleIndex: 1 });
      const samplesMap: { [key: number]: any } = {};
      const sampleIdMap: { [key: string]: number } = {};

      for (const sa of sampleAssigns) {
        if (!samplesMap[sa.sampleIndex]) {
          samplesMap[sa.sampleIndex] = {
            id: sa.sampleIndex,
            key: `sample_${String(sa.sampleIndex).padStart(3, '0')}`,
            preview: `Sample data preview content ${sa.sampleIndex}...`,
            assignees: [],
            staffStatus: {},
            staffLabels: {},
            conflict: false,
          };
          sampleIdMap[String(sa.sampleId)] = sa.sampleIndex;
        }
        const assigneeName = staffMap[String(sa.assigneeId)]?.name || String(sa.assigneeId);
        if (!samplesMap[sa.sampleIndex].assignees.includes(assigneeName)) {
           samplesMap[sa.sampleIndex].assignees.push(assigneeName);
        }
        samplesMap[sa.sampleIndex].staffStatus[String(sa.assigneeId)] = 'pending';
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

      const data = {
        id: taskId,
        name: `Dataset Version ${taskId}`,
        totalSamples,
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
      const { sampleId, label, isComplete } = req.body;

      const submission = await DatasetAssignmentSubmission.findById(submissionId);
      if (!submission) {
        return res.status(404).json({ success: false, error: 'Submission not found' });
      }

      if (submission.status === 'submitted') {
        return res.status(400).json({ success: false, error: 'Batch already submitted' });
      }

      // Find the specific assignment
      const sa = await DatasetSampleAssignment.findOne({
        datasetVersionId: submission.datasetVersionId,
        assigneeId: submission.assigneeId,
        sampleIndex: sampleId
      });

      if (!sa) {
        return res.status(404).json({ success: false, error: 'Sample assignment not found' });
      }

      // Upsert label
      const existingLabel = await LabelAssignment.findOne({
        createdBy: submission.assigneeId,
        sampleId: sa.sampleId
      });

      const wasLabeled = !!existingLabel;

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

      if (!wasLabeled && isComplete) {
        submission.labeledCount = (submission.labeledCount || 0) + 1;
      }

      if (submission.status === 'pending') {
        submission.status = 'in_progress';
      }

      await submission.save();

      return res.status(200).json({ success: true, data: submission });
    } catch (error: any) {
      console.error('[AssignmentController] Error saving sample label:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * API: Staff nộp bài (Submit Batch)
   * POST /api/dataprep/versions/:versionId/assignments/submit
   */
  async submitTask(req: Request, res: Response) {
    try {
      const { submissionId } = req.body;
      
      if (!submissionId) {
        return res.status(400).json({ success: false, error: 'Missing submissionId' });
      }

      const submission = await DatasetAssignmentSubmission.findById(submissionId);
      if (submission) {
        submission.status = 'submitted';
        submission.submittedAt = new Date();
        await submission.save();
        return res.status(200).json({ success: true, data: submission });
      } else {
        return res.status(404).json({ success: false, error: 'Submission not found' });
      }
    } catch (error: any) {
      console.error('[AssignmentController] Error submitting task:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}
