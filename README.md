# Collaborative Workspace

Real-time collaborative document editor: Next.js + Tiptap/Yjs client, Express + WebSocket + MongoDB server.

## Setup

```bash
# server
cd server
cp .env.example .env        # fill in MONGO_URI and a long random JWT_SECRET (16+ chars)
npm install
npm run dev                 # http://localhost:5000

# client (new terminal)
cd client
cp .env.example .env.local  # NEXT_PUBLIC_API_URL must point at the server
npm install
npm run dev                 # http://localhost:3000
```

If the client runs on a different origin than `http://localhost:3000`, add it to `CORS_ORIGINS` in `server/.env`.

## Configuration

| Variable | Where | Purpose |
| --- | --- | --- |
| `MONGO_URI` | server | MongoDB connection string |
| `JWT_SECRET` | server | **Required**, 16+ chars. The server refuses to start without it |
| `JWT_EXPIRES_IN` | server | Token lifetime (default `7d`) |
| `CORS_ORIGINS` | server | Comma-separated allowed browser origins |
| `PUBLIC_URL` | server | Optional public API URL used for upload links |
| `REDIS_ENABLED`, `REDIS_URL` | server | Optional document cache (off by default) |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL` | client | API / WebSocket base URLs |

## Scripts

- `server`: `npm run typecheck`, `npm test`, `npm run build`
- `client`: `npm run lint`, `npm run build`

## Testing

```bash
cd server
npm test                  # unit tests + end-to-end integration tests
npm run test:integration  # just the integration suite
```

The integration suite boots the real server and drives it over HTTP and WebSocket: authorization,
validation, uploads, viewer writes being dropped, role-change disconnects, persistence, version
restore and cascade delete. It starts a throwaway in-memory MongoDB (downloaded on first run). To use
an existing MongoDB instead, set `TEST_MONGO_URI`.

## Docker

```bash
cp .env.example .env      # set JWT_SECRET
docker compose up --build
```

Client on http://localhost:3000, API on http://localhost:5000, MongoDB and uploads persisted in
named volumes. `NEXT_PUBLIC_*` values are baked into the client at build time, so rebuild the client
image if you change them (`args` in `docker-compose.yml`). The client build downloads Google Fonts,
so it needs internet access.

## Continuous integration

GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request and push to `main`:
server type-check, unit and integration tests, client lint, type-check and production build, and a
high-severity `npm audit` for production dependencies. Dependabot opens weekly update PRs.

## Notes

- Document access is enforced per role (owner / editor / viewer) on both the REST API and the WebSocket. Viewers can read and see cursors but their edits are dropped by the server.
- The WebSocket JWT is sent in the `Sec-WebSocket-Protocol` header, not the URL.
- Uploads are stored on local disk (`server/uploads`, images only). Use S3/Cloudinary for production.
- Scaling to multiple server instances: see `server/docs/scaling.md`.
