import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ILabelSnapshot extends Document {
  datasetVersionId: Types.ObjectId;
  name: string;
  description?: string;
  createdBy: Types.ObjectId;
  labelAssignments: Array<{
    sampleId: Types.ObjectId;
    name: string;
    type: 'hard' | 'soft';
    targetScope: 'sample' | 'message';
    messageIndex?: number | null;
    messageRole?: 'user' | 'assistant' | null;
    targetTextSnapshot?: string;
    createdBy: Types.ObjectId;
    legacyLabelId?: Types.ObjectId | null;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const LabelSnapshotSchema = new Schema<ILabelSnapshot>(
  {
    datasetVersionId: {
      type: Schema.Types.ObjectId,
      ref: 'DatasetVersion',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    labelAssignments: [
      {
        sampleId: { type: Schema.Types.ObjectId, ref: 'ProcessedDatasetItem', required: true },
        name: { type: String, required: true },
        type: { type: String, enum: ['hard', 'soft'], required: true },
        targetScope: { type: String, enum: ['sample', 'message'], required: true },
        messageIndex: { type: Number, default: null },
        messageRole: { type: String, enum: ['user', 'assistant'], default: null },
        targetTextSnapshot: { type: String },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        legacyLabelId: { type: Schema.Types.ObjectId, ref: 'Label', default: null },
      },
    ],
  },
  {
    timestamps: true,
  }
);

LabelSnapshotSchema.index({ datasetVersionId: 1, createdAt: -1 });

export const LabelSnapshot = mongoose.model<ILabelSnapshot>('LabelSnapshot', LabelSnapshotSchema);
