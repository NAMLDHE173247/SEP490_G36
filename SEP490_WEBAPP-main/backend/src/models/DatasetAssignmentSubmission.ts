import mongoose, { Schema, Document, Types } from 'mongoose';

export type AssignmentSubmissionStatus = 'draft' | 'submitted' | 'approved';

export interface IDatasetAssignmentSubmission extends Document {
  datasetVersionId: Types.ObjectId | string;
  assigneeId: Types.ObjectId | string;
  status: AssignmentSubmissionStatus;
  
  // New Metadata fields for frontend sync
  name: string;
  batchStart: number;
  batchCount: number;
  taskType: string;
  priority: string;
  deadline?: Date;
  supervisor?: string;
  dataset?: string;
  version?: string;
  totalSamples: number;
  labeledCount: number;

  progressSnapshot?: Record<string, unknown>;
  submittedAt?: Date;
  approvedAt?: Date;
  approvedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt?: Date;
}

const DatasetAssignmentSubmissionSchema = new Schema<IDatasetAssignmentSubmission>(
  {
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
      enum: ['pending', 'in_progress', 'draft', 'submitted', 'approved'] as any,
      default: 'pending',
      index: true,
    },
    name: { type: String, required: true },
    batchStart: { type: Number, default: 1 },
    batchCount: { type: Number, default: 0 },
    taskType: { type: String, default: 'labeling' },
    priority: { type: String, default: 'medium' },
    deadline: { type: Date },
    supervisor: { type: String },
    dataset: { type: String },
    version: { type: String },
    totalSamples: { type: Number, default: 0 },
    labeledCount: { type: Number, default: 0 },

    progressSnapshot: { type: Schema.Types.Mixed },
    submittedAt: { type: Date },
    approvedAt: { type: Date },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
  }
);

// DatasetAssignmentSubmissionSchema.index({ datasetVersionId: 1, assigneeId: 1 }, { unique: true });

export const DatasetAssignmentSubmission = mongoose.model<IDatasetAssignmentSubmission>(
  'DatasetAssignmentSubmission',
  DatasetAssignmentSubmissionSchema
);
