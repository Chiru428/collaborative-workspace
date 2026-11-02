import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';

export interface IDocument extends MongooseDocument {
  title: string;
  ownerId: string;
  documentState: Buffer;
  folderId?: string;
  tags: string[];
  plainText?: string;
  collaborators: {
    userId: string;
    role: 'editor' | 'viewer';
    addedAt: Date;
  }[];
}

const documentSchema: Schema = new Schema(
  {
    title: { type: String, required: true, default: 'Untitled Document' },
    ownerId: { type: String, required: true },
    documentState: { type: Buffer },
    collaborators: [
      {
        userId: { type: String, required: true },
        role: { type: String, enum: ['editor', 'viewer'], required: true },
        addedAt: { type: Date, default: Date.now },
      },
    ],
    folderId: { type: String, ref: 'Folder', default: null },
    tags: [{ type: String }],
    plainText: { type: String, default: '' },
  },
  {
    timestamps: true,
  }
);

documentSchema.index({ title: 'text', plainText: 'text' });
documentSchema.index({ ownerId: 1, updatedAt: -1 });
documentSchema.index({ 'collaborators.userId': 1 });

export default mongoose.model<IDocument>('Document', documentSchema);
