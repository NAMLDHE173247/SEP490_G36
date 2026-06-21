import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IDatasetSampleAssignment extends Document {
  datasetVersionId: Types.ObjectId | string;
  sampleId: Types.ObjectId | string;
  assigneeId: Types.ObjectId | string;
  assignedBy: Types.ObjectId | string;
  sampleIndex: number;
  taskType?: 'labeling' | 'cross-check';
  priority?: 'low' | 'medium' | 'high';
  createdAt: Date;
  updatedAt?: Date;
}

const DatasetSampleAssignmentSchema = new Schema<IDatasetSampleAssignment>(
  {
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
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
  },
  {
    timestamps: true,
  }
);

DatasetSampleAssignmentSchema.index({ datasetVersionId: 1, assigneeId: 1, sampleIndex: 1 });
DatasetSampleAssignmentSchema.index({ datasetVersionId: 1, sampleIndex: 1 });

export const DatasetSampleAssignment = mongoose.model<IDatasetSampleAssignment>(
  'DatasetSampleAssignment',
  DatasetSampleAssignmentSchema
);
