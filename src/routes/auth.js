'use strict';
// 회원가입 / 로그인 / 로그아웃
const db = require('../db');
const { HttpError } = require('../http/errors');
const { readJson, clientIp } = require('../http/request');
const { sendJson } = require('../http/response');
const { rateLimit, MINUTE, HOUR } = require('../http/rateLimit');
const { startSession, endSession } = require('../auth/session');
const { newId, newSalt, hashPassword, passwordMatches } = require('../lib/crypto');
const { clip, normalizeEmail, isEmail, isStrongPassword, WEAK_PASSWORD_MESSAGE } = require('../lib/validate');

module.exports = router => {
  // 회원가입: IP당 1시간에 10번까지
  router.post('/api/auth/signup', async ({ req, res }) => {
    rateLimit(`signup:${clientIp(req)}`, 10, HOUR);
    const body = await readJson(req);
    const name = clip(body.name, 40).trim();
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');

    if (!name) throw new HttpError(400, '이름을 입력해 주세요.');
    if (!isEmail(email)) throw new HttpError(400, '올바른 이메일을 입력해 주세요.');
    if (!isStrongPassword(password)) throw new HttpError(400, WEAK_PASSWORD_MESSAGE);
    if (db.one('SELECT 1 FROM users WHERE email = ?', email)) throw new HttpError(409, '이미 가입된 이메일이에요.');

    const salt = newSalt();
    const entryYear = Number(body.entry) || new Date().getFullYear();
    db.run('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?)', newId(), email, name, salt, await hashPassword(password, salt), entryYear, Date.now());
    sendJson(res, 201, { ok: true });
  });

  // 로그인: 같은 IP·이메일로 15분에 8번까지
  router.post('/api/auth/login', async ({ req, res }) => {
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || '').slice(0, 200);
    rateLimit(`login:${clientIp(req)}:${email}`, 8, 15 * MINUTE);

    const user = db.one('SELECT * FROM users WHERE email = ?', email);
    // 없는 계정이어도 비밀번호 확인과 같은 시간을 들여, 계정이 있는지 알아낼 수 없게 합니다
    if (!(await passwordMatches(password, user?.pw_salt, user?.pw_hash))) {
      throw new HttpError(401, '이메일 또는 비밀번호가 올바르지 않아요.');
    }
    startSession(req, res, user.id, !!body.remember);
    sendJson(res, 200, { ok: true });
  });

  router.post('/api/auth/logout', async ({ req, res }) => {
    endSession(req, res);
    sendJson(res, 200, { ok: true });
  });
};
