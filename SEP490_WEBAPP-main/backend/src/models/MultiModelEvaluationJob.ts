import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IMultiModelEvaluationJob extends Document {
  datasetVersionId: Types.ObjectId;
  models: ('gemini' | 'openai' | 'deepseek' | 'openrouter' | 'groq')[];
  contextWindow: 'No Context' | 'n - 1' | 'n - 2 to n' | 'n - 1 to n + 1' | 'n - 2 to n + 2';
  status: 'running' | 'completed' | 'failed';
  progress: {
    total: number;
    evaluated: number;
    processing: number;
    failed: number;
    conflictCount: number;
    refinedCount: number;
  };
  startedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MultiModelEvaluationJobSchema = new Schema<IMultiModelEvaluationJob>(
  {
    datasetVersionId: {
      type: Schema.Types.ObjectId,
      ref: 'DatasetVersion',
      required: true,
      index: true,
    },
    models: [
      {
        type: String,
        enum: ['gemini', 'openai', 'deepseek', 'openrouter', 'groq'],
      },
    ],
    contextWindow: {
      type: String,
      enum: ['No Context', 'n - 1', 'n - 2 to n', 'n - 1 to n + 1', 'n - 2 to n + 2'],
      required: true,
    },
    status: {
      type: String,
      enum: ['running', 'completed', 'failed'],
      default: 'running',
      index: true,
    },
    progress: {
      total: { type: Number, default: 0 },
      evaluated: { type: Number, default: 0 },
      processing: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      conflictCount: { type: Number, default: 0 },
      refinedCount: { type: Number, default: 0 },
    },
    startedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const MultiModelEvaluationJob = mongoose.model<IMultiModelEvaluationJob>(
  'MultiModelEvaluationJob',
  MultiModelEvaluationJobSchema
);
