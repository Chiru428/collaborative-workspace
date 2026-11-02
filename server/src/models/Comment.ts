import mongoose, { Schema } from 'mongoose';

export interface IComment {
  _id: string;
  documentId: string;
  authorId: string;
  content: string;
  resolved: boolean;
  anchorFrom: number;
  anchorTo: number;
  mentions: string[];
  createdAt: Date;
  updatedAt: Date;
}

const commentSchema: Schema = new Schema(
  {
    _id: { type: String, required: true },
    documentId: { type: String, required: true, ref: 'Document' },
    authorId: { type: String, required: true, ref: 'User' },
    content: { type: String, required: true },
    resolved: { type: Boolean, default: false },
    anchorFrom: { type: Number, required: true },
    anchorTo: { type: Number, required: true },
    mentions: [{ type: String, ref: 'User' }],
  },
  {
    timestamps: true,
  }
);

commentSchema.index({ documentId: 1, createdAt: 1 });

export default mongoose.model<IComment>('Comment', commentSchema);
