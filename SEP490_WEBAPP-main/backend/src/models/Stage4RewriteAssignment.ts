import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IStage4RewriteAssignment extends Document {
  datasetVersionId: Types.ObjectId;
  sampleId: Types.ObjectId;
  assigneeId: Types.ObjectId;
  checkerId?: Types.ObjectId;
  assignedBy: Types.ObjectId;
  convId: string;
  subject?: string;
  reason: string;
  originalText: string;
  targetMessageIndex?: number | null;
  targetMessageIndices?: number[];
  contextMode?: 'n-2:n+2' | 'n-1:n+1' | 'n-1:n' | 'target-only' | 'full';
  conversationMessages?: Array<{ role: string; content: string; isTarget?: boolean }>;
  submittedText?: string;
  status: 'assigned' | 'submitted' | 'checker_approved' | 'approved' | 'rejected' | 'redo';
  reviewedBy?: Types.ObjectId;
  reviewNote?: string;
  checkerReviewNote?: string;
  submittedAt?: Date;
  reviewedAt?: Date;
  checkerReviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const Stage4RewriteAssignmentSchema = new Schema<IStage4RewriteAssignment>(
  {
    datasetVersionId: { type: Schema.Types.ObjectId, ref: 'DatasetVersion', required: true, index: true },
    sampleId: { type: Schema.Types.ObjectId, ref: 'ProcessedDatasetItem', required: true, index: true },
    assigneeId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    checkerId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    convId: { type: String, required: true },
    subject: { type: String, default: '' },
    reason: { type: String, default: 'None' },
    originalText: { type: String, default: '' },
    targetMessageIndex: { type: Number, default: null },
    targetMessageIndices: { type: [Number], default: [] },
    contextMode: {
      type: String,
      enum: ['n-2:n+2', 'n-1:n+1', 'n-1:n', 'target-only', 'full'],
      default: 'n-2:n+2',
    },
    conversationMessages: {
      type: [
        {
          role: { type: String, default: '' },
          content: { type: String, default: '' },
          isTarget: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
    submittedText: { type: String, default: '' },
    status: {
      type: String,
      enum: ['assigned', 'submitted', 'checker_approved', 'approved', 'rejected', 'redo'],
      default: 'assigned',
      index: true,
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewNote: { type: String, default: '' },
    checkerReviewNote: { type: String, default: '' },
    submittedAt: { type: Date },
    reviewedAt: { type: Date },
    checkerReviewedAt: { type: Date },
  },
  { timestamps: true }
);

Stage4RewriteAssignmentSchema.index(
  { datasetVersionId: 1, sampleId: 1, targetMessageIndex: 1 },
  { unique: true }
);

export const Stage4RewriteAssignment = mongoose.model<IStage4RewriteAssignment>(
  'Stage4RewriteAssignment',
  Stage4RewriteAssignmentSchema
);
