import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IConversationRewriteHistory extends Document {
  datasetVersionId: Types.ObjectId;
  sampleId: Types.ObjectId;
  messageIndex: number;
  originalText: string;
  proposedText: string;
  approvedText: string;
  editorId: Types.ObjectId;
  editReason: string;
  editType: 'ai' | 'manual';
  createdAt: Date;
}

const ConversationRewriteHistorySchema = new Schema<IConversationRewriteHistory>(
  {
    datasetVersionId: {
      type: Schema.Types.ObjectId,
      ref: 'DatasetVersion',
      required: true,
      index: true,
    },
    sampleId: {
      type: Schema.Types.ObjectId,
      ref: 'ProcessedDatasetItem',
      required: true,
      index: true,
    },
    messageIndex: {
      type: Number,
      required: true,
    },
    originalText: {
      type: String,
      required: true,
    },
    proposedText: {
      type: String,
      required: true,
    },
    approvedText: {
      type: String,
      required: true,
    },
    editorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    editReason: {
      type: String,
      default: '',
    },
    editType: {
      type: String,
      enum: ['ai', 'manual'],
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

ConversationRewriteHistorySchema.index({ datasetVersionId: 1, sampleId: 1, messageIndex: 1 });

export const ConversationRewriteHistory = mongoose.model<IConversationRewriteHistory>(
  'ConversationRewriteHistory',
  ConversationRewriteHistorySchema
);
