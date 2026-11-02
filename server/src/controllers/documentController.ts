import { Response } from 'express';
import mongoose from 'mongoose';
import * as Y from 'yjs';
import Document, { IDocument } from '../models/Document';
import User from '../models/User';
import Folder from '../models/Folder';
import Comment from '../models/Comment';
import Notification from '../models/Notification';
import DocumentVersion from '../models/DocumentVersion';
import { AuthRequest } from '../middleware/authMiddleware';
import { loadDocument, lastSnapshotTimes, dropDocument, disconnectUser, releaseIfIdle } from '../socket/yjsSetup';
import { cacheDel } from '../config/redis';
import { canWrite, getRole, Role } from '../utils/access';
import { emailQuery, isString, isValidRole, normalizeEmail } from '../utils/validate';
import { sendServerError } from '../utils/asyncHandler';

const MAX_TITLE = 200;

const param = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? '';

interface Loaded {
  document: IDocument;
  role: Role;
}

/**
 * Loads a document and checks the caller's access. Sends the error response and returns null on failure.
 *  - no access / missing / malformed id  -> 404 (doesn't reveal which ids exist)
 *  - has access but insufficient role    -> 403
 */
const loadWithAccess = async (
  req: AuthRequest,
  res: Response,
  need: 'read' | 'write' | 'owner',
  select?: string
): Promise<Loaded | null> => {
  const id = param(req.params.id);
  const document = mongoose.isValidObjectId(id) ? await Document.findById(id).select(select ?? '') : null;
  const role = document ? getRole(document, req.user._id.toString()) : null;
  if (!document || !role) {
    res.status(404).json({ message: 'Document not found' });
    return null;
  }
  if ((need === 'owner' && role !== 'owner') || (need === 'write' && !canWrite(role))) {
    const msg = need === 'owner' ? 'Only the owner can do this' : 'You do not have permission to edit this document';
    res.status(403).json({ message: msg });
    return null;
  }
  return { document, role };
};

const cleanTitle = (v: unknown): string | null => {
  if (!isString(v)) return null;
  const t = v.trim();
  return t.length > 0 && t.length <= MAX_TITLE ? t : null;
};

export const createDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let title = 'Untitled Document';
    if (req.body?.title !== undefined) {
      const t = cleanTitle(req.body.title);
      if (!t) {
        res.status(400).json({ message: `Title must be 1-${MAX_TITLE} characters` });
        return;
      }
      title = t;
    }

    let folderId: string | null = null;
    if (req.body?.folderId) {
      const folder = isString(req.body.folderId) && mongoose.isValidObjectId(req.body.folderId)
        ? await Folder.findOne({ _id: req.body.folderId, ownerId: req.user._id.toString() })
        : null;
      if (!folder) {
        res.status(400).json({ message: 'Folder not found' });
        return;
      }
      folderId = folder._id.toString() as string | null;
    }

    const document = await Document.create({
      title,
      ownerId: req.user._id.toString(),
      collaborators: [],
      folderId: folderId ?? undefined,
    });
    res.status(201).json(document);
  } catch (error) {
    sendServerError(res, error, 'createDocument failed');
  }
};

export const getDocuments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user._id.toString();
    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 200, 1), 500);
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);

    const documents = await Document.find({
      $or: [{ ownerId: userId }, { 'collaborators.userId': userId }],
    })
      .select('-documentState -plainText') // heavy fields the list never needs
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // Attach collaborator emails with a single lookup for the whole page of documents.
    const collabIds = [...new Set(documents.flatMap((d) => (d.collaborators || []).map((c) => c.userId)))];
    const users = collabIds.length ? await User.find({ _id: { $in: collabIds } }).select('email').lean() : [];
    const emailById = new Map(users.map((u) => [u._id.toString(), u.email]));

    res.json(
      documents.map((doc) => ({
        ...doc,
        role: getRole(doc as any, userId) ?? 'viewer',
        collaborators: (doc.collaborators || []).map((c) => ({ ...c, email: emailById.get(c.userId) })),
      }))
    );
  } catch (error) {
    sendServerError(res, error, 'getDocuments failed');
  }
};

export const getDocumentById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const loaded = await loadWithAccess(req, res, 'read', '-documentState -plainText');
    if (!loaded) return;
    const { document, role } = loaded;

    // One query for all collaborator emails instead of one per collaborator.
    const ids = (document.collaborators || []).map((c) => c.userId);
    const users = ids.length ? await User.find({ _id: { $in: ids } }).select('email').lean() : [];
    const emailById = new Map(users.map((u) => [u._id.toString(), u.email]));

    res.json({
      ...document.toObject(),
      role,
      collaborators: (document.collaborators || []).map((c) => ({
        userId: c.userId,
        role: c.role,
        addedAt: c.addedAt,
        email: emailById.get(c.userId) || 'Unknown User',
      })),
    });
  } catch (error) {
    sendServerError(res, error, 'getDocumentById failed');
  }
};

export const updateDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const loaded = await loadWithAccess(req, res, 'write', '-documentState -plainText');
    if (!loaded) return;

    // Only the title can be changed through this endpoint.
    if (req.body?.title !== undefined) {
      const title = cleanTitle(req.body.title);
      if (!title) {
        res.status(400).json({ message: `Title must be 1-${MAX_TITLE} characters` });
        return;
      }
      loaded.document.title = title;
      await loaded.document.save();
    }

    res.json(loaded.document);
  } catch (error) {
    sendServerError(res, error, 'updateDocument failed');
  }
};

export const searchDocuments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const query = isString(req.query.q) ? req.query.q.trim().slice(0, 100) : '';
    if (!query) {
      res.json([]);
      return;
    }

    const userId = req.user._id.toString();
    const documents = await Document.find(
      {
        $text: { $search: query },
        $or: [{ ownerId: userId }, { 'collaborators.userId': userId }],
      },
      { score: { $meta: 'textScore' }, documentState: 0, plainText: 0 }
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(20);

    res.json(documents);
  } catch (error) {
    sendServerError(res, error, 'searchDocuments failed');
  }
};

export const moveToFolder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const loaded = await loadWithAccess(req, res, 'owner', '-documentState -plainText');
    if (!loaded) return;

    const { folderId } = req.body ?? {};
    if (folderId) {
      const folder = isString(folderId) && mongoose.isValidObjectId(folderId)
        ? await Folder.findOne({ _id: folderId, ownerId: req.user._id.toString() })
        : null;
      if (!folder) {
        res.status(400).json({ message: 'Folder not found' });
        return;
      }
    }

    loaded.document.folderId = folderId || undefined;
    await loaded.document.save();
    res.json(loaded.document);
  } catch (error) {
    sendServerError(res, error, 'moveToFolder failed');
  }
};

export const updateTags = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { tags } = req.body ?? {};
    if (!Array.isArray(tags) || tags.length > 20 || !tags.every((t) => isString(t) && t.trim().length > 0 && t.length <= 50)) {
      res.status(400).json({ message: 'Tags must be an array of up to 20 non-empty strings (max 50 chars each)' });
      return;
    }

    const loaded = await loadWithAccess(req, res, 'owner', '-documentState -plainText');
    if (!loaded) return;

    loaded.document.tags = [...new Set<string>(tags.map((t: string) => t.trim()))];
    await loaded.document.save();
    res.json(loaded.document);
  } catch (error) {
    sendServerError(res, error, 'updateTags failed');
  }
};

export const deleteDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const loaded = await loadWithAccess(req, res, 'owner');
    if (!loaded) return;
    const id = loaded.document._id.toString();

    await Document.deleteOne({ _id: id });
    // Cascade: nothing should outlive its document.
    await Promise.all([
      DocumentVersion.deleteMany({ documentId: id }),
      Comment.deleteMany({ documentId: id }),
      Notification.deleteMany({ documentId: id }),
      cacheDel(`doc:${id}`),
    ]);
    dropDocument(id); // disconnects live editors and frees memory

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    sendServerError(res, error, 'deleteDocument failed');
  }
};

export const shareDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const email = normalizeEmail(req.body?.email);
    const role = req.body?.role;
    if (!email) {
      res.status(400).json({ message: 'A valid email is required' });
      return;
    }
    if (!isValidRole(role)) {
      res.status(400).json({ message: "Role must be 'editor' or 'viewer'" });
      return;
    }

    const loaded = await loadWithAccess(req, res, 'owner', '-documentState -plainText');
    if (!loaded) return;
    const { document } = loaded;

    const userToShareWith = await User.findOne(emailQuery(email));
    if (!userToShareWith) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const targetUserId = userToShareWith._id.toString();
    if (document.ownerId === targetUserId) {
      res.status(400).json({ message: 'User is already the owner' });
      return;
    }
    if (document.collaborators?.some((c) => c.userId === targetUserId)) {
      res.status(400).json({ message: 'User is already a collaborator' });
      return;
    }

    const addedAt = new Date();
    document.collaborators.push({ userId: targetUserId, role, addedAt });
    await document.save();

    await Notification.create({
      userId: targetUserId,
      fromUserId: req.user._id.toString(),
      documentId: document._id.toString(),
      type: 'share',
    });

    res.json({
      document,
      newCollaborator: { userId: targetUserId, role, addedAt, email: userToShareWith.email },
    });
  } catch (error) {
    sendServerError(res, error, 'shareDocument failed');
  }
};

export const removeCollaborator = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const loaded = await loadWithAccess(req, res, 'owner', '-documentState -plainText');
    if (!loaded) return;
    const { document } = loaded;
    const userId = param(req.params.userId);

    document.collaborators = document.collaborators.filter((c) => c.userId !== userId);
    await document.save();
    disconnectUser(document._id.toString(), userId); // cut off any open editing session

    res.json({ message: 'Collaborator removed' });
  } catch (error) {
    sendServerError(res, error, 'removeCollaborator failed');
  }
};

export const updateCollaboratorRole = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { role } = req.body ?? {};
    if (!isValidRole(role)) {
      res.status(400).json({ message: "Role must be 'editor' or 'viewer'" });
      return;
    }

    const loaded = await loadWithAccess(req, res, 'owner', '-documentState -plainText');
    if (!loaded) return;
    const { document } = loaded;
    const userId = param(req.params.userId);

    const collab = document.collaborators.find((c) => c.userId === userId);
    if (!collab) {
      res.status(404).json({ message: 'Collaborator not found' });
      return;
    }

    collab.role = role;
    await document.save();
    disconnectUser(document._id.toString(), userId); // reconnect picks up the new role

    res.json({ message: 'Collaborator role updated' });
  } catch (error) {
    sendServerError(res, error, 'updateCollaboratorRole failed');
  }
};

export const getVersions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const loaded = await loadWithAccess(req, res, 'read', '_id ownerId collaborators');
    if (!loaded) return;

    const versions = await DocumentVersion.find({ documentId: loaded.document._id.toString() })
      .select('-snapshot') // exclude heavy binary
      .populate('createdBy', 'email')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json(versions);
  } catch (error) {
    sendServerError(res, error, 'getVersions failed');
  }
};

export const saveSnapshot = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const label = req.body?.label;
    if (label !== undefined && (!isString(label) || label.length > 100)) {
      res.status(400).json({ message: 'Label must be a string of at most 100 characters' });
      return;
    }

    const loaded = await loadWithAccess(req, res, 'write', '_id ownerId collaborators');
    if (!loaded) return;
    const id = loaded.document._id.toString();

    // loadDocument returns the live in-memory doc if editors are connected, else hydrates from cache/DB.
    const ydoc = await loadDocument(id);
    const state = Y.encodeStateAsUpdate(ydoc);
    const isEmpty = ydoc.share.size === 0;
    releaseIfIdle(id);
    if (isEmpty) {
      res.status(400).json({ message: 'Document has no state to snapshot' });
      return;
    }

    const version = await DocumentVersion.create({
      documentId: id,
      snapshot: Buffer.from(state),
      label: label?.trim() || undefined,
      createdBy: req.user._id.toString(),
    });

    lastSnapshotTimes.set(id, Date.now()); // reset auto-snapshot timer

    res.status(201).json({
      _id: version._id,
      documentId: version.documentId,
      label: version.label,
      createdAt: version.createdAt,
      createdBy: { email: req.user.email },
    });
  } catch (error) {
    sendServerError(res, error, 'saveSnapshot failed');
  }
};

export const restoreVersion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const loaded = await loadWithAccess(req, res, 'owner', '_id ownerId collaborators');
    if (!loaded) return;
    const id = loaded.document._id.toString();

    const versionId = param(req.params.versionId);
    const version = mongoose.isValidObjectId(versionId) ? await DocumentVersion.findById(versionId) : null;
    if (!version || version.documentId.toString() !== id) {
      res.status(404).json({ message: 'Version not found' });
      return;
    }

    const liveDoc = await loadDocument(id);

    // Safety net: keep what is being replaced so a restore can itself be undone.
    if (liveDoc.share.size > 0) {
      await DocumentVersion.create({
        documentId: id,
        snapshot: Buffer.from(Y.encodeStateAsUpdate(liveDoc)),
        label: 'Auto-backup before restore',
        createdBy: req.user._id.toString(),
      });
    }

    const tempDoc = new Y.Doc();
    Y.applyUpdate(tempDoc, version.snapshot);
    const tempFragment = tempDoc.getXmlFragment('default');
    const liveFragment = liveDoc.getXmlFragment('default');

    liveDoc.transact(() => {
      liveFragment.delete(0, liveFragment.length);
      if (tempFragment.length > 0) {
        // Yjs types are bound to their doc, so insert unbound clones.
        liveFragment.insert(0, tempFragment.toArray().map((item) => item.clone()) as any);
      }
    });
    tempDoc.destroy();

    // The doc's update listener persists to MongoDB/Redis; just reset the auto-snapshot timer.
    lastSnapshotTimes.set(id, Date.now());
    releaseIfIdle(id);

    res.json({ message: 'Restored successfully' });
  } catch (error) {
    sendServerError(res, error, 'restoreVersion failed');
  }
};
