import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/authMiddleware';
import Folder from '../models/Folder';
import Document from '../models/Document';
import { isString } from '../utils/validate';
import { sendServerError } from '../utils/asyncHandler';

const MAX_NAME = 100;

const param = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? '';

const cleanName = (v: unknown): string | null => {
  if (!isString(v)) return null;
  const n = v.trim();
  return n.length > 0 && n.length <= MAX_NAME ? n : null;
};

export const getFolders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    res.json(await Folder.find({ ownerId: req.user._id.toString() }));
  } catch (error) {
    sendServerError(res, error, 'getFolders failed');
  }
};

export const createFolder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user._id.toString();
    const name = req.body?.name === undefined ? 'New Folder' : cleanName(req.body.name);
    if (!name) {
      res.status(400).json({ message: `Folder name must be 1-${MAX_NAME} characters` });
      return;
    }

    const { parentFolderId } = req.body ?? {};
    if (parentFolderId) {
      const parent =
        isString(parentFolderId) && mongoose.isValidObjectId(parentFolderId)
          ? await Folder.findOne({ _id: parentFolderId, ownerId: userId })
          : null;
      if (!parent) {
        res.status(400).json({ message: 'Parent folder not found' });
        return;
      }
      if (parent.parentFolderId) {
        res.status(400).json({ message: 'Only one level of nesting is permitted' });
        return;
      }
    }

    const folder = await Folder.create({ name, ownerId: userId, parentFolderId: parentFolderId || null });
    res.status(201).json(folder);
  } catch (error) {
    sendServerError(res, error, 'createFolder failed');
  }
};

export const renameFolder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const name = cleanName(req.body?.name);
    const id = param(req.params.id);
    if (!name) {
      res.status(400).json({ message: `Folder name must be 1-${MAX_NAME} characters` });
      return;
    }

    const folder = mongoose.isValidObjectId(id)
      ? await Folder.findOneAndUpdate({ _id: id, ownerId: req.user._id.toString() }, { name }, { new: true })
      : null;
    if (!folder) {
      res.status(404).json({ message: 'Folder not found' });
      return;
    }
    res.json(folder);
  } catch (error) {
    sendServerError(res, error, 'renameFolder failed');
  }
};

export const deleteFolder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = param(req.params.id);
    const folder = mongoose.isValidObjectId(id)
      ? await Folder.findOneAndDelete({ _id: id, ownerId: req.user._id.toString() })
      : null;
    if (!folder) {
      res.status(404).json({ message: 'Folder not found' });
      return;
    }

    const folderId = folder._id.toString();
    // Move orphaned documents back to root and unparent child folders.
    await Document.updateMany({ folderId }, { $set: { folderId: null } });
    await Folder.updateMany({ parentFolderId: folderId }, { $set: { parentFolderId: null } });

    res.json({ message: 'Folder deleted' });
  } catch (error) {
    sendServerError(res, error, 'deleteFolder failed');
  }
};
