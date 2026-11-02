import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/authMiddleware';
import Comment from '../models/Comment';
import Notification from '../models/Notification';
import Document from '../models/Document';
import { getRole } from '../utils/access';
import { isString } from '../utils/validate';
import { sendServerError } from '../utils/asyncHandler';

const MAX_COMMENT = 5000;
const MAX_MENTIONS = 20;

const param = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? '';

/** Loads the document and verifies the caller can see it. Responds 404 otherwise so ids can't be probed. */
const loadReadable = async (req: AuthRequest, res: Response) => {
  const id = param(req.params.id);
  const document = mongoose.isValidObjectId(id) ? await Document.findById(id).select('ownerId collaborators') : null;
  const role = document ? getRole(document, req.user._id.toString()) : null;
  if (!document || !role) {
    res.status(404).json({ message: 'Document not found' });
    return null;
  }
  return { document, role };
};

export const getComments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const loaded = await loadReadable(req, res);
    if (!loaded) return;

    const comments = await Comment.find({ documentId: loaded.document._id.toString() })
      .populate('authorId', 'email')
      .populate('mentions', 'email')
      .sort({ createdAt: 1 })
      .limit(1000);

    res.json(comments);
  } catch (error) {
    sendServerError(res, error, 'getComments failed');
  }
};

export const createComment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { _id, content, anchorFrom, anchorTo, mentions } = req.body ?? {};

    if (!isString(content) || content.trim().length === 0 || content.length > MAX_COMMENT) {
      res.status(400).json({ message: `Comment must be 1-${MAX_COMMENT} characters` });
      return;
    }
    if (!Number.isFinite(anchorFrom) || !Number.isFinite(anchorTo)) {
      res.status(400).json({ message: 'Invalid comment anchor' });
      return;
    }
    if (_id !== undefined && (!isString(_id) || _id.length === 0 || _id.length > 64)) {
      res.status(400).json({ message: 'Invalid comment id' });
      return;
    }
    if (mentions !== undefined && (!Array.isArray(mentions) || mentions.length > MAX_MENTIONS || !mentions.every(isString))) {
      res.status(400).json({ message: 'Invalid mentions' });
      return;
    }

    const loaded = await loadReadable(req, res);
    if (!loaded) return;
    const { document, role } = loaded;
    const userId = req.user._id.toString();
    const documentId = document._id.toString();

    // Only people who can actually open the document can be mentioned.
    const members = new Set<string>([document.ownerId, ...(document.collaborators || []).map((c) => c.userId)]);
    const validMentions = [...new Set<string>(mentions ?? [])].filter((m) => members.has(m) && m !== userId);

    if (_id && (await Comment.exists({ _id }))) {
      res.status(409).json({ message: 'Comment id already exists' });
      return;
    }

    const comment = await Comment.create({
      _id: _id || new mongoose.Types.ObjectId().toString(),
      documentId,
      authorId: userId,
      content: content.trim(),
      anchorFrom,
      anchorTo,
      mentions: validMentions,
    });

    const notifications: { userId: string; fromUserId: string; documentId: string; type: 'mention' | 'comment' }[] =
      validMentions.map((target) => ({ userId: target, fromUserId: userId, documentId, type: 'mention' }));
    // Notify the owner unless they wrote the comment or were already notified via a mention.
    if (role !== 'owner' && !validMentions.includes(document.ownerId)) {
      notifications.push({ userId: document.ownerId, fromUserId: userId, documentId, type: 'comment' });
    }
    if (notifications.length > 0) await Notification.insertMany(notifications);

    const populated = await Comment.findById(comment._id).populate('authorId', 'email').populate('mentions', 'email');
    res.status(201).json(populated);
  } catch (error) {
    sendServerError(res, error, 'createComment failed');
  }
};

export const resolveComment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const comment = await Comment.findById(param(req.params.id));
    const document = comment ? await Document.findById(comment.documentId).select('ownerId collaborators') : null;
    const role = document ? getRole(document, req.user._id.toString()) : null;
    if (!comment || !document || !role) {
      res.status(404).json({ message: 'Comment not found' });
      return;
    }

    const isAuthor = comment.authorId.toString() === req.user._id.toString();
    if (role !== 'owner' && !isAuthor) {
      res.status(403).json({ message: 'Only the document owner or comment author can resolve this comment' });
      return;
    }

    comment.resolved = true;
    await comment.save();
    res.json({ message: 'Comment resolved successfully', comment });
  } catch (error) {
    sendServerError(res, error, 'resolveComment failed');
  }
};
