# Future Work: Yjs Horizontal Scalability

This document outlines the limitations of our current real-time collaboration architecture and details the path forward to support horizontal scaling (running multiple concurrent Node.js instances).

## The Current In-Memory Limitation
Currently, the `y-websocket` layer stores active `Y.Doc` instances in memory on the Node.js server (`server/src/socket/yjsSetup.ts`). When a client connects and makes edits, the changes are tracked in that single process's memory space and occasionally persisted to MongoDB/Redis.

**The Problem:**
If we deploy the backend across multiple instances (e.g., behind a load balancer), Client A might connect to Instance 1, and Client B might connect to Instance 2. 
- Instance 1 and Instance 2 have completely isolated in-memory `Y.Doc` states.
- Edits made by Client A are broadcast *only* to other WebSocket clients connected to Instance 1.
- Client B will never see Client A's live edits, breaking real-time collaboration.

## The Solution: Redis Pub/Sub Adapter

To fix this, we must decouple the real-time message routing from the local instance memory using a **Redis Pub/Sub** layer. 

### Architecture
1. **Dedicated Clients:** We instantiate duplicate Redis clients specifically for pub/sub (e.g., `pubClient` and `subClient`) utilizing our existing `redis.ts` connection patterns.
2. **Subscription:** When a document is loaded in memory on any instance, the instance subscribes to a Redis channel unique to that document (e.g., `yjs-updates:${docName}`).
3. **Broadcasting Incremental Updates:** When a local WebSocket client sends an edit, `ydoc.on('update', (update, origin) => ...)` fires. We take this *incremental* `update` payload (a small binary buffer representing just the diff, not the full document state) and publish it to the Redis channel. Publishing the full state on every keystroke would overwhelm the network; full-state encoding is reserved solely for persistence caching.
4. **Applying Remote Updates:** Other instances receive the incremental update via the Redis subscription and apply it to their local in-memory `Y.Doc` using `Y.applyUpdate(ydoc, update, 'redis-pubsub')`.
5. **Echo Cancellation:** By tagging the applied update with the origin `'redis-pubsub'`, we can prevent the `ydoc.on('update')` listener from re-broadcasting the same update back to Redis, avoiding an infinite loop.
6. **Cleanup:** Once the last WebSocket client disconnects from a document on a given instance, the instance must unsubscribe from the channel and clean up its tracking maps to prevent unbounded memory growth.

### Known Edge Case: The Startup Race Condition
In a highly concurrent system, a race condition exists during the initial document load. If two instances load a brand-new document simultaneously, there is a narrow window where local updates might occur *before* the Redis subscription is fully established and confirmed by the broker. During this fraction of a second, an update might not broadcast to the other instance. For the scope of this project, this edge case is acknowledged and accepted, as CRDTs (like Yjs) will eventually guarantee consistency once the next successful sync cycle or full state load occurs.

## Alternative: Hocuspocus
While a custom Redis Pub/Sub adapter is lightweight, migrating the collaboration layer to **Hocuspocus** (the official, modern backend framework for Tiptap/Yjs) is a strong alternative. Hocuspocus provides robust Redis horizontal scaling out of the box, natively handling edge cases, connection pooling, and webhooks for persistence, effectively eliminating the need to write manual pub/sub sync logic.
