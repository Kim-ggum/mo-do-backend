'use strict';
// API 동작 테스트: `npm test`
// 임시 데이터 폴더로 서버를 띄워 실제 HTTP 요청을 보냅니다. 실제 DB(data/)는 건드리지 않습니다.
// AI는 가짜 Claude 서버를 띄워 확인하므로 API 키나 요금이 필요 없습니다.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PASSWORD = 'abcd1234';

/* ---------- 테스트 도구 ---------- */

// 서버를 자식 프로세스로 띄우고 "실행 중" 로그가 나오면 주소를 돌려줍니다
function startServer(env) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moa-test-'));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, PORT: String(port), DATA_DIR: dataDir, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`서버가 켜지지 않았어요:\n${log}`)), 10000);
    const onData = chunk => {
      log += chunk;
      if (log.includes('실행 중')) {
        clearTimeout(timer);
        resolve({ base: `http://localhost:${port}`, dataDir, stop: () => { child.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); } });
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', code => { clearTimeout(timer); if (!log.includes('실행 중')) reject(new Error(`서버가 종료됐어요 (${code}):\n${log}`)); });
  });
}

// 쿠키를 기억하는 간단한 클라이언트 (사용자 한 명 = 클라이언트 하나)
function client(base) {
  let cookie = '';
  const request = async (method, url, body, { headers = {}, raw = false } = {}) => {
    const isJson = body !== undefined && !Buffer.isBuffer(body);
    const res = await fetch(base + url, {
      method,
      headers: { 'X-Requested-With': 'moa', ...(isJson ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
      body: body === undefined ? undefined : isJson ? JSON.stringify(body) : body,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0].endsWith('=') ? '' : setCookie.split(';')[0];
    const data = raw ? Buffer.from(await res.arrayBuffer()) : await res.json().catch(() => null);
    return { status: res.status, data, headers: res.headers };
  };
  return {
    request,
    get: (url, opts) => request('GET', url, undefined, opts),
    post: (url, body, opts) => request('POST', url, body, opts),
    put: (url, body, opts) => request('PUT', url, body, opts),
    patch: (url, body, opts) => request('PATCH', url, body, opts),
    del: (url, opts) => request('DELETE', url, undefined, opts),
    get cookie() { return cookie; },
  };
}

// 가입하고 로그인까지 한 클라이언트를 만듭니다
// 가입은 IP당 시간당 10번으로 제한되므로, 테스트 계정마다 다른 IP(X-Forwarded-For)로 가입합니다
let fakeIp = 0;
async function signedIn(base, name, extra = {}) {
  const c = client(base), email = `${name}@t.com`, ip = { 'X-Forwarded-For': `10.0.0.${++fakeIp}` };
  assert.equal((await c.post('/api/auth/signup', { name, email, password: PASSWORD, ...extra }, { headers: ip })).status, 201);
  assert.equal((await c.post('/api/auth/login', { email, password: PASSWORD })).status, 200);
  c.id = (await c.get('/api/me')).data.user.id;
  c.email = email;
  return c;
}

// 가짜 Claude API: 프롬프트 내용에 따라 정상/거절/잘림/과부하 응답을 돌려줍니다
function startFakeClaude() {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const json = JSON.parse(body || '{}'), prompt = json.messages?.[0]?.content || '';
      seen.push({ url: req.url, key: req.headers['x-api-key'], version: req.headers['anthropic-version'], json });
      res.setHeader('content-type', 'application/json');
      if (prompt.includes('RATE')) { res.statusCode = 429; return res.end('{}'); }
      if (prompt.includes('REFUSE')) return res.end(JSON.stringify({ stop_reason: 'refusal', content: [] }));
      if (prompt.includes('LONG')) return res.end(JSON.stringify({ stop_reason: 'max_tokens', content: [] }));
      res.end(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"title":"요약"}' }] }));
    });
  });
  return new Promise(resolve => server.listen(0, () => resolve({ base: `http://localhost:${server.address().port}`, seen, stop: () => server.close() })));
}

/* ---------- 준비 ---------- */

let srv, fakeAi, owner, admin, member, outsider;
before(async () => {
  fakeAi = await startFakeClaude();
  srv = await startServer({ ANTHROPIC_API_KEY: 'sk-ant-test', ANTHROPIC_BASE_URL: fakeAi.base });
  owner = await signedIn(srv.base, 'owner');
  admin = await signedIn(srv.base, 'admin');
  member = await signedIn(srv.base, 'member');
  outsider = await signedIn(srv.base, 'outsider');
});
after(() => { srv?.stop(); fakeAi?.stop(); });

/* ---------- 정적 파일과 공통 규칙 ---------- */

test('페이지와 로고 파일을 내보낸다', async () => {
  const c = client(srv.base);
  for (const url of ['/', '/login.html', '/c/abc', '/join/ABC123']) {
    const r = await c.get(url, { raw: true });
    assert.equal(r.status, 200, url);
    assert.match(r.headers.get('content-type'), /text\/html/, url);
  }
  const logo = await c.get('/assets/img.png', { raw: true });
  assert.equal(logo.status, 200);
  assert.equal(logo.headers.get('content-type'), 'image/png');
});

test('assets 밖의 파일이나 이상한 경로는 열리지 않는다', async () => {
  const c = client(srv.base);
  for (const url of ['/assets/../server.js', '/assets/%2e%2e/server.js', '/assets/..%2fserver.js', '/assets/nope.png', '/assets/.gitkeep', '/assets/%E0', '/nope'])
    assert.equal((await c.get(url, { raw: true })).status, 404, url);
});

test('GET이 아닌 요청은 X-Requested-With: moa 헤더가 있어야 한다', async () => {
  const r = await client(srv.base).post('/api/auth/login', {}, { headers: { 'X-Requested-With': 'other' } });
  assert.equal(r.status, 403);
});

/* ---------- 계정 ---------- */

test('회원가입 입력을 검사한다', async () => {
  const c = client(srv.base);
  const ip = { headers: { 'X-Forwarded-For': '10.1.0.1' } };
  assert.equal((await c.post('/api/auth/signup', { name: '', email: 'a@t.com', password: PASSWORD }, ip)).status, 400);
  assert.equal((await c.post('/api/auth/signup', { name: 'a', email: 'not-email', password: PASSWORD }, ip)).status, 400);
  assert.equal((await c.post('/api/auth/signup', { name: 'a', email: 'a@t.com', password: 'short' }, ip)).status, 400);
  assert.equal((await c.post('/api/auth/signup', { name: 'a', email: 'owner@t.com', password: PASSWORD }, ip)).status, 409);
  assert.equal((await c.post('/api/auth/signup', { name: 'x', email: 'bad-body' }, ip)).status, 400);
});

test('로그인, 내 정보, 로그아웃', async () => {
  const c = client(srv.base);
  assert.equal((await c.post('/api/auth/login', { email: 'owner@t.com', password: 'wrong123' })).status, 401);
  assert.equal((await c.post('/api/auth/login', { email: 'OWNER@t.com', password: PASSWORD })).status, 200);
  const me = await c.get('/api/me');
  assert.equal(me.data.user.email, 'owner@t.com');
  assert.equal(me.data.ai, true);
  assert.equal((await c.post('/api/auth/logout')).status, 200);
  assert.equal((await c.get('/api/me')).data.user, null);
});

test('로그인하지 않으면 401', async () => {
  const c = client(srv.base);
  assert.equal((await c.put('/api/cals/x1', { name: 'x' })).status, 401);
  assert.equal((await c.patch('/api/me', { name: 'x' })).status, 401);
});

test('내 정보 수정: 이름, 이메일, 비밀번호', async () => {
  const u = await signedIn(srv.base, 'profile');
  const other = client(srv.base);
  await other.post('/api/auth/login', { email: u.email, password: PASSWORD });

  assert.equal((await u.patch('/api/me', { name: '새이름' })).data.user.name, '새이름');
  assert.equal((await u.patch('/api/me', { entry: 1990 })).status, 400);
  assert.equal((await u.patch('/api/me', { email: 'p2@t.com' })).status, 401);
  assert.equal((await u.patch('/api/me', { email: 'owner@t.com', currentPassword: PASSWORD })).status, 409);
  assert.equal((await u.patch('/api/me', { newPassword: 'short', currentPassword: PASSWORD })).status, 400);
  const ok = await u.patch('/api/me', { email: 'p2@t.com', newPassword: 'newpass99', currentPassword: PASSWORD });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.email, 'p2@t.com');

  // 비밀번호를 바꾸면 다른 기기는 로그아웃되고, 지금 기기는 유지됩니다
  assert.equal((await other.get('/api/me')).data.user, null);
  assert.equal((await u.get('/api/me')).data.user.email, 'p2@t.com');
  assert.equal((await client(srv.base).post('/api/auth/login', { email: 'p2@t.com', password: 'newpass99' })).status, 200);
});

test('사용자 검색', async () => {
  assert.deepEqual((await owner.get('/api/users/search?q=a')).data.users, []);
  const hits = (await owner.get('/api/users/search?q=adm')).data.users;
  assert.deepEqual(hits.map(h => h.name), ['admin']);
  assert.deepEqual((await owner.get('/api/users/search?q=owner')).data.users, [], '나 자신은 빠진다');
});

/* ---------- 캘린더와 권한 ---------- */

test('캘린더 만들기와 설정 권한', async () => {
  const made = await owner.put('/api/cals/p1', { name: '개인', vis: 'private', color: 'nope' });
  assert.equal(made.status, 200);
  assert.equal(made.data.color, 'blue');
  assert.equal(made.data.role, 'owner');
  assert.equal(made.data.invite, null);
  assert.equal((await owner.put('/api/cals/p1', { name: '' })).status, 400);
  assert.equal((await owner.put('/api/cals/bad id', { name: 'x' })).status, 400);
  assert.equal((await admin.put('/api/cals/p1', { name: '뺏기' })).status, 403);

  // 개인 공개에 멤버를 넣으면 멤버 공개로 바뀝니다
  const shared = await owner.put('/api/cals/p1', { name: '개인', vis: 'private', members: [member.id] });
  assert.equal(shared.data.vis, 'members');
  assert.match(shared.data.invite, /^[A-Z2-9]{6}$/);
});

test('단체 캘린더: 운영진만 기록·초대, 일반 멤버는 보기만', async () => {
  const club = await owner.put('/api/cals/club', { name: '동아리', vis: 'public', org: '동아리', members: [admin.id, member.id], admins: [admin.id] });
  assert.deepEqual(club.data.admins, [admin.id]);

  const note = (calId, id, extra = {}) => ({ calId, date: '2026-11-06', kind: 'text', text: id, post: id, ...extra });
  assert.equal((await admin.put('/api/moments/m-admin', note('club', 'm-admin'))).status, 200);
  assert.equal((await member.put('/api/moments/m-member', note('club', 'm-member'))).status, 403);
  assert.equal((await member.put('/api/days/club_2026-11-06', { calId: 'club', date: '2026-11-06' })).status, 403);
  assert.equal((await admin.put('/api/days/club_2026-11-06', { calId: 'club', date: '2026-11-06', ai: { title: 't' } })).status, 200);

  const asMember = (await member.get('/api/state')).data.cals.find(c => c.id === 'club');
  assert.deepEqual([asMember.role, asMember.canPost, asMember.canInvite, asMember.invite], ['member', false, false, undefined]);
  const asAdmin = (await admin.get('/api/state')).data.cals.find(c => c.id === 'club');
  assert.deepEqual([asAdmin.role, asAdmin.canPost, asAdmin.canInvite], ['admin', true, true]);

  assert.equal((await admin.post('/api/cals/club/invite')).status, 200);
  assert.equal((await member.post('/api/cals/club/invite')).status, 403);
  assert.equal((await member.post('/api/cals/club/members', { userId: outsider.id })).status, 403);
  assert.equal((await admin.post('/api/cals/club/members', { userId: 'nobody' })).status, 404);
  assert.equal((await admin.post('/api/cals/club/members', { userId: outsider.id })).status, 200);
  assert.equal((await admin.put('/api/cals/club', { name: '뺏기' })).status, 403);

  // 운영진 목록을 보내지 않고 저장하면 기존 운영진이 유지됩니다
  await owner.put('/api/cals/club', { name: '동아리', vis: 'public', org: '동아리', members: [admin.id, member.id, outsider.id] });
  assert.equal((await admin.get('/api/state')).data.cals.find(c => c.id === 'club').role, 'admin');

  // 단체가 아닌 캘린더는 멤버 모두 기록할 수 있습니다
  await owner.put('/api/cals/team', { name: '팀', vis: 'members', members: [member.id] });
  assert.equal((await member.put('/api/moments/m-team', note('team', 'm-team'))).status, 200);

  // 운영진은 다른 사람 기록을 지울 수 있고, 일반 멤버는 못 지웁니다
  assert.equal((await member.del('/api/moments/m-admin')).status, 403);
  await owner.put('/api/moments/m-owner', note('club', 'm-owner'));
  assert.equal((await admin.del('/api/moments/m-owner')).status, 200);
});

test('개인 공개 캘린더에는 직접 초대할 수 없다', async () => {
  await owner.put('/api/cals/solo', { name: '혼자', vis: 'private' });
  assert.equal((await owner.post('/api/cals/solo/members', { userId: member.id })).status, 400);
});

test('초대 코드 참여는 캘린더 주인이 수락해야 한다', async () => {
  const cal = (await owner.put('/api/cals/join1', { name: '참여', vis: 'members', members: [admin.id] })).data;
  const joiner = await signedIn(srv.base, 'joiner'), rejected = await signedIn(srv.base, 'rejected');

  assert.equal((await joiner.post('/api/join', { code: 'ZZZZZZ' })).status, 404);
  const pending = await joiner.post('/api/join', { code: cal.invite.toLowerCase() });
  assert.equal(pending.status, 202);
  assert.deepEqual(pending.data, { pending: true, id: 'join1', name: '참여' });

  const joinerState = (await joiner.get('/api/state')).data;
  assert.ok(!joinerState.cals.some(c => c.id === 'join1'), '수락 전에는 캘린더가 안 보인다');
  assert.deepEqual(joinerState.pending, [{ id: 'join1', name: '참여' }]);
  assert.equal((await joiner.put('/api/moments/x1', { calId: 'join1', date: '2026-11-06', kind: 'text' })).status, 403);

  assert.deepEqual((await owner.get('/api/state')).data.cals.find(c => c.id === 'join1').requests, [{ id: joiner.id, name: 'joiner' }]);
  assert.deepEqual((await admin.get('/api/state')).data.cals.find(c => c.id === 'join1').requests, []);
  assert.equal((await admin.post(`/api/cals/join1/requests/${joiner.id}`, { accept: true })).status, 403);

  assert.equal((await owner.post(`/api/cals/join1/requests/${joiner.id}`, { accept: true })).status, 200);
  assert.equal((await joiner.get('/api/state')).data.cals.find(c => c.id === 'join1').role, 'member');
  const again = await joiner.post('/api/join', { code: cal.invite });
  assert.equal(again.status, 200);
  assert.equal(again.data.joined, true);

  await rejected.post('/api/join', { code: cal.invite });
  assert.equal((await owner.post(`/api/cals/join1/requests/${rejected.id}`, { accept: false })).status, 200);
  assert.ok(!(await rejected.get('/api/state')).data.cals.some(c => c.id === 'join1'));
  assert.equal((await owner.post(`/api/cals/join1/requests/${rejected.id}`, { accept: true })).status, 404);
});

test('캘린더 삭제는 만든 사람만', async () => {
  await owner.put('/api/cals/gone', { name: '삭제', vis: 'members', members: [member.id] });
  assert.equal((await member.del('/api/cals/gone')).status, 403);
  assert.equal((await owner.del('/api/cals/gone')).status, 200);
  assert.equal((await owner.del('/api/cals/gone')).status, 200, '없는 캘린더 삭제도 성공으로 본다');
});

/* ---------- 기록 ---------- */

test('비밀 기록은 쓴 사람만 본다', async () => {
  await owner.put('/api/cals/sec', { name: '비밀', vis: 'members', members: [member.id] });
  const r = await member.put('/api/moments/s1', { calId: 'sec', date: '2026-11-06', kind: 'text', text: '비밀', post: 's1', secret: true });
  assert.equal(r.data.secret, true);
  assert.ok((await member.get('/api/state')).data.moments.some(m => m.id === 's1'));
  assert.ok(!(await owner.get('/api/state')).data.moments.some(m => m.id === 's1'), '캘린더 주인도 못 본다');

  // 개인 공개 캘린더에서는 비밀로 저장되지 않습니다
  const p = await owner.put('/api/moments/s2', { calId: 'p1', date: '2026-11-06', kind: 'text', secret: true });
  assert.equal(p.status, 200);
});

test('기록 수정 권한과 형식 검사', async () => {
  await owner.put('/api/cals/edit', { name: '수정', vis: 'members', members: [member.id] });
  await member.put('/api/moments/e1', { calId: 'edit', date: '2026-11-06', kind: 'text', text: '원래', post: 'e1' });
  const other = await signedIn(srv.base, 'editor2');
  await owner.put('/api/cals/edit', { name: '수정', vis: 'members', members: [member.id, other.id] });
  assert.equal((await other.put('/api/moments/e1', { date: '2026-11-06', kind: 'text', text: '남의 글' })).status, 403);
  assert.equal((await member.put('/api/moments/e1', { date: 'nope', kind: 'text' })).status, 400);
  const edited = await member.put('/api/moments/e1', { date: '2026-11-06', kind: 'text', text: '고침', post: 'e1' });
  assert.equal(edited.data.text, '고침');
  assert.equal((await member.put('/api/moments/e2', { calId: 'edit', date: '2026-11-06', kind: 'photo', assetId: 'nope' })).status, 400);
});

test('전체 캘린더 썸네일 지정과 해제', async () => {
  assert.equal((await owner.put('/api/all-covers/2026-11-06', { momentId: 'm-admin' })).status, 200);
  assert.deepEqual((await owner.get('/api/state')).data.allCovers, [{ id: '2026-11-06', date: '2026-11-06', momentId: 'm-admin' }]);
  assert.equal((await owner.put('/api/all-covers/bad', { momentId: 'x' })).status, 400);
  assert.equal((await owner.del('/api/all-covers/2026-11-06')).status, 200);
  assert.deepEqual((await owner.get('/api/state')).data.allCovers, []);
});

test('로그인하지 않은 방문자는 전체 공개 캘린더 하나만 본다', async () => {
  const visitor = client(srv.base);
  const pub = (await visitor.get('/api/state?cal=club')).data;
  assert.deepEqual(pub.cals.map(c => c.id), ['club']);
  assert.equal(pub.cals[0].role, null);
  assert.deepEqual((await visitor.get('/api/state?cal=team')).data.cals, []);
  assert.deepEqual((await visitor.get('/api/state')).data.cals, []);
});

/* ---------- 파일 ---------- */

test('파일 업로드, 권한, 범위 요청, 삭제', async () => {
  const png = Buffer.from('89504e470d0a1a0a' + '00'.repeat(100), 'hex');
  assert.equal((await member.post('/api/upload', Buffer.from('x'), { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  const up = await member.post('/api/upload', png, { headers: { 'Content-Type': 'image/png' } });
  assert.equal(up.status, 201);
  const fileId = up.data.id;

  await owner.put('/api/cals/pics', { name: '사진', vis: 'members', members: [member.id] });
  assert.equal((await owner.put('/api/moments/ph0', { calId: 'pics', date: '2026-11-06', kind: 'photo', assetId: fileId })).status, 400, '남의 파일은 못 붙인다');
  assert.equal((await member.put('/api/moments/ph1', { calId: 'pics', date: '2026-11-06', kind: 'photo', assetId: fileId, post: 'ph1' })).status, 200);

  const whole = await owner.get(`/files/${fileId}`, { raw: true });
  assert.equal(whole.status, 200);
  assert.equal(whole.data.length, png.length);
  const part = await owner.get(`/files/${fileId}`, { raw: true, headers: { Range: 'bytes=0-7' } });
  assert.equal(part.status, 206);
  assert.equal(part.data.toString('hex'), '89504e470d0a1a0a');
  assert.equal((await owner.get(`/files/${fileId}`, { raw: true, headers: { Range: 'bytes=500-400' } })).status, 416);
  assert.equal((await outsider.get(`/files/${fileId}`, { raw: true })).status, 404, '캘린더 밖 사람은 못 본다');

  // 쓰는 기록이 없어지면 파일도 지워집니다
  assert.equal((await member.del('/api/moments/ph1')).status, 200);
  assert.equal((await member.get(`/files/${fileId}`, { raw: true })).status, 404);
  assert.equal(fs.existsSync(path.join(srv.dataDir, 'files', fileId)), false);
});

test('비밀 기록에 붙은 사진은 다른 사람이 열 수 없다', async () => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const up = await member.post('/api/upload', png, { headers: { 'Content-Type': 'image/png' } });
  await member.put('/api/moments/sp1', { calId: 'pics', date: '2026-11-06', kind: 'photo', assetId: up.data.id, secret: true });
  assert.equal((await member.get(`/files/${up.data.id}`, { raw: true })).status, 200);
  assert.equal((await owner.get(`/files/${up.data.id}`, { raw: true })).status, 404);
});

/* ---------- AI ---------- */

test('AI 요약: Claude 요청 형식과 오류 안내', async () => {
  const ok = await member.post('/api/ai', { prompt: '오늘 기록', images: ['data:image/png;base64,AAAA'] });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.text, '{"title":"요약"}');
  const sent = fakeAi.seen.at(-1);
  assert.equal(sent.url, '/v1/messages');
  assert.equal(sent.key, 'sk-ant-test');
  assert.equal(sent.version, '2023-06-01');
  assert.equal(sent.json.model, 'claude-sonnet-5-5');
  assert.equal(sent.json.max_tokens, 16000);
  assert.equal(typeof sent.json.messages[0].content, 'string', '사진은 보내지 않고 글만 보낸다');

  assert.equal((await member.post('/api/ai', { prompt: '  ' })).status, 400);
  assert.equal((await member.post('/api/ai', { prompt: 'REFUSE' })).status, 422);
  assert.equal((await member.post('/api/ai', { prompt: 'LONG' })).status, 502);
  assert.equal((await member.post('/api/ai', { prompt: 'RATE' })).status, 429);
});

test('AI 키가 없으면 AI 기능이 꺼진다', async () => {
  const noKey = await startServer({});
  try {
    const u = await signedIn(noKey.base, 'nokey');
    assert.equal((await u.get('/api/me')).data.ai, false);
    assert.equal((await u.post('/api/ai', { prompt: 'x' })).status, 503);
  } finally { noKey.stop(); }
});

test('예전 DB 파일(hakgirok.db)을 moa.db로 옮겨 쓴다', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moa-old-'));
  fs.copyFileSync(path.join(srv.dataDir, 'moa.db'), path.join(dir, 'hakgirok.db'));
  const old = await startServer({ DATA_DIR: dir });
  try {
    assert.ok(fs.existsSync(path.join(dir, 'moa.db')));
    assert.ok(!fs.existsSync(path.join(dir, 'hakgirok.db')));
  } finally { old.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});
