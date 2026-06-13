import mongoose, { Document, Schema, Types } from 'mongoose';

export type LabelAssignmentType = 'hard' | 'soft';
export type LabelAssignmentScope = 'sample' | 'message';
export type LabelAssignmentMessageRole = 'user' | 'assistant';

export interface ILabelAssignment extends Document {
  sampleId: Types.ObjectId | string;
  name: string;
  type: LabelAssignmentType;
  targetScope: LabelAssignmentScope;
  messageIndex?: number | null;
  messageRole?: LabelAssignmentMessageRole | null;
  targetTextSnapshot?: string;
  createdBy: Types.ObjectId | string;
  legacyLabelId?: Types.ObjectId | string | null;
  createdAt: Date;
  updatedAt: Date;
}

const LabelAssignmentSchema = new Schema<ILabelAssignment>(
  {
    sampleId: {
      type: Schema.Types.Mixed,
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['hard', 'soft'] as const,
      required: true,
      index: true,
    },
    targetScope: {
      type: String,
      enum: ['sample', 'message'] as const,
      default: 'sample',
      index: true,
    },
    messageIndex: { type: Number, min: 0, default: null },
    messageRole: {
      type: String,
      enum: ['user', 'assistant'] as const,
      default: null,
    },
    targetTextSnapshot: { type: String },
    createdBy: {
      type: Schema.Types.Mixed,
      required: true,
      index: true,
    },
    legacyLabelId: {
      type: Schema.Types.Mixed,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

LabelAssignmentSchema.index(
  { sampleId: 1, createdBy: 1, type: 1, name: 1, targetScope: 1, messageIndex: 1, messageRole: 1 },
  { unique: true }
);

LabelAssignmentSchema.index({ sampleId: 1, targetScope: 1, messageIndex: 1, createdAt: -1 });

export const LabelAssignment = mongoose.model<ILabelAssignment>('LabelAssignment', LabelAssignmentSchema);
