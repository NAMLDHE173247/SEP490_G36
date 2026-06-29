import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  name: string;
  role: 'admin' | 'supervisor' | 'staff' | 'reviewer' | 'checker';
  status: 'active' | 'pending' | 'banned' | 'inactive';
  lastLogin?: Date;
  createdAt: Date;
  apiKeys?: {
    openai?: string;
    gemini?: string;
    anthropic?: string;
    openrouter?: string;
    deepseek?: string;
    groq?: string;
  };
}

const UserSchema: Schema = new Schema({
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  passwordHash: { type: String, required: true },
  name: { type: String, required: true, trim: true },
  role: { type: String, required: true, enum: ['admin', 'supervisor', 'staff', 'reviewer', 'checker'], default: 'staff' },
  status: { type: String, required: true, enum: ['active', 'pending', 'banned', 'inactive'], default: 'active' },
  lastLogin: { type: Date },
  createdAt: { type: Date, default: Date.now },
  apiKeys: {
    openai: { type: String, default: '' },
    gemini: { type: String, default: '' },
    anthropic: { type: String, default: '' },
    openrouter: { type: String, default: '' },
    deepseek: { type: String, default: '' },
    groq: { type: String, default: '' },
  },
});

export const User = mongoose.model<IUser>('User', UserSchema);
