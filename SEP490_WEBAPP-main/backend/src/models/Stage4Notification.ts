import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IStage4Notification extends Document {
  datasetVersionId: Types.ObjectId;
  recipientId?: Types.ObjectId;
  recipientRole?: 'admin' | 'supervisor' | 'staff';
  actorId?: Types.ObjectId;
  assignmentRef?: Types.ObjectId;
  type: 'info' | 'success' | 'warning';
  message: string;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const Stage4NotificationSchema = new Schema<IStage4Notification>(
  {
    datasetVersionId: { type: Schema.Types.ObjectId, ref: 'DatasetVersion', required: true, index: true },
    recipientId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    recipientRole: { type: String, enum: ['admin', 'supervisor', 'staff'], index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    assignmentRef: { type: Schema.Types.ObjectId, ref: 'DatasetAssignmentSubmission', index: true },
    type: { type: String, enum: ['info', 'success', 'warning'], default: 'info' },
    message: { type: String, required: true },
    readAt: { type: Date },
  },
  { timestamps: true }
);

Stage4NotificationSchema.index({ datasetVersionId: 1, recipientId: 1, createdAt: -1 });
Stage4NotificationSchema.index({ datasetVersionId: 1, recipientRole: 1, createdAt: -1 });

export const Stage4Notification = mongoose.model<IStage4Notification>(
  'Stage4Notification',
  Stage4NotificationSchema
);
