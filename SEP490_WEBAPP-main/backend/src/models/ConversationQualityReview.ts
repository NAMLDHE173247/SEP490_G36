import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IConversationQualityReview extends Document {
  datasetVersionId: Types.ObjectId;
  sampleId: Types.ObjectId;
  reviewerId: Types.ObjectId;
  qualityClassification: 'Gold' | 'Rewrite' | 'Bad' | 'Incomplete';
  ratings: {
    knowledgeAccuracy: number;
    socraticPedagogical: number;
    encouragement: number;
    vietnameseLanguage: number;
    completeness: number;
    trainingReadiness: number;
  };
  errorFlags: {
    factualError: boolean;
    directAnswerIssue: boolean;
    languageIssue: boolean;
    needSupervisorReview: boolean;
  };
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationQualityReviewSchema = new Schema<IConversationQualityReview>(
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
    reviewerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    qualityClassification: {
      type: String,
      enum: ['Gold', 'Rewrite', 'Bad', 'Incomplete'],
      required: true,
    },
    ratings: {
      knowledgeAccuracy: { type: Number, required: true, min: 1, max: 5 },
      socraticPedagogical: { type: Number, required: true, min: 1, max: 5 },
      encouragement: { type: Number, required: true, min: 1, max: 5 },
      vietnameseLanguage: { type: Number, required: true, min: 1, max: 5 },
      completeness: { type: Number, required: true, min: 1, max: 5 },
      trainingReadiness: { type: Number, required: true, min: 1, max: 5 },
    },
    errorFlags: {
      factualError: { type: Boolean, default: false },
      directAnswerIssue: { type: Boolean, default: false },
      languageIssue: { type: Boolean, default: false },
      needSupervisorReview: { type: Boolean, default: false },
    },
    note: { type: String, default: '' },
  },
  {
    timestamps: true,
  }
);

ConversationQualityReviewSchema.index({ datasetVersionId: 1, sampleId: 1, reviewerId: 1 }, { unique: true });

export const ConversationQualityReview = mongoose.model<IConversationQualityReview>(
  'ConversationQualityReview',
  ConversationQualityReviewSchema
);
