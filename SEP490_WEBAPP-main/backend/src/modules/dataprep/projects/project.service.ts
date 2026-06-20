import mongoose from 'mongoose';
import { Project } from '../../../models/Project';
import { DatasetVersion } from '../../../models/DatasetVersion';
import { DatasetAssignmentSubmission } from '../../../models/DatasetAssignmentSubmission';
import { DatasetSampleAssignment } from '../../../models/DatasetSampleAssignment';
import { ProcessedDatasetItem } from '../../../models/ProcessedDatasetItem';
import { LabelAssignment } from '../../../models/LabelAssignment';

export class ProjectHasTasksError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectHasTasksError';
  }
}

export class ProjectService {
  async createProject(ownerId: string, name: string, sourceType: 'chat' | 'lesson' = 'chat') {
    const trimmedName = String(name || '').trim();
    if (!trimmedName) {
      throw new Error('Tên Project là bắt buộc');
    }

    const ownerObjectId = new mongoose.Types.ObjectId(ownerId);

    // Tránh trùng tên trong cùng owner (chưa archived)
    const existing = await Project.findOne({
      ownerId: ownerObjectId,
      name: trimmedName,
      isArchived: { $ne: true },
    }).lean();
    if (existing) {
      throw new Error('Đã tồn tại Project với tên này');
    }

    const project = await Project.create({
      ownerId: ownerObjectId,
      name: trimmedName,
      sourceType: sourceType === 'lesson' ? 'lesson' : 'chat',
    });

    return project.toObject();
  }

  /** Số task (submission + sample assignment) đang thuộc project */
  async countTasks(projectId: string): Promise<number> {
    const [subs, samples] = await Promise.all([
      DatasetAssignmentSubmission.countDocuments({ projectId }),
      DatasetSampleAssignment.countDocuments({ projectId }),
    ]);
    return subs + samples;
  }

  /**
   * Xóa project — CHỈ khi không còn task nào.
   * Cascade: xóa labels, sample items, dataset versions thuộc project rồi xóa project.
   */
  async deleteProject(projectId: string, ownerId: string) {
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      throw new Error('Invalid project id');
    }

    const project = await Project.findOne({
      _id: new mongoose.Types.ObjectId(projectId),
      ownerId: new mongoose.Types.ObjectId(ownerId),
    }).lean();
    if (!project) {
      return null;
    }

    const taskCount = await this.countTasks(projectId);
    if (taskCount > 0) {
      throw new ProjectHasTasksError(
        `Không thể xóa Project khi vẫn còn ${taskCount} task. Hãy xóa hết task trước.`
      );
    }

    // Cascade xóa dữ liệu thuộc project (an toàn vì đã chắc chắn không còn task)
    const versions = await DatasetVersion.find({ projectId }).select('_id').lean();
    const versionIds = versions.map((v) => v._id);

    let deletedLabels = 0;
    let deletedItems = 0;
    if (versionIds.length > 0) {
      const items = await ProcessedDatasetItem.find({ datasetVersionId: { $in: versionIds } })
        .select('_id')
        .lean();
      const itemIds = items.map((i) => i._id);
      if (itemIds.length > 0) {
        const labelRes = await LabelAssignment.deleteMany({ sampleId: { $in: itemIds } });
        deletedLabels = labelRes.deletedCount || 0;
      }
      const itemRes = await ProcessedDatasetItem.deleteMany({ datasetVersionId: { $in: versionIds } });
      deletedItems = itemRes.deletedCount || 0;
    }

    const versionRes = await DatasetVersion.deleteMany({ projectId });
    await Project.deleteOne({ _id: new mongoose.Types.ObjectId(projectId) });

    return {
      deletedProject: 1,
      deletedVersions: versionRes.deletedCount || 0,
      deletedItems,
      deletedLabels,
    };
  }

  async listProjects(ownerId: string) {
    const projects = await Project.find({
      ownerId: new mongoose.Types.ObjectId(ownerId),
      isArchived: { $ne: true },
    })
      .sort({ updatedAt: -1 })
      .lean();

    return projects;
  }

  async getProjectById(projectId: string, ownerId: string) {
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return null;
    }

    return Project.findOne({
      _id: new mongoose.Types.ObjectId(projectId),
      ownerId: new mongoose.Types.ObjectId(ownerId),
      isArchived: { $ne: true },
    }).lean();
  }

  async listVersions(projectId: string, ownerId: string) {
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return [];
    }

    return DatasetVersion.find({
      projectId: new mongoose.Types.ObjectId(projectId),
      ownerId: new mongoose.Types.ObjectId(ownerId),
    })
      .sort({ versionNo: -1, createdAt: -1 })
      .lean();
  }
}

