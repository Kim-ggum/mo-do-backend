'use strict';
// 내 정보 보기·수정, 사용자 검색, 화면 전체 상태
const db = require('../db');
const claude = require('../services/claude');
const { HttpError } = require('../http/errors');
const { readJson } = require('../http/request');
const { sendJson } = require('../http/response');
const { rateLimit, MINUTE } = require('../http/rateLimit');
const { requireUser, endOtherSessions } = require('../auth/session');
const { newSalt, hashPassword, passwordMatches } = require('../lib/crypto');
const { clip, normalizeEmail, isEmail, isStrongPassword, WEAK_PASSWORD_MESSAGE } = require('../lib/validate');
const { buildState } = require('../domain/state');

module.exports = router => {
  // 로그인한 사용자(없으면 null)와 AI 기능이 켜져 있는지
  router.get('/api/me', async ({ res, user }) => {
    sendJson(res, 200, { user, ai: claude.isEnabled() });
  });

  // 화면 전체 상태. 방문자는 ?cal=공개캘린더id 로 그 캘린더만 받습니다
  router.get('/api/state', async ({ res, user, url }) => {
    sendJson(res, 200, buildState(user?.id, url.searchParams.get('cal')));
  });

  /*
   * 내 정보 수정: 보낸 항목만 바꿉니다.
   *   entry(입학 연도), name: 바로 바꿉니다
   *   email, newPassword: 현재 비밀번호(currentPassword)가 맞아야 바꿉니다
   * 비밀번호를 바꾸면 지금 기기 말고는 모두 로그아웃됩니다.
   */
  router.patch('/api/me', async ({ req, res, user }) => {
    requireUser(user);
    const body = await readJson(req);
    const row = db.one('SELECT * FROM users WHERE id = ?', user.id);
    const next = { name: row.name, email: row.email, entry: row.entry, salt: row.pw_salt, hash: row.pw_hash };

    if (body.entry !== undefined) {
      const entry = Number(body.entry);
      if (!Number.isInteger(entry) || entry < 2000 || entry > 2100) throw new HttpError(400, '입학 연도를 확인해 주세요.');
      next.entry = entry;
    }
    if (body.name !== undefined) {
      next.name = clip(body.name, 40).trim();
      if (!next.name) throw new HttpError(400, '이름을 입력해 주세요.');
    }

    const email = body.email === undefined ? row.email : normalizeEmail(body.email);
    const newPassword = String(body.newPassword || '');
    const changingLogin = email !== row.email || newPassword;

    if (changingLogin) {
      rateLimit(`me:${user.id}`, 8, 15 * MINUTE);
      const currentPassword = String(body.currentPassword || '').slice(0, 200);
      if (!(await passwordMatches(currentPassword, row.pw_salt, row.pw_hash))) throw new HttpError(401, '현재 비밀번호가 올바르지 않아요.');
    }
    if (email !== row.email) {
      if (!isEmail(email)) throw new HttpError(400, '올바른 이메일을 입력해 주세요.');
      if (db.one('SELECT 1 FROM users WHERE email = ? AND id != ?', email, user.id)) throw new HttpError(409, '이미 가입된 이메일이에요.');
      next.email = email;
    }
    if (newPassword) {
      if (!isStrongPassword(newPassword)) throw new HttpError(400, WEAK_PASSWORD_MESSAGE);
      next.salt = newSalt();
      next.hash = await hashPassword(newPassword, next.salt);
    }

    db.run('UPDATE users SET name = ?, email = ?, entry = ?, pw_salt = ?, pw_hash = ? WHERE id = ?', next.name, next.email, next.entry, next.salt, next.hash, user.id);
    if (newPassword) endOtherSessions(req, user.id);
    sendJson(res, 200, { user: { id: user.id, email: next.email, name: next.name, entry: next.entry } });
  });

  // 멤버로 추가할 사람 찾기: 이름이 이걸로 시작하거나 이메일이 정확히 같은 사람 (나는 빼고, 6명까지)
  router.get('/api/users/search', async ({ res, user, url }) => {
    requireUser(user);
    const query = clip(url.searchParams.get('q'), 40).trim();
    if (query.length < 2) return sendJson(res, 200, { users: [] });

    const namePrefix = `${query.replace(/[%_\\]/g, '\\$&')}%`; // LIKE의 특수문자는 글자 그대로 찾도록
    const users = db.all(
      `SELECT id, name FROM users WHERE (name LIKE ? ESCAPE '\\' OR email = ?) AND id != ? LIMIT 6`,
      namePrefix, query.toLowerCase(), user.id,
    );
    sendJson(res, 200, { users });
  });
};
