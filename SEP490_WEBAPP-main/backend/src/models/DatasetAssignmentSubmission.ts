import mongoose, { Schema, Document, Types } from 'mongoose';

export type AssignmentSubmissionStatus = 'pending' | 'in_progress' | 'draft' | 'submitted' | 'approved' | 'completed' | 'rejected';

export interface IDatasetAssignmentSubmission extends Document {
  projectId: Types.ObjectId | string;
  datasetVersionId: Types.ObjectId | string;
  assigneeId: Types.ObjectId | string;
  status: AssignmentSubmissionStatus;
  
  // New Metadata fields for frontend sync
  name: string;
  batchStart: number;
  batchCount: number;
  taskType: string;
  priority: string;
  /** @deprecated Kept for older clients; mirrors staffDeadline. */
  deadline?: Date;
  staffDeadline?: Date;
  checkerDeadline?: Date;
  staffReminderSentAt?: Date;
  staffOverdueNotifiedAt?: Date;
  checkerReminderSentAt?: Date;
  checkerOverdueNotifiedAt?: Date;
  supervisor?: string;
  checker?: string;
  dataset?: string;
  version?: string;
  totalSamples: number;
  labeledCount: number;
  submittedCount: number;
  approvedCount: number;

  // Quyền dùng AI key của hệ thống cho task này
  aiAssistEnabled: boolean;
  // active=false => bị rút/thay thế: giữ lịch sử để tính công nhưng KHÔNG được sửa tiếp
  active: boolean;
  revokedAt?: Date;
  revokedReason?: string;
  replacedByAssigneeId?: Types.ObjectId | string;

  progressSnapshot?: Record<string, unknown>;
  submittedAt?: Date;
  humanScore?: number;
  approvedAt?: Date;
  approvedBy?: Types.ObjectId;
  rejectReason?: string;
  createdAt: Date;
  updatedAt?: Date;
}

const DatasetAssignmentSubmissionSchema = new Schema<IDatasetAssignmentSubmission>(
  {
    projectId: {
      type: Schema.Types.Mixed, // allow string or ObjectId for mock
      required: true,
      index: true,
    },
    datasetVersionId: {
      type: Schema.Types.Mixed, // allow string or ObjectId for mock
      required: true,
      index: true,
    },
    assigneeId: {
      type: Schema.Types.Mixed, // allow string "fake-staff-1"
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'draft', 'submitted', 'approved', 'completed', 'rejected'] as any,
      default: 'pending',
      index: true,
    },
    name: { type: String, required: true },
    batchStart: { type: Number, default: 1 },
    batchCount: { type: Number, default: 0 },
    taskType: { type: String, default: 'labeling' },
    priority: { type: String, default: 'medium' },
    deadline: { type: Date },
    staffDeadline: { type: Date, index: true },
    checkerDeadline: { type: Date, index: true },
    staffReminderSentAt: { type: Date },
    staffOverdueNotifiedAt: { type: Date },
    checkerReminderSentAt: { type: Date },
    checkerOverdueNotifiedAt: { type: Date },
    supervisor: { type: String },
    checker: { type: String },
    dataset: { type: String },
    version: { type: String },
    totalSamples: { type: Number, default: 0 },
    labeledCount: { type: Number, default: 0 },
    submittedCount: { type: Number, default: 0 },
    approvedCount: { type: Number, default: 0 },

    aiAssistEnabled: { type: Boolean, default: false },
    active: { type: Boolean, default: true, index: true },
    revokedAt: { type: Date },
    revokedReason: { type: String },
    replacedByAssigneeId: { type: Schema.Types.Mixed },

    progressSnapshot: { type: Schema.Types.Mixed },
    submittedAt: { type: Date },
    humanScore: { type: Number },
    approvedAt: { type: Date },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    rejectReason: { type: String, default: '' },
  },
  {
    timestamps: true,
  }
);

// DatasetAssignmentSubmissionSchema.index({ datasetVersionId: 1, assigneeId: 1 }, { unique: true });
DatasetAssignmentSubmissionSchema.index({ projectId: 1, assigneeId: 1, status: 1 });

export const DatasetAssignmentSubmission = mongoose.model<IDatasetAssignmentSubmission>(
  'DatasetAssignmentSubmission',
  DatasetAssignmentSubmissionSchema
);
