import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/authMiddleware';
import Notification from '../models/Notification';
import { sendServerError } from '../utils/asyncHandler';

export const getNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const notifications = await Notification.find({ userId: req.user._id.toString() })
      .populate('fromUserId', 'email')
      .populate('documentId', 'title')
      .sort({ createdAt: -1 })
      .limit(50); // recent 50 only

    res.json(notifications);
  } catch (error) {
    sendServerError(res, error, 'getNotifications failed');
  }
};

export const markAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const notification = mongoose.isValidObjectId(id)
      ? await Notification.findOneAndUpdate({ _id: id, userId: req.user._id.toString() }, { read: true }, { new: true })
      : null;

    if (!notification) {
      res.status(404).json({ message: 'Notification not found' });
      return;
    }
    res.json(notification);
  } catch (error) {
    sendServerError(res, error, 'markAsRead failed');
  }
};

export const markAllAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await Notification.updateMany({ userId: req.user._id.toString(), read: false }, { read: true });
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    sendServerError(res, error, 'markAllAsRead failed');
  }
};
