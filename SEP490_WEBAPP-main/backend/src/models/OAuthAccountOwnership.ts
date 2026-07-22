import mongoose, { Schema } from 'mongoose';

const OAuthAccountOwnershipSchema = new Schema({
  accountHash: { type: String, required: true, unique: true, index: true },
  ownerId: { type: Schema.Types.ObjectId, required: true, index: true, ref: 'User' },
  provider: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const OAuthAccountOwnership = mongoose.model('OAuthAccountOwnership', OAuthAccountOwnershipSchema);
