import mongoose, { Schema, Document } from 'mongoose';

export interface IGlobalConfig extends Document {
  key: string;
  value: any;
  updatedAt: Date;
}

const GlobalConfigSchema: Schema = new Schema({
  key: { type: String, required: true, unique: true, index: true },
  value: { type: Schema.Types.Mixed, default: {} },
  updatedAt: { type: Date, default: Date.now },
});

export const GlobalConfig = mongoose.model<IGlobalConfig>('GlobalConfig', GlobalConfigSchema);
