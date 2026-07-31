import mongoose, { Document, Schema } from 'mongoose';

export interface IRoutingDecisionLog extends Document {
  ownerId: mongoose.Types.ObjectId;
  sessionId?: string;
  inputHash: string;
  mode: string;
  ruleResult?: any;
  llmResult?: any;
  finalSubject: string;
  selectedModel?: string;
  strategy: string;
  confidence: number;
  needClarification: boolean;
  llmCalled: boolean;
  latencyMs: number;
  createdAt: Date;
}

const RoutingDecisionLogSchema = new Schema<IRoutingDecisionLog>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sessionId: { type: String, index: true },
  inputHash: { type: String, required: true },
  mode: { type: String, required: true },
  ruleResult: { type: Schema.Types.Mixed },
  llmResult: { type: Schema.Types.Mixed },
  finalSubject: { type: String, required: true, index: true },
  selectedModel: { type: String },
  strategy: { type: String, required: true, index: true },
  confidence: { type: Number, required: true },
  needClarification: { type: Boolean, required: true },
  llmCalled: { type: Boolean, required: true },
  latencyMs: { type: Number, required: true },
}, { timestamps: true });

RoutingDecisionLogSchema.index({ ownerId: 1, createdAt: -1 });
export const RoutingDecisionLog = mongoose.model<IRoutingDecisionLog>('RoutingDecisionLog', RoutingDecisionLogSchema);
