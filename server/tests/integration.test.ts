/**
 * End-to-end tests: boots the real server against a throwaway in-memory MongoDB and drives it
 * over HTTP and WebSocket exactly like the browser does.
 *
 * Run with `npm run test:integration`. Set TEST_MONGO_URI to use an existing MongoDB instead of
 * downloading one.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { MongoMemoryServer } from 'mongodb-memory-server';
// y-websocket v3 is what the browser client uses (the server itself runs the legacy v1 utils).
// @ts-ignore - aliased package without bundled types for this subpath
import { WebsocketProvider } from 'y-websocket-client';

const SERVER_DIR = path.resolve(__dirname, '..');
const JWT_SECRET = 'integration-test-secret-0123456789';

let mongo: MongoMemoryServer | undefined;
let child: ChildProcess;
let API = '';
let WS = '';
let serverLog = '';
let uploadDir = '';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });

/** Polls until `fn` is truthy (or times out), so tests don't depend on fixed sleeps. */
const waitFor = async (fn: () => boolean | Promise<boolean>, ms = 5000, step = 50) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(step);
  }
  return false;
};

interface Res<T = any> {
  status: number;
  data: T;
}

async function http<T = any>(method: string, route: string, body?: unknown, token?: string, form?: FormData): Promise<Res<T>> {
  const res = await fetch(API + route, {
    method,
    headers: {
      ...(body !== undefined && !form ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  return { status: res.status, data };
}

interface Client {
  doc: Y.Doc;
  provider: any;
  text: Y.Text;
  closeCodes: number[];
}

function connect(docId: string, token: string): Client {
  const doc = new Y.Doc();
  const provider = new WebsocketProvider(WS, docId, doc, {
    WebSocketPolyfill: WebSocket as any,
    protocols: ['collab-v1', `token.${token}`],
    disableBc: true,
    resyncInterval: -1,
  });
  const closeCodes: number[] = [];
  provider.on('connection-close', (e: { code: number } | null) => {
    if (e) closeCodes.push(e.code);
  });
  return { doc, provider, text: doc.getText('t'), closeCodes };
}

/** Destroys the provider AND the doc: Yjs awareness keeps a timer alive until the doc is destroyed. */
const close = (c: Client) => {
  c.provider.destroy();
  c.doc.destroy();
};

const synced = (c: Client) => waitFor(() => c.provider.synced, 5000);

before(async () => {
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    mongo = await MongoMemoryServer.create();
    uri = mongo.getUri('integration');
  }
  uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'collab-test-uploads-'));
  const port = await freePort();
  API = `http://127.0.0.1:${port}/api`;
  WS = `ws://127.0.0.1:${port}`;

  child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: SERVER_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      MONGO_URI: uri,
      PORT: String(port),
      JWT_SECRET,
      CORS_ORIGINS: 'http://localhost:3000',
      REDIS_ENABLED: 'false',
      UPLOAD_DIR: uploadDir,
    },
  });
  child.stdout?.on('data', (d) => (serverLog += d));
  child.stderr?.on('data', (d) => (serverLog += d));

  const up = await waitFor(async () => {
    try {
      return (await fetch(`${API}/health`)).ok;
    } catch {
      return false;
    }
  }, 30000, 250);
  assert.ok(up, `server did not start:\n${serverLog}`);
});

after(async () => {
  if (child && child.exitCode === null) {
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    child.kill();
    await Promise.race([exited, sleep(5000)]);
  }
  // Release the stdio pipes, otherwise they keep the test runner process alive.
  child?.stdout?.destroy();
  child?.stderr?.destroy();
  await mongo?.stop();
  if (uploadDir) fs.rmSync(uploadDir, { recursive: true, force: true });
});

// ---- shared state, filled in by the ordered tests below
const stamp = Date.now();
const users: Record<'A' | 'B' | 'C' | 'D', { email: string; password: string; token: string; id: string }> = {
  A: { email: `a${stamp}@x.com`, password: 'password123', token: '', id: '' },
  B: { email: `b${stamp}@x.com`, password: 'password123', token: '', id: '' },
  C: { email: `c${stamp}@x.com`, password: 'password123', token: '', id: '' },
  D: { email: `d${stamp}@x.com`, password: 'password123', token: '', id: '' },
};
let docId = '';

/** Editor-style paragraph (Tiptap stores content in the 'default' XmlFragment). */
const paragraph = (text: string) => {
  const p = new Y.XmlElement('p');
  p.insert(0, [new Y.XmlText(text)]);
  return p;
};

test('auth: validation rejects bad input', async () => {
  assert.equal((await http('POST', '/auth/register', { email: users.A.email, password: 'abc' })).status, 400, 'short password');
  assert.equal((await http('POST', '/auth/register', { email: 'nope', password: 'password123' })).status, 400, 'bad email');
  assert.equal((await http('POST', '/auth/register', { email: { $ne: '' }, password: 'password123' })).status, 400, 'object email');
});

test('auth: register, login and injection attempts', async () => {
  for (const key of ['A', 'B', 'C', 'D'] as const) {
    const r = await http('POST', '/auth/register', users[key]);
    assert.equal(r.status, 201);
    users[key].token = r.data.token;
    users[key].id = r.data._id;
  }
  assert.equal((await http('POST', '/auth/register', { ...users.A, email: users.A.email.toUpperCase() })).status, 400, 'case-insensitive duplicate');
  assert.equal((await http('POST', '/auth/login', users.A)).status, 200);
  assert.equal((await http('POST', '/auth/login', { email: '.*', password: 'password123' })).status, 401, 'regex wildcard');
  assert.equal((await http('POST', '/auth/login', { email: users.A.email, password: { $ne: 1 } })).status, 401, 'object password');
  assert.equal((await http('POST', '/auth/login', { email: users.A.email, password: 'wrongwrong' })).status, 401);
});

test('documents: create and no-access responses', async () => {
  const d = await http('POST', '/documents', { title: 'Doc 1' }, users.A.token);
  assert.equal(d.status, 201);
  docId = d.data._id;
  assert.equal((await http('POST', '/documents', { title: 'x'.repeat(300) }, users.A.token)).status, 400, 'title too long');
  assert.equal((await http('GET', `/documents/${docId}`, undefined, users.B.token)).status, 404, 'stranger gets 404, not 403');
  assert.equal((await http('GET', `/documents/${docId}/comments`, undefined, users.B.token)).status, 404, 'stranger cannot read comments');
  assert.equal((await http('POST', `/documents/${docId}/comments`, { content: 'hi', anchorFrom: 1, anchorTo: 2 }, users.B.token)).status, 404);
  assert.equal((await http('GET', '/documents/not-an-id', undefined, users.A.token)).status, 404, 'malformed id is 404, not 500');
});

test('sharing: roles, validation and notifications', async () => {
  const share = (email: string, role: string) => http('POST', `/documents/${docId}/share`, { email, role }, users.A.token);
  assert.equal((await share(users.B.email, 'admin')).status, 400, 'invalid role');
  assert.equal((await share('.*@x.com', 'viewer')).status, 404, 'regex email must not match real users');

  const b = await share(users.B.email.toUpperCase(), 'viewer');
  assert.equal(b.status, 200);
  assert.equal(b.data.newCollaborator.email, users.B.email);
  assert.equal((await share(users.C.email, 'editor')).status, 200);

  const notifications = await http('GET', '/notifications', undefined, users.B.token);
  assert.ok(notifications.data.some((n: any) => n.type === 'share'), 'share notification created');

  const asViewer = await http('GET', `/documents/${docId}`, undefined, users.B.token);
  assert.equal(asViewer.data.role, 'viewer');
  assert.equal(asViewer.data.collaborators.length, 2);
  assert.ok(asViewer.data.collaborators.every((c: any) => c.email.includes('@')), 'collaborator emails resolved');

  assert.equal((await http('PUT', `/documents/${docId}`, { title: 'hax' }, users.B.token)).status, 403, 'viewer cannot rename');
  assert.equal((await http('PUT', `/documents/${docId}`, { title: 'Renamed' }, users.C.token)).status, 200, 'editor can rename');
  assert.equal((await http('POST', `/documents/${docId}/share`, { email: users.A.email, role: 'viewer' }, users.C.token)).status, 403, 'editor cannot share');
  assert.equal((await http('DELETE', `/documents/${docId}`, undefined, users.B.token)).status, 403, 'viewer cannot delete');

  const list = await http('GET', '/documents', undefined, users.B.token);
  assert.equal(list.data[0].role, 'viewer');
  assert.ok(!('documentState' in list.data[0]) && !('plainText' in list.data[0]), 'list omits heavy fields');
  assert.ok(list.data[0].collaborators.every((c: any) => c.email), 'list includes collaborator emails');
});

test('comments: access, validation, mentions and resolve', async () => {
  const c = await http('POST', `/documents/${docId}/comments`, { _id: 'cmt-1', content: 'hello', anchorFrom: 1, anchorTo: 5, mentions: [users.B.id, users.C.id, 'bogus', users.C.id] }, users.B.token);
  assert.equal(c.status, 201, 'viewers may comment');
  assert.equal(c.data.mentions.length, 1, 'self, duplicates and non-members are filtered from mentions');

  assert.notEqual((await http('POST', `/documents/${docId}/comments`, { _id: 'cmt-1', content: 'x', anchorFrom: 1, anchorTo: 2 }, users.B.token)).status, 201, 'duplicate id');
  assert.equal((await http('POST', `/documents/${docId}/comments`, { content: '  ', anchorFrom: 1, anchorTo: 2 }, users.B.token)).status, 400, 'blank comment');

  const read = await http('GET', `/documents/${docId}/comments`, undefined, users.C.token);
  assert.equal(read.status, 200);
  assert.equal(read.data.length, 1);

  assert.equal((await http('PATCH', '/comments/cmt-1/resolve', undefined, users.D.token)).status, 404, 'non-member cannot resolve');
  assert.equal((await http('PATCH', '/comments/cmt-1/resolve', undefined, users.B.token)).status, 200, 'author can resolve');
});

test('folders and tags: ownership and validation', async () => {
  assert.equal((await http('POST', '/folders', { name: '   ' }, users.A.token)).status, 400);
  const mine = await http('POST', '/folders', { name: 'F1' }, users.A.token);
  assert.equal(mine.status, 201);
  const theirs = await http('POST', '/folders', { name: 'FB' }, users.B.token);

  assert.equal((await http('PUT', `/documents/${docId}/move`, { folderId: mine.data._id }, users.A.token)).status, 200);
  assert.equal((await http('PUT', `/documents/${docId}/move`, { folderId: theirs.data._id }, users.A.token)).status, 400, "cannot move into someone else's folder");

  assert.equal((await http('PUT', `/documents/${docId}/tags`, { tags: [1, 2] }, users.A.token)).status, 400);
  const tags = await http('PUT', `/documents/${docId}/tags`, { tags: ['a', 'a', ' b '] }, users.A.token);
  assert.deepEqual(tags.data.tags, ['a', 'b'], 'tags are trimmed and de-duplicated');
});

test('uploads: only authenticated raster images', async () => {
  const form = (name: string, type: string, bytes: BlobPart) => {
    const f = new FormData();
    f.append('image', new Blob([bytes], { type }), name);
    return f;
  };
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

  assert.equal((await http('POST', '/upload', undefined, users.A.token, form('x.html', 'text/html', '<script>alert(1)</script>'))).status, 400, 'html rejected');
  assert.equal((await http('POST', '/upload', undefined, users.A.token, form('x.svg', 'image/svg+xml', '<svg/>'))).status, 400, 'svg rejected');
  assert.equal((await http('POST', '/upload', undefined, undefined, form('a.png', 'image/png', png))).status, 401, 'auth required');

  const ok = await http('POST', '/upload', undefined, users.A.token, form('a.png', 'image/png', png));
  assert.equal(ok.status, 200);
  assert.match(ok.data.url, /\/uploads\/.+\.png$/);
  const img = await fetch(ok.data.url);
  assert.equal(img.status, 200, 'uploaded file is actually served');
  assert.equal(img.headers.get('content-type'), 'image/png');
});

test('websocket: rejects missing token and non-members', async () => {
  const anon = new WebSocket(`${WS}/${docId}`, ['collab-v1']);
  const code = await new Promise<number | string>((resolve) => {
    anon.on('close', (c) => resolve(c));
    anon.on('error', () => {});
    setTimeout(() => resolve('timeout'), 4000);
  });
  assert.equal(code, 4001);

  const stranger = connect(docId, users.D.token);
  assert.ok(await waitFor(() => stranger.closeCodes.includes(4004), 4000), 'non-member closed with 4004');
  assert.equal(stranger.provider.synced, false);
  close(stranger);
});

test('websocket: roles, viewer writes dropped, single save, persistence, revocation', async () => {
  const owner = connect(docId, users.A.token);
  const viewer = connect(docId, users.B.token);
  const editor = connect(docId, users.C.token);
  assert.ok(await synced(owner) && (await synced(viewer)) && (await synced(editor)), 'all clients sync');

  owner.text.insert(0, 'hello');
  assert.ok(await waitFor(() => viewer.text.toString() === 'hello' && editor.text.toString() === 'hello'), 'edits reach everyone');

  viewer.text.insert(5, ' HACKED');
  await sleep(800);
  assert.equal(owner.text.toString(), 'hello', 'viewer write must not reach other clients');
  assert.equal(editor.text.toString(), 'hello');

  editor.text.insert(5, ' world');
  assert.ok(await waitFor(() => owner.text.toString() === 'hello world'), 'editor writes propagate');

  // One debounced save for a burst of edits, no matter how many clients are connected.
  const savesBefore = (serverLog.match(/Saved doc/g) || []).length;
  owner.text.insert(0, '1');
  await sleep(200);
  owner.text.insert(0, '2');
  await waitFor(() => (serverLog.match(/Saved doc/g) || []).length > savesBefore, 6000);
  await sleep(500);
  assert.equal((serverLog.match(/Saved doc/g) || []).length - savesBefore, 1, 'exactly one save per burst (no listener leak)');

  // Snapshots and permissions on them. Editor content lives in the 'default' XmlFragment.
  owner.doc.getXmlFragment('default').insert(0, [paragraph('snapshot-content')]);
  await sleep(500);
  assert.equal((await http('POST', `/documents/${docId}/versions/snapshot`, { label: 'v1' }, users.C.token)).status, 201, 'editor can snapshot');
  assert.equal((await http('POST', `/documents/${docId}/versions/snapshot`, { label: 'v' }, users.B.token)).status, 403, 'viewer cannot snapshot');
  const versions = await http('GET', `/documents/${docId}/versions`, undefined, users.B.token);
  assert.ok(versions.status === 200 && versions.data.length >= 1, 'viewer can list versions');
  owner.doc.getXmlFragment('default').insert(1, [paragraph('added-after-snapshot')]);
  await sleep(300);

  // Promotion: the live socket is dropped (4003) and the reconnect gets the new role.
  assert.equal((await http('PUT', `/documents/${docId}/share/${users.B.id}`, { role: 'editor' }, users.A.token)).status, 200);
  assert.ok(await waitFor(() => viewer.closeCodes.includes(4003), 4000), 'role change disconnects the session');
  assert.ok(await synced(viewer) || (await waitFor(() => viewer.provider.synced, 10000)), 'client reconnects');
  viewer.text.insert(0, 'B');
  assert.ok(await waitFor(() => owner.text.toString().startsWith('B'), 5000), 'promoted user can now write');

  // Removal: kicked, and cannot come back.
  assert.equal((await http('DELETE', `/documents/${docId}/share/${users.C.id}`, undefined, users.A.token)).status, 200);
  assert.ok(await waitFor(() => editor.closeCodes.includes(4003), 4000), 'removed collaborator is disconnected');
  assert.ok(await waitFor(() => editor.closeCodes.includes(4004), 10000), 'removed collaborator is refused on reconnect');

  // Persistence: everything survives all clients leaving.
  const finalText = owner.text.toString();
  assert.ok(finalText.length > 0);
  for (const c of [owner, viewer, editor]) close(c);
  await sleep(1500);
  const again = connect(docId, users.A.token);
  assert.ok(await synced(again));
  assert.ok(await waitFor(() => again.text.toString() === finalText), 'state reloaded from MongoDB');
  close(again);
});

test('versions: restore needs owner and keeps a backup', async () => {
  const list = await http('GET', `/documents/${docId}/versions`, undefined, users.A.token);
  const target = list.data.find((v: any) => v.label === 'v1');
  assert.ok(target, 'labelled snapshot exists');

  assert.equal((await http('POST', `/documents/${docId}/versions/${target._id}/restore`, undefined, users.B.token)).status, 403, 'only the owner can restore');
  assert.equal((await http('POST', `/documents/${docId}/versions/${target._id}/restore`, undefined, users.A.token)).status, 200);

  const after = await http('GET', `/documents/${docId}/versions`, undefined, users.A.token);
  assert.ok(after.data.some((v: any) => v.label === 'Auto-backup before restore'), 'automatic backup created before restore');

  const restored = connect(docId, users.A.token);
  assert.ok(await synced(restored));
  const html = () => restored.doc.getXmlFragment('default').toJSON();
  assert.ok(await waitFor(() => html().includes('snapshot-content')), 'snapshot content is back');
  assert.ok(!html().includes('added-after-snapshot'), 'later edits are rolled back');
  close(restored);
});

test('delete: cascades and blocks further access', async () => {
  assert.equal((await http('DELETE', `/documents/${docId}`, undefined, users.A.token)).status, 200);
  assert.equal((await http('GET', `/documents/${docId}/comments`, undefined, users.A.token)).status, 404, 'comments gone with the document');
  assert.equal((await http('GET', `/documents/${docId}/versions`, undefined, users.A.token)).status, 404);

  const late = connect(docId, users.A.token);
  assert.ok(await waitFor(() => late.closeCodes.includes(4004), 4000), 'websocket to deleted document is refused');
  close(late);
});

test('platform: 404s, security headers, health, rate limiting', async () => {
  assert.equal((await http('GET', '/nope', undefined, users.A.token)).status, 404);
  const health = await fetch(`${API}/health`);
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff', 'helmet headers present');

  let limited = false;
  for (let i = 0; i < 30 && !limited; i++) {
    limited = (await http('POST', '/auth/login', { email: 'nobody@x.com', password: 'whatever12' })).status === 429;
  }
  assert.ok(limited, 'login attempts are rate limited');
});
