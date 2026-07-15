import mongoose, { Schema, Document } from 'mongoose';

export interface IModelRegistry extends Document {
  ownerId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  baseModel: string;
  subject: string;
  routerEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ModelRegistrySchema = new Schema<IModelRegistry>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    baseModel: { type: String, required: true },
    subject: { type: String, default: 'UNKNOWN', index: true, uppercase: true, trim: true },
    routerEnabled: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

ModelRegistrySchema.index({ ownerId: 1, name: 1 }, { unique: true });

export const ModelRegistry = mongoose.model<IModelRegistry>('ModelRegistry', ModelRegistrySchema);
