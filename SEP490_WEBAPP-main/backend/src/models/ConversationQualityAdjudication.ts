import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IConversationQualityAdjudication extends Document {
  datasetVersionId: Types.ObjectId;
  sampleId: Types.ObjectId;
  finalClassification: 'Gold' | 'Rewrite' | 'Bad' | 'Incomplete';
  adjudicatedBy: Types.ObjectId;
  note?: string;
  hasConflict: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationQualityAdjudicationSchema = new Schema<IConversationQualityAdjudication>(
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
    finalClassification: {
      type: String,
      enum: ['Gold', 'Rewrite', 'Bad', 'Incomplete'],
      required: true,
    },
    adjudicatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    note: { type: String, default: '' },
    hasConflict: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

ConversationQualityAdjudicationSchema.index({ datasetVersionId: 1, sampleId: 1 }, { unique: true });

export const ConversationQualityAdjudication = mongoose.model<IConversationQualityAdjudication>(
  'ConversationQualityAdjudication',
  ConversationQualityAdjudicationSchema
);
