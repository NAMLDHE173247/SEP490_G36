import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ILlmScorecard {
  socratic?: number | null;
  encouragement?: number | null;
  factuality?: number | null;
  languageQuality?: number | null;
  consistency?: number | null;
  completeness?: number | null;
  readiness?: number | null;
  overall: number;
  reason: string;
  recommendation: 'Pass' | 'Need Rewrite' | 'Reject';
}

export interface IMultiModelEvaluationResult extends Document {
  jobId: Types.ObjectId;
  datasetVersionId: Types.ObjectId;
  sampleId: Types.ObjectId;
  modelScores: Map<string, ILlmScorecard>;
  averageOverall: number;
  finalRecommendation: 'Pass' | 'Need Rewrite' | 'Reject';
  hasConflict: boolean;
  targetIdx?: number;
  contextSize?: number;
  supervisorAction?: 'approve' | 'rewrite' | 'reevaluate' | 'reject';
  supervisorNote?: string;
  adjudicatedBy?: Types.ObjectId;
  adjudicatedAt?: Date;
  bestModelSelected?: string;
  bestModelScorecard?: ILlmScorecard;
  autoRefined: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const LlmScorecardSchema = new Schema<ILlmScorecard>(
  {
    socratic: { type: Number, min: 0, max: 10, default: null },
    encouragement: { type: Number, min: 0, max: 10, default: null },
    factuality: { type: Number, min: 0, max: 10, default: null },
    languageQuality: { type: Number, min: 0, max: 10, default: null },
    consistency: { type: Number, min: 0, max: 10, default: null },
    completeness: { type: Number, min: 0, max: 10, default: null },
    readiness: { type: Number, min: 0, max: 10, default: null },
    overall: { type: Number, required: true },
    reason: { type: String, default: '' },
    recommendation: { type: String, enum: ['Pass', 'Need Rewrite', 'Reject'], required: true },
  },
  { _id: false }
);

const MultiModelEvaluationResultSchema = new Schema<IMultiModelEvaluationResult>(
  {
    jobId: {
      type: Schema.Types.ObjectId,
      ref: 'MultiModelEvaluationJob',
      required: true,
      index: true,
    },
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
    modelScores: {
      type: Map,
      of: LlmScorecardSchema,
      required: true,
    },
    averageOverall: {
      type: Number,
      required: true,
      index: true,
    },
    finalRecommendation: {
      type: String,
      enum: ['Pass', 'Need Rewrite', 'Reject'],
      required: true,
      index: true,
    },
    hasConflict: {
      type: Boolean,
      default: false,
    },
    targetIdx: {
      type: Number,
    },
    contextSize: {
      type: Number,
    },
    supervisorAction: {
      type: String,
      enum: ['approve', 'rewrite', 'reevaluate', 'reject'],
      default: null,
      index: true,
    },
    supervisorNote: { type: String, default: '' },
    adjudicatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    adjudicatedAt: {
      type: Date,
      default: null,
    },
    bestModelSelected: {
      type: String,
      default: '',
      index: true,
    },
    bestModelScorecard: {
      type: LlmScorecardSchema,
      default: null,
    },
    autoRefined: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

MultiModelEvaluationResultSchema.index({ datasetVersionId: 1, sampleId: 1 });

export const MultiModelEvaluationResult = mongoose.model<IMultiModelEvaluationResult>(
  'MultiModelEvaluationResult',
  MultiModelEvaluationResultSchema
);
