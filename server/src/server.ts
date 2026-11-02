import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import http from 'http';
import mongoose from 'mongoose';
import { WebSocketServer, WebSocket } from 'ws';
import { env } from './config/env';
import { connectDB } from './config/db';
import { connectRedis, disconnectRedis } from './config/redis';
import authRoutes from './routes/authRoutes';
import documentRoutes from './routes/documentRoutes';
import commentRoutes from './routes/commentRoutes';
import commentActionRoutes from './routes/commentActionRoutes';
import notificationRoutes from './routes/notificationRoutes';
import folderRoutes from './routes/folderRoutes';
import uploadRoutes, { uploadDir } from './routes/uploadRoutes';
import healthRoutes from './routes/healthRoutes';
import Document from './models/Document';
import { logger } from './utils/logger';
import { getRole } from './utils/access';
import { errorHandler, notFound } from './utils/asyncHandler';
import { handleConnection, loadDocument, flushAll } from './socket/yjsSetup';

const app = express();
app.set('trust proxy', 1);

app.use(
  helmet({
    // The client lives on a different origin and embeds uploaded images.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(
  cors({
    origin: env.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(
  '/api',
  rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false })
);

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/documents/:id/comments', commentRoutes);
app.use('/api/comments', commentActionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/uploads', express.static(uploadDir, { index: false, dotfiles: 'deny' }));

app.use(notFound);
app.use(errorHandler);

const server = http.createServer(app);

const WS_PROTOCOL = 'collab-v1';
const WS_TOKEN_PREFIX = 'token.';

// The JWT travels in the Sec-WebSocket-Protocol header (not the URL, which ends up in logs).
// We only ever echo back the benign protocol name, never the token.
const wss = new WebSocketServer({
  server,
  maxPayload: 16 * 1024 * 1024,
  handleProtocols: (protocols) => (protocols.has(WS_PROTOCOL) ? WS_PROTOCOL : false),
});

const extractToken = (header: string | string[] | undefined): string | null => {
  const raw = Array.isArray(header) ? header.join(',') : header || '';
  const entry = raw
    .split(',')
    .map((p) => p.trim())
    .find((p) => p.startsWith(WS_TOKEN_PREFIX));
  return entry ? entry.slice(WS_TOKEN_PREFIX.length) : null;
};

wss.on('connection', async (ws: WebSocket, req) => {
  // Messages sent by the client while we authenticate/load would otherwise be dropped, which
  // breaks the initial Yjs sync. Buffer them and replay once the real handlers are attached.
  const pending: Array<[unknown, boolean]> = [];
  const buffer = (data: unknown, isBinary: boolean) => pending.push([data, isBinary]);
  ws.on('message', buffer);

  try {
    const reqUrl = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const docName = reqUrl.pathname.split('/').filter(Boolean).pop();
    const token = extractToken(req.headers['sec-websocket-protocol']);

    if (!docName || !token) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    let userId: string;
    try {
      userId = (jwt.verify(token, env.jwtSecret) as { id: string }).id;
    } catch {
      ws.close(4001, 'Unauthorized: Invalid token');
      return;
    }

    if (!mongoose.isValidObjectId(docName)) {
      ws.close(4004, 'Document not found');
      return;
    }
    const document = await Document.findById(docName).select('ownerId collaborators');
    const role = document ? getRole(document, userId) : null;
    if (!document || !role) {
      // Same response for "missing" and "forbidden" so document ids can't be probed.
      ws.close(4004, 'Document not found');
      return;
    }

    let connected = false;
    for (let attempt = 0; attempt < 3 && !connected && ws.readyState === WebSocket.OPEN; attempt++) {
      await loadDocument(docName);
      connected = handleConnection(ws, req, docName, userId, role);
    }
    if (!connected) {
      if (ws.readyState === WebSocket.OPEN) ws.close(1011, 'Internal Server Error');
      return;
    }

    ws.off('message', buffer);
    for (const [data, isBinary] of pending) ws.emit('message', data, isBinary);
  } catch (error) {
    logger.error('WebSocket connection error:', error);
    ws.close(1011, 'Internal Server Error');
  }
});

const startServer = async () => {
  try {
    await connectDB();
    await connectRedis(); // never throws; degrades to no cache
    server.listen(env.port, () => {
      logger.info(`Server running on port ${env.port}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

const shutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down`);
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();
  try {
    await flushAll(); // flush pending debounced saves before closing
    wss.clients.forEach((c) => c.close(1001, 'Server shutting down'));
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectRedis();
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', error);
    process.exit(1);
  }
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => logger.error('Unhandled rejection', reason));

void startServer();
