'use strict';
// 로그인 세션: 쿠키(sid)에 무작위 토큰을 넣고, DB에는 그 토큰의 해시만 저장합니다.
const db = require('../db');
const { HttpError } = require('../http/errors');
const { newSessionToken, sha256 } = require('../lib/crypto');

const DAY_MS = 864e5;
const REMEMBER_DAYS = 30;

/** 요청 쿠키에서 세션 토큰을 꺼냅니다. 없으면 null */
function readSessionToken(req) {
  const found = /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(req.headers.cookie || '');
  return found ? found[1] : null;
}

/** 쿠키의 세션으로 로그인한 사용자를 찾습니다. 없거나 만료됐으면 null */
function findSessionUser(req) {
  const token = readSessionToken(req);
  if (!token) return null;
  return db.one(
    `SELECT u.id, u.email, u.name, u.entry
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires > ?`,
    sha256(token), Date.now(),
  ) || null;
}

/**
 * 새 세션을 만들고 쿠키를 심습니다.
 * "로그인 상태 유지"를 고르면 30일, 아니면 브라우저를 닫을 때까지(서버에서는 하루) 유지됩니다.
 */
function startSession(req, res, userId, remember) {
  const token = newSessionToken();
  const lifetime = remember ? REMEMBER_DAYS * DAY_MS : DAY_MS;
  db.run('INSERT INTO sessions VALUES (?, ?, ?)', sha256(token), userId, Date.now() + lifetime);

  const maxAge = remember ? `; Max-Age=${REMEMBER_DAYS * 86400}` : '';
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''; // ngrok 등 https 프록시 뒤에서
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/${maxAge}${secure}`);
}

/** 지금 세션을 지우고 쿠키도 비웁니다 */
function endSession(req, res) {
  const token = readSessionToken(req);
  if (token) db.run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}

/** 이 사용자의 세션 중 지금 요청의 세션만 남기고 모두 지웁니다 (비밀번호 변경 시) */
function endOtherSessions(req, userId) {
  db.run('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', userId, sha256(readSessionToken(req)));
}

/** 서버를 켤 때 만료된 세션을 정리합니다 */
function removeExpiredSessions() {
  db.run('DELETE FROM sessions WHERE expires < ?', Date.now());
}

/** 로그인이 필요한 API에서 씁니다. 로그인하지 않았으면 401 */
function requireUser(user) {
  if (!user) throw new HttpError(401, '로그인이 필요해요.');
  return user;
}

module.exports = { findSessionUser, startSession, endSession, endOtherSessions, removeExpiredSessions, requireUser };
