import mongoose, { Document, Schema } from 'mongoose';

export interface IHumanAuditAssignment extends Document {
  ownerId: mongoose.Types.ObjectId;
  modelEvalId: string;
  jobId: string;
  projectName: string;
  staffId: mongoose.Types.ObjectId;
  checkerId?: mongoose.Types.ObjectId;
  assignedConvIndexes: number[];
  createdBy: mongoose.Types.ObjectId;
  status: 'assigned' | 'in_progress' | 'completed';
  createdAt: Date;
  updatedAt: Date;
}

export interface IHumanAuditReview extends Document {
  ownerId: mongoose.Types.ObjectId;
  modelEvalId: string;
  convIndex: number;
  itemId?: string;
  reviewerId: mongoose.Types.ObjectId;
  reviewerName: string;
  targetModel?: 'ft' | 'base';
  verdict: 'reviewed' | 'skip';
  note?: string;
  rubricVersion: string;
  humanScores?: Record<string, number>;
  humanReasons?: Record<string, string>;
  humanOutcomes?: Record<string, unknown>;
  aiScoresSnapshot?: Record<string, number>;
  aiConflict?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IHumanAuditAdjudication extends Document {
  ownerId: mongoose.Types.ObjectId;
  modelEvalId: string;
  convIndex: number;
  supervisorId?: mongoose.Types.ObjectId;
  adjudicatorId: mongoose.Types.ObjectId;
  adjudicatorRole: 'checker' | 'supervisor' | 'admin';
  resolution: 'accept_ai' | 'accept_staff' | 'manual';
  selectedReviewId?: mongoose.Types.ObjectId;
  finalScores: Record<string, number>;
  finalReasons: Record<string, string>;
  note: string;
  createdAt: Date;
  updatedAt: Date;
}

const HumanAuditAssignmentSchema = new Schema<IHumanAuditAssignment>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  modelEvalId: { type: String, required: true, index: true },
  // Defaults keep legacy HumanAuditAssignment rows writable; the next manager
  // assignment backfills the project package snapshot.
  jobId: { type: String, default: '', index: true },
  projectName: { type: String, default: '', trim: true, index: true },
  staffId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  checkerId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  assignedConvIndexes: { type: [Number], default: [] },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['assigned', 'in_progress', 'completed'], default: 'assigned' },
}, { timestamps: true });
HumanAuditAssignmentSchema.index({ modelEvalId: 1, staffId: 1 }, { unique: true });
HumanAuditAssignmentSchema.index({ checkerId: 1, modelEvalId: 1 });

const HumanAuditReviewSchema = new Schema<IHumanAuditReview>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  modelEvalId: { type: String, required: true, index: true },
  convIndex: { type: Number, required: true },
  itemId: { type: String, default: '' },
  reviewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  reviewerName: { type: String, required: true },
  targetModel: { type: String, enum: ['ft', 'base'], default: 'ft' },
  verdict: { type: String, enum: ['reviewed', 'skip'], required: true },
  note: { type: String, default: '' },
  rubricVersion: { type: String, required: true },
  humanScores: { type: Schema.Types.Mixed, default: null },
  humanReasons: { type: Schema.Types.Mixed, default: null },
  humanOutcomes: { type: Schema.Types.Mixed, default: null },
  aiScoresSnapshot: { type: Schema.Types.Mixed, default: null },
  aiConflict: { type: Schema.Types.Mixed, default: null },
}, { timestamps: true });
HumanAuditReviewSchema.index({ modelEvalId: 1, convIndex: 1, reviewerId: 1, targetModel: 1 }, { unique: true });

const HumanAuditAdjudicationSchema = new Schema<IHumanAuditAdjudication>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  modelEvalId: { type: String, required: true, index: true },
  convIndex: { type: Number, required: true },
  supervisorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  adjudicatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  adjudicatorRole: { type: String, enum: ['checker', 'supervisor', 'admin'], required: true },
  resolution: { type: String, enum: ['accept_ai', 'accept_staff', 'manual'], required: true },
  selectedReviewId: { type: Schema.Types.ObjectId, ref: 'HumanAuditReview', default: null },
  finalScores: { type: Schema.Types.Mixed, required: true },
  finalReasons: { type: Schema.Types.Mixed, default: {} },
  note: { type: String, required: true },
}, { timestamps: true });
HumanAuditAdjudicationSchema.index({ modelEvalId: 1, convIndex: 1 }, { unique: true });

export const HumanAuditAssignment = mongoose.model<IHumanAuditAssignment>('HumanAuditAssignment', HumanAuditAssignmentSchema);
export const HumanAuditReview = mongoose.model<IHumanAuditReview>('HumanAuditReview', HumanAuditReviewSchema);
export const HumanAuditAdjudication = mongoose.model<IHumanAuditAdjudication>('HumanAuditAdjudication', HumanAuditAdjudicationSchema);

HumanAuditReview.syncIndexes().catch(err => console.warn('[HumanAuditReview] syncIndexes:', err?.message));
