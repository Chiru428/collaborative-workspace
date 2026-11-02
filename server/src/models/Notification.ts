import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';

export interface INotification extends MongooseDocument {
  userId: string;
  fromUserId: string;
  documentId: string;
  type: 'mention' | 'comment' | 'share';
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema: Schema = new Schema(
  {
    userId: { type: String, required: true, ref: 'User' },
    fromUserId: { type: String, required: true, ref: 'User' },
    documentId: { type: String, required: true, ref: 'Document' },
    type: { type: String, enum: ['mention', 'comment', 'share'], required: true },
    read: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model<INotification>('Notification', notificationSchema);
