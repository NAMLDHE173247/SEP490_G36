import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IProviderConnectionAudit extends Document {
  userId: Types.ObjectId;
  provider: 'codex' | 'claude' | 'gemini' | 'unknown';
  action: 'oauth_started' | 'oauth_succeeded' | 'oauth_failed' | 'account_disconnected';
  stateHash: string;
  detail: string;
  createdAt: Date;
}

const ProviderConnectionAuditSchema = new Schema<IProviderConnectionAudit>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  provider: { type: String, enum: ['codex', 'claude', 'gemini', 'unknown'], required: true, index: true },
  action: { type: String, enum: ['oauth_started', 'oauth_succeeded', 'oauth_failed', 'account_disconnected'], required: true, index: true },
  stateHash: { type: String, required: true, index: true },
  detail: { type: String, default: '' },
}, { timestamps: true });

ProviderConnectionAuditSchema.index({ stateHash: 1, action: 1 });

export const ProviderConnectionAudit = mongoose.model<IProviderConnectionAudit>('ProviderConnectionAudit', ProviderConnectionAuditSchema);
