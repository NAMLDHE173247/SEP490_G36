import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IDatasetSampleAssignment extends Document {
  projectId: Types.ObjectId | string;
  datasetVersionId: Types.ObjectId | string;
  sampleId: Types.ObjectId | string;
  assigneeId: Types.ObjectId | string;
  assignedBy: Types.ObjectId | string;
  sampleIndex: number;
  taskType?: 'labeling' | 'cross-check';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  // active=false => người này đã bị rút khỏi mẫu (giữ để tính công, không sửa được)
  active: boolean;
  revokedAt?: Date;
  // Trạng thái review theo TỪNG CÂU (nộp lẻ)
  reviewStatus: 'labeling' | 'submitted' | 'approved' | 'rejected';
  submittedAt?: Date;
  reviewedAt?: Date;
  reviewedBy?: Types.ObjectId | string;
  rejectReason?: string;
  createdAt: Date;
  updatedAt?: Date;
}

const DatasetSampleAssignmentSchema = new Schema<IDatasetSampleAssignment>(
  {
    projectId: {
      type: Schema.Types.Mixed,
      required: true,
      index: true,
    },
    datasetVersionId: {
      type: Schema.Types.Mixed,
      required: true,
      index: true,
    },
    sampleId: {
      type: Schema.Types.Mixed,
      required: true,
      index: true,
    },
    assigneeId: {
      type: Schema.Types.Mixed,
      required: true,
      index: true,
    },
    assignedBy: {
      type: Schema.Types.Mixed,
      required: true,
    },
    sampleIndex: {
      type: Number,
      required: true,
      min: 1,
    },
    taskType: {
      type: String,
      enum: ['labeling', 'cross-check'],
      default: 'labeling',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    active: { type: Boolean, default: true, index: true },
    revokedAt: { type: Date },
    reviewStatus: {
      type: String,
      enum: ['labeling', 'submitted', 'approved', 'rejected'],
      default: 'labeling',
      index: true,
    },
    submittedAt: { type: Date },
    reviewedAt: { type: Date },
    reviewedBy: { type: Schema.Types.Mixed },
    rejectReason: { type: String },
  },
  {
    timestamps: true,
  }
);

DatasetSampleAssignmentSchema.index({ datasetVersionId: 1, assigneeId: 1, sampleIndex: 1 });
DatasetSampleAssignmentSchema.index({ datasetVersionId: 1, sampleIndex: 1 });
DatasetSampleAssignmentSchema.index({ projectId: 1, datasetVersionId: 1, assigneeId: 1 });
DatasetSampleAssignmentSchema.index({ datasetVersionId: 1, reviewStatus: 1 });
DatasetSampleAssignmentSchema.index({ projectId: 1, reviewStatus: 1 });

export const DatasetSampleAssignment = mongoose.model<IDatasetSampleAssignment>(
  'DatasetSampleAssignment',
  DatasetSampleAssignmentSchema
);
