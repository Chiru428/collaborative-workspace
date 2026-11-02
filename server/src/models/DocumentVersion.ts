import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';

export interface IDocumentVersion extends MongooseDocument {
  documentId: string;
  snapshot: Buffer;
  label?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const documentVersionSchema: Schema = new Schema(
  {
    documentId: { type: String, required: true, ref: 'Document' },
    snapshot: { type: Buffer, required: true },
    label: { type: String },
    createdBy: { type: String, required: true, ref: 'User' },
  },
  {
    timestamps: true,
  }
);

documentVersionSchema.index({ documentId: 1, createdAt: -1 });

export default mongoose.model<IDocumentVersion>('DocumentVersion', documentVersionSchema);
