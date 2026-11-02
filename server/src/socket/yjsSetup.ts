// @ts-ignore
import { setupWSConnection, getYDoc, docs } from 'y-websocket/bin/utils';
import { WebSocket } from 'ws';
import * as Y from 'yjs';
import { cacheGet, cacheSet } from '../config/redis';
import Document from '../models/Document';
import DocumentVersion from '../models/DocumentVersion';
import { logger } from '../utils/logger';
import type { Role } from '../utils/access';

const SAVE_DEBOUNCE_MS = 2000;
const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;
const MAX_AUTO_SNAPSHOTS = 20;

interface Connection {
  ws: WebSocket;
  userId: string;
  role: Role;
}

const saveTimeouts = new Map<string, NodeJS.Timeout>();
const connections = new Map<string, Set<Connection>>();
// Docs whose persisted state has been applied and which have exactly one 'update' listener.
const loadedDocs = new Set<string>();
const loadingDocs = new Map<string, Promise<Y.Doc>>();
// Maps a websocket (the Yjs transaction origin) to the user that made the change.
const connectionUsers = new WeakMap<object, string>();

// Last auto-snapshot time per doc.
export const lastSnapshotTimes = new Map<string, number>();

export { getYDoc };

const getActiveDoc = (docName: string): Y.Doc | undefined => docs.get(docName);

/** Yjs sync messages that mutate the doc: [0 (sync), 1 (step2) | 2 (update), ...]. */
const isWriteMessage = (data: unknown): boolean => {
  let bytes: Uint8Array;
  if (data instanceof Uint8Array) bytes = data;
  else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
  else if (Array.isArray(data)) bytes = Buffer.concat(data as Buffer[]);
  else return true; // unknown shape: refuse rather than risk letting a write through
  return bytes[0] === 0 && (bytes[1] === 1 || bytes[1] === 2);
};

const snapshot = async (docName: string, ydoc: Y.Doc, userId: string) => {
  const now = Date.now();
  if (now - (lastSnapshotTimes.get(docName) || 0) <= SNAPSHOT_INTERVAL_MS) return;
  lastSnapshotTimes.set(docName, now);

  try {
    await DocumentVersion.create({
      documentId: docName,
      snapshot: Buffer.from(Y.encodeStateAsUpdate(ydoc)),
      createdBy: userId,
    });

    // Keep only the most recent MAX_AUTO_SNAPSHOTS unlabeled snapshots.
    const stale = await DocumentVersion.find({
      documentId: docName,
      $or: [{ label: { $exists: false } }, { label: null }, { label: '' }],
    })
      .sort({ createdAt: -1 })
      .skip(MAX_AUTO_SNAPSHOTS)
      .select('_id')
      .lean();
    if (stale.length > 0) {
      await DocumentVersion.deleteMany({ _id: { $in: stale.map((s) => s._id) } });
    }
    logger.info(`Auto-snapshotted doc ${docName}`);
  } catch (err) {
    logger.error(`Error auto-snapshotting doc ${docName}`, err);
  }
};

/** Writes the current in-memory state to MongoDB (and Redis), then frees the doc if nobody is connected. */
export const persistNow = async (docName: string) => {
  const timer = saveTimeouts.get(docName);
  if (timer) {
    clearTimeout(timer);
    saveTimeouts.delete(docName);
  }

  const ydoc = getActiveDoc(docName);
  if (ydoc) {
    try {
      const state = Y.encodeStateAsUpdate(ydoc);
      const plainText = ydoc
        .getXmlFragment('default')
        .toJSON()
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // No upsert: a document deleted via the API must not be resurrected by a late save.
      await Document.updateOne({ _id: docName }, { $set: { documentState: Buffer.from(state), plainText } });
      await cacheSet(`doc:${docName}`, Buffer.from(state).toString('base64'));
      logger.info(`Saved doc ${docName} to MongoDB`);
    } catch (err) {
      logger.error(`Error saving doc ${docName}`, err);
    }
  }

  evictIfIdle(docName);
};

const scheduleSave = (docName: string) => {
  const existing = saveTimeouts.get(docName);
  if (existing) clearTimeout(existing);
  saveTimeouts.set(
    docName,
    setTimeout(() => {
      persistNow(docName).catch((err) => logger.error(`Persist failed for ${docName}`, err));
    }, SAVE_DEBOUNCE_MS)
  );
};

/** Drops the in-memory doc once nobody is connected and no save is pending. */
const evictIfIdle = (docName: string) => {
  if ((connections.get(docName)?.size ?? 0) > 0 || saveTimeouts.has(docName)) return;
  const ydoc = getActiveDoc(docName);
  loadedDocs.delete(docName);
  loadingDocs.delete(docName);
  docs.delete(docName);
  ydoc?.destroy();
};

/** Hard-removes a doc from memory without saving (used when the document is deleted). */
export const dropDocument = (docName: string) => {
  const timer = saveTimeouts.get(docName);
  if (timer) clearTimeout(timer);
  saveTimeouts.delete(docName);

  const conns = connections.get(docName);
  conns?.forEach((c) => c.ws.close(4004, 'Document deleted'));
  connections.delete(docName);

  const ydoc = getActiveDoc(docName);
  loadedDocs.delete(docName);
  loadingDocs.delete(docName);
  docs.delete(docName);
  ydoc?.destroy();
  lastSnapshotTimes.delete(docName);
};

/** Closes a user's sockets on a doc (access revoked or role changed); they re-authenticate on reconnect. */
export const disconnectUser = (docName: string, userId: string) => {
  connections.get(docName)?.forEach((c) => {
    if (c.userId === userId) c.ws.close(4003, 'Access changed');
  });
};

export const loadDocument = (docName: string): Promise<Y.Doc> => {
  if (loadedDocs.has(docName) && getActiveDoc(docName)) return Promise.resolve(getActiveDoc(docName)!);
  const inflight = loadingDocs.get(docName);
  if (inflight) return inflight;

  const promise = (async () => {
    const ydoc = getYDoc(docName) as Y.Doc;

    let applied = false;
    const cached = await cacheGet(`doc:${docName}`);
    if (cached) {
      Y.applyUpdate(ydoc, Buffer.from(cached, 'base64'));
      applied = true;
    }

    if (!applied) {
      try {
        const mongoDoc = await Document.findById(docName).select('documentState');
        if (mongoDoc?.documentState) {
          Y.applyUpdate(ydoc, mongoDoc.documentState);
          await cacheSet(`doc:${docName}`, mongoDoc.documentState.toString('base64'));
        }
      } catch (err) {
        logger.error(`Error loading doc ${docName} from MongoDB`, err);
      }
    }

    // Register the single persistence listener only after persisted state is applied.
    ydoc.on('update', (_update: Uint8Array, origin: unknown) => {
      const userId = (origin && typeof origin === 'object' ? connectionUsers.get(origin) : undefined) ?? 'system';
      void snapshot(docName, ydoc, userId);
      scheduleSave(docName);
    });
    loadedDocs.add(docName);
    return ydoc;
  })().finally(() => loadingDocs.delete(docName));

  loadingDocs.set(docName, promise);
  return promise;
};

/** Returns false if the doc was evicted between load and connect; the caller should reload and retry. */
export const handleConnection = (ws: WebSocket, req: any, docName: string, userId: string, role: Role): boolean => {
  if (!loadedDocs.has(docName) || !getActiveDoc(docName)) return false;

  const conn: Connection = { ws, userId, role };
  if (!connections.has(docName)) connections.set(docName, new Set());
  connections.get(docName)!.add(conn);
  connectionUsers.set(ws, userId);

  if (role === 'viewer') {
    // Viewers may sync/read and share awareness, but their document writes are dropped.
    const originalOn = ws.on.bind(ws) as (event: string, listener: (...args: any[]) => void) => WebSocket;
    (ws as any).on = (event: string, listener: (...args: any[]) => void) =>
      event === 'message'
        ? originalOn(event, (data: unknown, ...rest: unknown[]) => {
            if (!isWriteMessage(data)) listener(data, ...rest);
          })
        : originalOn(event, listener);
  }

  ws.on('close', () => {
    const set = connections.get(docName);
    set?.delete(conn);
    if (set && set.size === 0) {
      connections.delete(docName);
      // Last client left: flush immediately, then free memory.
      persistNow(docName).catch((err) => logger.error(`Persist failed for ${docName}`, err));
    }
  });

  setupWSConnection(ws, req, { docName });
  return true;
};

/** Persists every loaded document (used on shutdown so the debounce window can't lose edits). */
export const flushAll = async () => {
  await Promise.all([...loadedDocs].map((name) => persistNow(name as string)));
};

/** For REST handlers that hydrate a doc via loadDocument: free it again if no editor is connected. */
export const releaseIfIdle = (docName: string) => evictIfIdle(docName);
