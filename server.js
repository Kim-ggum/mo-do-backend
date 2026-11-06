'use strict';
// MoA (Memory of All) 서버: 외부 패키지 없이 Node.js 22.13 이상에서 실행합니다.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const FILE_DIR = path.join(DATA_DIR, 'files');
// AI 요약: Claude API
const AI = { key: process.env.ANTHROPIC_API_KEY || '', base: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com', model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5' };
const AI_KEY = AI.key;
const DAY = 864e5;

fs.mkdirSync(FILE_DIR, { recursive: true });
// DB 파일: moa.db. 예전 이름(hakgirok.db)만 있으면 데이터를 그대로 옮겨 씁니다
const DB_FILE = path.join(DATA_DIR, 'moa.db'), OLD_DB_FILE = path.join(DATA_DIR, 'hakgirok.db');
if (!fs.existsSync(DB_FILE) && fs.existsSync(OLD_DB_FILE))
  for (const ext of ['', '-wal', '-shm']) if (fs.existsSync(OLD_DB_FILE + ext)) fs.renameSync(OLD_DB_FILE + ext, DB_FILE + ext);
const db = new DatabaseSync(DB_FILE);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, pw_salt TEXT NOT NULL, pw_hash TEXT NOT NULL, entry INTEGER NOT NULL, created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS cals (id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), vis TEXT NOT NULL, invite TEXT UNIQUE, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS members (cal_id TEXT NOT NULL REFERENCES cals(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY (cal_id, user_id));
  CREATE TABLE IF NOT EXISTS moments (id TEXT PRIMARY KEY, cal_id TEXT NOT NULL REFERENCES cals(id) ON DELETE CASCADE, date TEXT NOT NULL, by_user TEXT NOT NULL REFERENCES users(id), secret INTEGER NOT NULL DEFAULT 0, asset TEXT, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS days (id TEXT PRIMARY KEY, cal_id TEXT NOT NULL REFERENCES cals(id) ON DELETE CASCADE, date TEXT NOT NULL, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS all_covers (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, date TEXT NOT NULL, moment_id TEXT NOT NULL, PRIMARY KEY (user_id, date));
  CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), mime TEXT NOT NULL, created INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS moments_cal ON moments(cal_id);
  CREATE INDEX IF NOT EXISTS days_cal ON days(cal_id);
  CREATE TABLE IF NOT EXISTS join_requests (cal_id TEXT NOT NULL REFERENCES cals(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created INTEGER NOT NULL, PRIMARY KEY (cal_id, user_id));
`);
const q = sql => db.prepare(sql);
// 기존 DB에 운영진 컬럼이 없으면 추가합니다
if (!db.prepare('PRAGMA table_info(members)').all().some(c => c.name === 'admin')) db.exec('ALTER TABLE members ADD COLUMN admin INTEGER NOT NULL DEFAULT 0');

/* ---------- 공통 ---------- */
class Fail extends Error { constructor(status, message) { super(message); this.status = status; } }
const scrypt = promisify(crypto.scrypt);
const newId = () => crypto.randomBytes(12).toString('hex');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const isId = s => typeof s === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(s);
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const str = (v, max) => String(v ?? '').slice(0, max);
const VIS = ['private', 'members', 'public'];
const COLORS = ['blue', 'teal', 'green', 'amber', 'orange', 'rose', 'violet', 'slate'];
const KINDS = ['photo', 'video', 'text'];
const MIMES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
const STATIC_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
// public/assets 폴더(로고 등)에서 내보낼 수 있는 파일 종류
const ASSET_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const ASSET_DIR = path.join(PUBLIC_DIR, 'assets');
const inviteCode = () => Array.from(crypto.randomBytes(6), n => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n % 32]).join('');

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body));
}
function readBody(req, limit) {
  return new Promise((ok, no) => {
    const parts = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > limit) { no(new Fail(413, '파일이나 내용이 너무 커요.')); req.destroy(); } else parts.push(c); });
    req.on('end', () => ok(Buffer.concat(parts)));
    req.on('error', no);
  });
}
async function json(req, limit = 1e6) {
  try { return JSON.parse((await readBody(req, limit)).toString('utf8') || '{}'); }
  catch (e) { throw e instanceof Fail ? e : new Fail(400, '요청 형식이 올바르지 않아요.'); }
}
const hits = new Map();
function limit(key, max, ms) {
  const now = Date.now(), list = (hits.get(key) || []).filter(t => now - t < ms);
  if (list.length >= max) throw new Fail(429, '요청이 많아요. 잠시 뒤 다시 시도해 주세요.');
  list.push(now); hits.set(key, list);
}

/* ---------- 계정 ---------- */
const clientIp = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',')[0].trim();
async function hashPw(pw, salt) { return (await scrypt(pw, salt, 32)).toString('hex'); }
function cookieOf(req) { const m = /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(req.headers.cookie || ''); return m ? m[1] : null; }
function currentUser(req) {
  const t = cookieOf(req); if (!t) return null;
  const row = q(`SELECT u.id, u.email, u.name, u.entry FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires > ?`).get(sha(t), Date.now());
  return row || null;
}
function startSession(req, res, userId, remember) {
  const token = crypto.randomBytes(32).toString('hex'), life = remember ? 30 * DAY : DAY;
  q('INSERT INTO sessions VALUES (?, ?, ?)').run(sha(token), userId, Date.now() + life);
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/${remember ? `; Max-Age=${30 * 86400}` : ''}${secure}`);
}
const need = u => { if (!u) throw new Fail(401, '로그인이 필요해요.'); return u; };

/* ---------- 권한 ---------- */
const getCal = id => q('SELECT * FROM cals WHERE id = ?').get(id);
// 역할: owner(만든 사람) > admin(운영진) > member(멤버)
function roleOf(cal, uid) {
  if (!uid) return null;
  if (cal.owner === uid) return 'owner';
  const m = q('SELECT admin FROM members WHERE cal_id = ? AND user_id = ?').get(cal.id, uid);
  return m ? (m.admin ? 'admin' : 'member') : null;
}
const isOrg = cal => !!JSON.parse(cal.data).org;
const isManager = (cal, uid) => ['owner', 'admin'].includes(roleOf(cal, uid));
// 단체 캘린더는 만든 사람과 운영진만 기록하고 초대할 수 있고, 일반 멤버는 보기만 합니다
const canPost = (cal, uid) => isOrg(cal) ? isManager(cal, uid) : !!roleOf(cal, uid);
const canInvite = canPost;
const canSee = (cal, uid) => cal.vis === 'public' || !!roleOf(cal, uid);
const adminsOf = calId => q('SELECT user_id FROM members WHERE cal_id = ? AND admin = 1').all(calId).map(r => r.user_id);
function calOut(cal, uid) {
  const role = roleOf(cal, uid), d = JSON.parse(cal.data);
  return { ...d, id: cal.id, vis: cal.vis, by: cal.owner, role, canPost: canPost(cal, uid), canInvite: canInvite(cal, uid),
    invite: canInvite(cal, uid) ? cal.invite : undefined,
    members: role ? q('SELECT user_id FROM members WHERE cal_id = ?').all(cal.id).map(r => r.user_id) : [],
    admins: role ? adminsOf(cal.id) : [],
    // 초대 코드로 들어온 참여 요청은 캘린더 주인만 보고 수락합니다
    requests: role === 'owner' ? q('SELECT r.user_id AS id, u.name FROM join_requests r JOIN users u ON u.id = r.user_id WHERE r.cal_id = ? ORDER BY r.created').all(cal.id) : [] };
}
function momentOut(m) {
  const d = JSON.parse(m.data);
  return { ...d, id: m.id, calId: m.cal_id, date: m.date, by: m.by_user, secret: !!m.secret, assetId: m.asset || undefined, url: m.asset ? `/files/${m.asset}` : undefined };
}
const dayOut = d => ({ ...JSON.parse(d.data), id: d.id, calId: d.cal_id, date: d.date });
function dropFileIfUnused(asset) {
  if (!asset || q('SELECT 1 FROM moments WHERE asset = ? LIMIT 1').get(asset)) return;
  q('DELETE FROM files WHERE id = ?').run(asset);
  fs.rm(path.join(FILE_DIR, asset), { force: true }, () => {});
}
function state(uid, onlyCal) {
  let cals;
  if (uid) cals = q(`SELECT DISTINCT c.* FROM cals c LEFT JOIN members m ON m.cal_id = c.id WHERE c.vis = 'public' OR c.owner = ? OR m.user_id = ?`).all(uid, uid);
  else { const c = onlyCal && getCal(onlyCal); cals = c && c.vis === 'public' ? [c] : []; }
  const moments = [], days = [], people = new Set(), out = [];
  for (const c of cals) {
    const co = calOut(c, uid); out.push(co); co.members.forEach(id => people.add(id));
    for (const m of q('SELECT * FROM moments WHERE cal_id = ?').all(c.id)) {
      if (m.secret && m.by_user !== uid) continue;
      moments.push(momentOut(m)); people.add(m.by_user);
    }
    for (const d of q('SELECT * FROM days WHERE cal_id = ?').all(c.id)) days.push(dayOut(d));
  }
  const names = {};
  for (const id of people) { const u = q('SELECT name FROM users WHERE id = ?').get(id); if (u) names[id] = u.name; }
  const allCovers = uid ? q('SELECT date, moment_id FROM all_covers WHERE user_id = ?').all(uid).map(r => ({ id: r.date, date: r.date, momentId: r.moment_id })) : [];
  // 내가 보낸, 아직 수락 대기 중인 참여 요청
  const pending = uid ? q('SELECT c.id, c.data FROM join_requests r JOIN cals c ON c.id = r.cal_id WHERE r.user_id = ?').all(uid).map(r => ({ id: r.id, name: JSON.parse(r.data).name })) : [];
  return { cals: out, moments, days, allCovers, names, pending };
}
function canReadFile(asset, uid) {
  const f = q('SELECT * FROM files WHERE id = ?').get(asset); if (!f) return null;
  if (f.owner === uid) return f;
  for (const m of q('SELECT * FROM moments WHERE asset = ?').all(asset)) {
    if (m.secret && m.by_user !== uid) continue;
    if (canSee(getCal(m.cal_id), uid)) return f;
  }
  return null;
}

/* ---------- 요청 처리 ---------- */
const routes = [];
const route = (method, pattern, fn) => routes.push({ method, re: new RegExp(`^${pattern.replace(/:\w+/g, '([^/]+)')}$`), fn });

route('POST', '/api/auth/signup', async (req, res) => {
  limit(`signup:${clientIp(req)}`, 10, 60 * 60e3);
  const b = await json(req), name = str(b.name, 40).trim(), email = str(b.email, 200).trim().toLowerCase(), pw = String(b.password || '');
  if (!name) throw new Fail(400, '이름을 입력해 주세요.');
  if (!EMAIL_RE.test(email)) throw new Fail(400, '올바른 이메일을 입력해 주세요.');
  if (!pwOk(pw)) throw new Fail(400, '비밀번호는 8자 이상, 영문과 숫자를 포함해 주세요.');
  if (q('SELECT 1 FROM users WHERE email = ?').get(email)) throw new Fail(409, '이미 가입된 이메일이에요.');
  const salt = crypto.randomBytes(16).toString('hex'), entry = Number(b.entry) || new Date().getFullYear();
  q('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?)').run(newId(), email, name, salt, await hashPw(pw, salt), entry, Date.now());
  send(res, 201, { ok: true });
});
route('POST', '/api/auth/login', async (req, res) => {
  const b = await json(req), email = str(b.email, 200).trim().toLowerCase(), pw = String(b.password || '').slice(0, 200);
  limit(`login:${clientIp(req)}:${email}`, 8, 15 * 60e3);
  const u = q('SELECT * FROM users WHERE email = ?').get(email);
  const given = Buffer.from(await hashPw(pw, u ? u.pw_salt : 'no-such-user'), 'hex');
  if (!u || !crypto.timingSafeEqual(given, Buffer.from(u.pw_hash, 'hex'))) throw new Fail(401, '이메일 또는 비밀번호가 올바르지 않아요.');
  startSession(req, res, u.id, !!b.remember);
  send(res, 200, { ok: true });
});
route('POST', '/api/auth/logout', async (req, res) => {
  const t = cookieOf(req); if (t) q('DELETE FROM sessions WHERE token_hash = ?').run(sha(t));
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  send(res, 200, { ok: true });
});
route('GET', '/api/me', async (req, res, u) => send(res, 200, { user: u, ai: !!AI_KEY }));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const pwOk = pw => pw.length >= 8 && pw.length <= 200 && /[A-Za-z]/.test(pw) && /\d/.test(pw);
route('PATCH', '/api/me', async (req, res, u) => {
  need(u); const b = await json(req), row = q('SELECT * FROM users WHERE id = ?').get(u.id);
  const next = { name: row.name, email: row.email, entry: row.entry, pw_salt: row.pw_salt, pw_hash: row.pw_hash };
  if (b.entry !== undefined) {
    const entry = Number(b.entry);
    if (!Number.isInteger(entry) || entry < 2000 || entry > 2100) throw new Fail(400, '입학 연도를 확인해 주세요.');
    next.entry = entry;
  }
  if (b.name !== undefined) {
    next.name = str(b.name, 40).trim();
    if (!next.name) throw new Fail(400, '이름을 입력해 주세요.');
  }
  const email = b.email === undefined ? row.email : str(b.email, 200).trim().toLowerCase();
  const newPw = String(b.newPassword || '');
  // 이메일이나 비밀번호를 바꿀 때는 현재 비밀번호를 확인합니다
  if (email !== row.email || newPw) {
    limit(`me:${u.id}`, 8, 15 * 60e3);
    const given = Buffer.from(await hashPw(String(b.currentPassword || '').slice(0, 200), row.pw_salt), 'hex');
    if (!crypto.timingSafeEqual(given, Buffer.from(row.pw_hash, 'hex'))) throw new Fail(401, '현재 비밀번호가 올바르지 않아요.');
  }
  if (email !== row.email) {
    if (!EMAIL_RE.test(email)) throw new Fail(400, '올바른 이메일을 입력해 주세요.');
    if (q('SELECT 1 FROM users WHERE email = ? AND id != ?').get(email, u.id)) throw new Fail(409, '이미 가입된 이메일이에요.');
    next.email = email;
  }
  if (newPw) {
    if (!pwOk(newPw)) throw new Fail(400, '비밀번호는 8자 이상, 영문과 숫자를 포함해 주세요.');
    next.pw_salt = crypto.randomBytes(16).toString('hex');
    next.pw_hash = await hashPw(newPw, next.pw_salt);
  }
  q('UPDATE users SET name = ?, email = ?, entry = ?, pw_salt = ?, pw_hash = ? WHERE id = ?').run(next.name, next.email, next.entry, next.pw_salt, next.pw_hash, u.id);
  // 비밀번호를 바꾸면 지금 쓰는 기기 말고는 모두 로그아웃됩니다
  if (newPw) q('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(u.id, sha(cookieOf(req)));
  send(res, 200, { user: { id: u.id, email: next.email, name: next.name, entry: next.entry } });
});
route('GET', '/api/users/search', async (req, res, u, url) => {
  need(u); const s = str(url.searchParams.get('q'), 40).trim(); if (s.length < 2) return send(res, 200, { users: [] });
  const like = `${s.replace(/[%_\\]/g, '\\$&')}%`;
  send(res, 200, { users: q(`SELECT id, name FROM users WHERE (name LIKE ? ESCAPE '\\' OR email = ?) AND id != ? LIMIT 6`).all(like, s.toLowerCase(), u.id) });
});
route('GET', '/api/state', async (req, res, u, url) => send(res, 200, state(u?.id, url.searchParams.get('cal'))));

route('PUT', '/api/cals/:id', async (req, res, u, url, id) => {
  need(u); if (!isId(id)) throw new Fail(400, '잘못된 캘린더예요.');
  const b = await json(req), old = getCal(id);
  if (old && old.owner !== u.id) throw new Fail(403, '캘린더를 만든 사람만 설정을 바꿀 수 있어요.');
  const name = str(b.name, 24).trim(); if (!name) throw new Fail(400, '이름을 입력해 주세요.');
  const wanted = [...new Set([u.id, ...(Array.isArray(b.members) ? b.members.filter(isId) : [])])].filter(x => q('SELECT 1 FROM users WHERE id = ?').get(x));
  let vis = VIS.includes(b.vis) ? b.vis : 'private';
  if (vis === 'private' && wanted.length > 1) vis = 'members';
  const data = JSON.stringify({ name, color: COLORS.includes(b.color) ? b.color : 'blue', org: str(b.org, 20), about: str(b.about, 60),
    recruit: b.recruit?.on ? { on: true, until: isDate(b.recruit.until) ? b.recruit.until : '', note: str(b.recruit.note, 60) } : { on: false } });
  const invite = vis === 'private' ? (old?.invite ?? null) : (old?.invite || inviteCode());
  // 운영진 목록을 안 보내면 기존 운영진을 그대로 둡니다
  const admins = new Set(Array.isArray(b.admins) ? b.admins.filter(isId) : (old ? adminsOf(id) : []));
  if (old) q('UPDATE cals SET vis = ?, invite = ?, data = ? WHERE id = ?').run(vis, invite, data, id);
  else q('INSERT INTO cals VALUES (?, ?, ?, ?, ?)').run(id, u.id, vis, invite, data);
  q('DELETE FROM members WHERE cal_id = ?').run(id);
  for (const m of wanted) q('INSERT INTO members (cal_id, user_id, admin) VALUES (?, ?, ?)').run(id, m, m !== u.id && admins.has(m) ? 1 : 0);
  for (const m of wanted) q('DELETE FROM join_requests WHERE cal_id = ? AND user_id = ?').run(id, m);
  send(res, 200, calOut(getCal(id), u.id));
});
// 운영진도 쓸 수 있는 멤버 초대 (설정 전체는 만든 사람만 바꿉니다)
route('POST', '/api/cals/:id/members', async (req, res, u, url, id) => {
  need(u); const c = getCal(id);
  if (!c || !canInvite(c, u.id)) throw new Fail(403, '운영진만 멤버를 초대할 수 있어요.');
  if (c.vis === 'private') throw new Fail(400, '개인 공개 캘린더에는 멤버를 초대할 수 없어요. 공개 범위를 먼저 바꿔 주세요.');
  const b = await json(req);
  if (!isId(b.userId) || !q('SELECT 1 FROM users WHERE id = ?').get(b.userId)) throw new Fail(404, '사용자를 찾지 못했어요.');
  q('INSERT OR IGNORE INTO members (cal_id, user_id) VALUES (?, ?)').run(id, b.userId);
  q('DELETE FROM join_requests WHERE cal_id = ? AND user_id = ?').run(id, b.userId);
  send(res, 200, calOut(c, u.id));
});
route('DELETE', '/api/cals/:id', async (req, res, u, url, id) => {
  need(u); const c = getCal(id); if (!c) return send(res, 200, { ok: true });
  if (c.owner !== u.id) throw new Fail(403, '캘린더를 만든 사람만 삭제할 수 있어요.');
  const assets = q('SELECT asset FROM moments WHERE cal_id = ? AND asset IS NOT NULL').all(id).map(r => r.asset);
  q('DELETE FROM cals WHERE id = ?').run(id);
  assets.forEach(dropFileIfUnused);
  send(res, 200, { ok: true });
});
route('POST', '/api/cals/:id/invite', async (req, res, u, url, id) => {
  need(u); const c = getCal(id); if (!c || !canInvite(c, u.id)) throw new Fail(403, '운영진만 초대 코드를 재발급할 수 있어요.');
  const invite = inviteCode(); q('UPDATE cals SET invite = ? WHERE id = ?').run(invite, id);
  send(res, 200, { invite });
});
route('POST', '/api/join', async (req, res, u) => {
  need(u); limit(`join:${u.id}`, 10, 15 * 60e3);
  const b = await json(req), c = q('SELECT * FROM cals WHERE invite = ?').get(str(b.code, 6).trim().toUpperCase());
  if (!c || c.vis === 'private') throw new Fail(404, '이 코드의 캘린더를 찾지 못했어요. 코드를 다시 확인해 주세요.');
  if (roleOf(c, u.id)) return send(res, 200, { joined: true, cal: calOut(c, u.id) });
  // 바로 멤버가 되지 않고, 캘린더 주인이 수락할 때까지 요청으로 남습니다
  q('INSERT OR IGNORE INTO join_requests VALUES (?, ?, ?)').run(c.id, u.id, Date.now());
  send(res, 202, { pending: true, id: c.id, name: JSON.parse(c.data).name });
});
route('POST', '/api/cals/:id/requests/:userId', async (req, res, u, url, id, userId) => {
  need(u); const c = getCal(id);
  if (!c || c.owner !== u.id) throw new Fail(403, '캘린더 주인만 참여 요청을 처리할 수 있어요.');
  if (!q('SELECT 1 FROM join_requests WHERE cal_id = ? AND user_id = ?').get(id, userId)) throw new Fail(404, '참여 요청을 찾지 못했어요.');
  const b = await json(req);
  q('DELETE FROM join_requests WHERE cal_id = ? AND user_id = ?').run(id, userId);
  if (b.accept) q('INSERT OR IGNORE INTO members (cal_id, user_id) VALUES (?, ?)').run(id, userId);
  send(res, 200, calOut(c, u.id));
});

route('PUT', '/api/moments/:id', async (req, res, u, url, id) => {
  need(u); const b = await json(req), old = q('SELECT * FROM moments WHERE id = ?').get(id);
  const c = getCal(old ? old.cal_id : b.calId);
  if (!isId(id) || !c || !canPost(c, u.id)) throw new Fail(403, isOrg(c || { data: '{}' }) ? '운영진만 기록할 수 있어요.' : '이 캘린더의 멤버만 기록할 수 있어요.');
  if (old && old.by_user !== u.id && !isManager(c, u.id)) throw new Fail(403, '작성자만 고칠 수 있어요.');
  if (!isDate(b.date) || !KINDS.includes(b.kind)) throw new Fail(400, '기록 형식이 올바르지 않아요.');
  let asset = old?.asset || null;
  if (!old && b.kind !== 'text') {
    if (!isId(b.assetId) || q('SELECT owner FROM files WHERE id = ?').get(b.assetId)?.owner !== u.id) throw new Fail(400, '파일을 찾지 못했어요.');
    asset = b.assetId;
  }
  const data = JSON.stringify({ post: str(b.post, 64), kind: b.kind, text: str(b.text, 5000), clipEnd: Math.min(Number(b.clipEnd) || 5, 5), at: str(b.at, 25) });
  const secret = b.secret && c.vis !== 'private' ? 1 : 0;
  q(`INSERT INTO moments VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`).run(id, c.id, b.date, old?.by_user || u.id, old ? old.secret : secret, asset, data);
  send(res, 200, momentOut(q('SELECT * FROM moments WHERE id = ?').get(id)));
});
route('DELETE', '/api/moments/:id', async (req, res, u, url, id) => {
  need(u); const m = q('SELECT * FROM moments WHERE id = ?').get(id); if (!m) return send(res, 200, { ok: true });
  if (m.by_user !== u.id && !isManager(getCal(m.cal_id), u.id)) throw new Fail(403, '작성자만 지울 수 있어요.');
  q('DELETE FROM moments WHERE id = ?').run(id); dropFileIfUnused(m.asset);
  send(res, 200, { ok: true });
});
route('PUT', '/api/days/:id', async (req, res, u, url, id) => {
  need(u); const b = await json(req), c = getCal(b.calId);
  if (!c || !canPost(c, u.id) || !isDate(b.date) || id !== `${b.calId}_${b.date}`) throw new Fail(403, '기록 권한이 있는 사람만 고칠 수 있어요.');
  const data = JSON.stringify({ cover: b.cover || null, ai: b.ai || null });
  if (data.length > 20000) throw new Fail(413, '내용이 너무 길어요.');
  q(`INSERT INTO days VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`).run(id, c.id, b.date, data);
  send(res, 200, { ok: true });
});
route('PUT', '/api/all-covers/:date', async (req, res, u, url, date) => {
  need(u); const b = await json(req); if (!isDate(date) || !isId(b.momentId)) throw new Fail(400, '요청 형식이 올바르지 않아요.');
  q('INSERT INTO all_covers VALUES (?, ?, ?) ON CONFLICT(user_id, date) DO UPDATE SET moment_id = excluded.moment_id').run(u.id, date, b.momentId);
  send(res, 200, { ok: true });
});
route('DELETE', '/api/all-covers/:date', async (req, res, u, url, date) => {
  need(u); q('DELETE FROM all_covers WHERE user_id = ? AND date = ?').run(u.id, date);
  send(res, 200, { ok: true });
});

route('POST', '/api/upload', async (req, res, u) => {
  need(u); limit(`upload:${u.id}`, 120, 60 * 60e3);
  const mime = String(req.headers['content-type'] || '').split(';')[0];
  if (!MIMES[mime]) throw new Fail(415, 'JPG, PNG, WEBP 사진이나 MP4, WEBM, MOV 영상을 올려 주세요.');
  const body = await readBody(req, 21e6), id = newId();
  fs.writeFileSync(path.join(FILE_DIR, id), body);
  q('INSERT INTO files VALUES (?, ?, ?, ?)').run(id, u.id, mime, Date.now());
  send(res, 201, { id, url: `/files/${id}` });
});
route('GET', '/files/:id', async (req, res, u, url, id) => {
  if (!isId(id)) throw new Fail(404, '파일을 찾지 못했어요.');
  const f = canReadFile(id, u?.id); if (!f) throw new Fail(404, '파일을 찾지 못했어요.');
  const file = path.join(FILE_DIR, id), size = fs.statSync(file).size;
  const base = { 'Content-Type': f.mime, 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600' };
  const r = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
  if (r) {
    const start = Number(r[1]), end = Math.min(r[2] ? Number(r[2]) : size - 1, size - 1);
    if (start > end) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
    res.writeHead(206, { ...base, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...base, 'Content-Length': size });
  fs.createReadStream(file).pipe(res);
});

route('POST', '/api/ai', async (req, res, u) => {
  need(u); if (!AI_KEY) throw new Fail(503, 'AI 키가 설정되어 있지 않아요. README를 확인해 주세요.');
  limit(`ai:${u.id}`, 30, 10 * 60e3);
  // 글만 보냅니다 (사진은 보내지 않음)
  const prompt = str((await json(req)).prompt, 30000);
  if (!prompt.trim()) throw new Fail(400, '요약할 내용이 없어요.');
  try { send(res, 200, { text: await askClaude(prompt) }); }
  catch (e) {
    if (e instanceof Fail) throw e;
    console.error('AI 연결 오류', e.name, e.cause?.code || e.message);
    throw new Fail(504, e.name === 'TimeoutError' ? 'AI가 너무 오래 응답하지 않아요. 잠시 뒤 다시 시도해 주세요.' : 'AI 서버에 연결하지 못했어요. 다시 시도해 주세요.');
  }
});
const aiFail = async (r, name) => {
  console.error(`${name} 오류`, r.status, await r.text());
  throw new Fail(r.status === 429 ? 429 : 502, r.status === 429 ? 'AI 요청이 많아요. 잠시 뒤 다시 시도해 주세요.' : 'AI 응답을 받지 못했어요. 다시 시도해 주세요.');
};
const CUT_OFF = 'AI 응답이 너무 길어 잘렸어요. 다시 시도해 주세요.';
// Claude Messages API
async function askClaude(prompt) {
  const r = await fetch(`${AI.base}/v1/messages`, { method: 'POST', signal: AbortSignal.timeout(120e3),
    headers: { 'content-type': 'application/json', 'x-api-key': AI.key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: AI.model, max_tokens: 16000, messages: [{ role: 'user', content: prompt }] }) });
  if (!r.ok) await aiFail(r, 'Claude');
  const data = await r.json();
  if (data.stop_reason === 'refusal') throw new Fail(422, 'AI가 이 내용은 정리할 수 없다고 했어요.');
  if (data.stop_reason === 'max_tokens') throw new Fail(502, CUT_OFF);
  return (data.content || []).filter(x => x.type === 'text').map(x => x.text).join('');
}

function serveAsset(res, raw) {
  let name; try { name = decodeURIComponent(raw); } catch { throw new Fail(404, '파일을 찾지 못했어요.'); }
  // 하위 폴더는 허용하되 assets 밖으로 나가는 경로(../)나 숨김 파일은 막습니다
  const file = path.resolve(ASSET_DIR, name), type = ASSET_TYPES[path.extname(file).toLowerCase()];
  if (!type || !file.startsWith(ASSET_DIR + path.sep) || name.split('/').some(p => p.startsWith('.')) || !fs.statSync(file, { throwIfNoEntry: false })?.isFile())
    throw new Fail(404, '파일을 찾지 못했어요.');
  // SVG 안의 스크립트가 실행되지 않게 막습니다
  res.writeHead(200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=3600', ...(type === 'image/svg+xml' ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" } : {}) });
  fs.createReadStream(file).pipe(res);
}
function serveFile(res, name) {
  res.writeHead(200, { 'Content-Type': STATIC_TYPES[path.extname(name)], 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
  fs.createReadStream(path.join(PUBLIC_DIR, name)).pipe(res);
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  try {
    if (req.method === 'GET') {
      if (url.pathname === '/' || /^\/(c|join)\/[A-Za-z0-9_-]+$/.test(url.pathname)) return serveFile(res, 'index.html');
      if (url.pathname === '/login.html') return serveFile(res, 'login.html');
      if (url.pathname.startsWith('/assets/')) return serveAsset(res, url.pathname.slice('/assets/'.length));
    } else if (req.headers['x-requested-with'] !== 'moa') throw new Fail(403, '허용되지 않은 요청이에요.');
    const u = currentUser(req);
    for (const r of routes) {
      const m = r.method === req.method && r.re.exec(url.pathname);
      if (m) return await r.fn(req, res, u, url, ...m.slice(1).map(decodeURIComponent));
    }
    throw new Fail(404, '찾을 수 없어요.');
  } catch (e) {
    if (!(e instanceof Fail)) console.error(e);
    if (!res.headersSent) send(res, e.status || 500, { error: e instanceof Fail ? e.message : '서버 오류가 났어요. 다시 시도해 주세요.' });
  }
});
q('DELETE FROM sessions WHERE expires < ?').run(Date.now());
server.listen(PORT, () => console.log(`MoA 실행 중: http://localhost:${PORT}`));
