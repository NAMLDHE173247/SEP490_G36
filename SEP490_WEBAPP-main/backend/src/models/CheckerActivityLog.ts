import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ICheckerActivityLog extends Document {
  datasetVersionId: Types.ObjectId;
  sampleId: Types.ObjectId;
  userId: Types.ObjectId;
  userName: string;
  userEmail: string;
  action: 'view' | 'save_draft' | 'publish';
  targetScope?: 'sample' | 'message' | null;
  messageIndex?: number | null;
  messageRole?: 'user' | 'assistant' | null;
  details?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CheckerActivityLogSchema = new Schema<ICheckerActivityLog>(
  {
    datasetVersionId: {
      type: Schema.Types.ObjectId,
      ref: 'DatasetVersion',
      required: true,
      index: true,
    },
    sampleId: {
      type: Schema.Types.ObjectId,
      ref: 'ProcessedDatasetItem',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    userName: { type: String, required: true },
    userEmail: { type: String, required: true },
    action: {
      type: String,
      enum: ['view', 'save_draft', 'publish'] as const,
      required: true,
      index: true,
    },
    targetScope: {
      type: String,
      enum: ['sample', 'message'] as const,
      default: null,
    },
    messageIndex: { type: Number, default: null },
    messageRole: {
      type: String,
      enum: ['user', 'assistant'] as const,
      default: null,
    },
    details: { type: String, default: '' },
  },
  {
    timestamps: true,
  }
);

CheckerActivityLogSchema.index({ datasetVersionId: 1, createdAt: -1 });

export const CheckerActivityLog = mongoose.model<ICheckerActivityLog>(
  'CheckerActivityLog',
  CheckerActivityLogSchema
);
