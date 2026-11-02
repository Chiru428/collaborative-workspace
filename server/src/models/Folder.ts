import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';

export interface IFolder extends MongooseDocument {
  name: string;
  ownerId: string;
  parentFolderId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const folderSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    ownerId: { type: String, required: true, ref: 'User' },
    parentFolderId: { type: String, ref: 'Folder', default: null },
  },
  {
    timestamps: true,
  }
);

folderSchema.index({ ownerId: 1 });

export default mongoose.model<IFolder>('Folder', folderSchema);
