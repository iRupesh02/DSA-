import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const usersDir = path.join(root, 'users');
const PORT = Number(process.env.PORT) || 8787;
const ID_RE = /^[0-9]{8,15}_[A-Za-z0-9_-]{1,40}$/;

function ensureUsersDir() {
  fs.mkdirSync(usersDir, { recursive: true });
}

ensureUsersDir();

function userPath(id) {
  if (!ID_RE.test(id)) return null;
  return path.join(usersDir, id + '.json');
}

function readUser(id) {
  const file = userPath(id);
  if (!file || !fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeUser(rec) {
  const file = userPath(rec.id);
  if (!file) throw new Error('Invalid account id');
  ensureUsersDir();
  fs.writeFileSync(file, JSON.stringify(rec, null, 2));
}

function publicUser(rec) {
  return {
    id: rec.id,
    mobile: rec.mobile,
    name: rec.name,
    updatedAt: rec.updatedAt || null,
  };
}

function send(res, code, body) {
  const json = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-token',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, x-token',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    });
    res.end();
    return;
  }

  const url = new URL(req.url, 'http://127.0.0.1');

  try {
    if (url.pathname === '/api/users' && req.method === 'GET') {
      ensureUsersDir();
      const users = fs.readdirSync(usersDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => {
          try { return publicUser(JSON.parse(fs.readFileSync(path.join(usersDir, f), 'utf8'))); }
          catch (e) { return null; }
        })
        .filter(Boolean);
      send(res, 200, { users });
      return;
    }

    if (url.pathname === '/api/register' && req.method === 'POST') {
      const body = await readBody(req);
      if (!userPath(body.id) || !body.passwordHash || !body.token) {
        send(res, 400, { error: 'Mobile, name, and password are required.' });
        return;
      }
      if (readUser(body.id)) {
        send(res, 409, { error: 'An account with that mobile and name already exists.' });
        return;
      }
      const rec = {
        id: body.id,
        mobile: String(body.mobile || ''),
        name: String(body.name || ''),
        passwordHash: body.passwordHash,
        token: body.token,
        updatedAt: new Date().toISOString(),
        progress: body.progress || {},
      };
      writeUser(rec);
      send(res, 201, { ...publicUser(rec), token: rec.token, progress: rec.progress });
      return;
    }

    if (url.pathname === '/api/login' && req.method === 'POST') {
      const body = await readBody(req);
      const rec = readUser(body.id);
      if (!rec || rec.passwordHash !== body.passwordHash) {
        send(res, 401, { error: 'Mobile, name, or password does not match a saved account.' });
        return;
      }
      rec.token = body.token || rec.token;
      rec.updatedAt = rec.updatedAt || new Date().toISOString();
      writeUser(rec);
      send(res, 200, { ...publicUser(rec), token: rec.token, progress: rec.progress || {} });
      return;
    }

    const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
    if (userMatch) {
      const id = decodeURIComponent(userMatch[1]);
      const rec = readUser(id);
      if (!rec) {
        send(res, 404, { error: 'No saved account with that name.' });
        return;
      }
      if (req.headers['x-token'] !== rec.token) {
        send(res, 401, { error: 'Sign in again to update this account.' });
        return;
      }
      if (req.method === 'GET') {
        send(res, 200, { ...publicUser(rec), progress: rec.progress || {} });
        return;
      }
      if (req.method === 'PUT') {
        const body = await readBody(req);
        const nextProgress = body.progress && typeof body.progress === 'object' ? body.progress : rec.progress;
        if (JSON.stringify(nextProgress) === JSON.stringify(rec.progress || {})) {
          send(res, 200, { ok: true, id: rec.id, unchanged: true });
          return;
        }
        rec.progress = nextProgress;
        rec.updatedAt = body.updatedAt || new Date().toISOString();
        writeUser(rec);
        send(res, 200, { ok: true, id: rec.id, updatedAt: rec.updatedAt });
        return;
      }
    }

    if (req.method === 'GET') {
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/') rel = '/index.html';
      if (rel.includes('..') || rel.startsWith('/users')) {
        send(res, 404, { error: 'Not found' });
        return;
      }
      const file = path.join(root, rel);
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        send(res, 404, { error: 'Not found' });
        return;
      }
      const ext = path.extname(file);
      res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
      return;
    }

    send(res, 404, { error: 'Not found' });
  } catch (err) {
    send(res, 500, { error: err.message || 'Server error' });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('DSA tracker http://127.0.0.1:' + PORT);
  console.log('Accounts save to ' + usersDir);
});
