'use strict';
// id·토큰 만들기와 비밀번호 해시
const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);

/** 서버가 만드는 id (24자리 16진수) */
const newId = () => crypto.randomBytes(12).toString('hex');

/** 로그인 세션 토큰 (64자리 16진수) */
const newSessionToken = () => crypto.randomBytes(32).toString('hex');

/** DB에는 세션 토큰 원문 대신 이 해시를 저장합니다 */
const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');

/** 초대 코드 6자리. 헷갈리기 쉬운 글자(I, O, 0, 1)는 뺐습니다 */
const INVITE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newInviteCode = () => Array.from(crypto.randomBytes(6), n => INVITE_LETTERS[n % INVITE_LETTERS.length]).join('');

/** 비밀번호마다 새 소금(salt)을 만들어 같이 저장합니다 */
const newSalt = () => crypto.randomBytes(16).toString('hex');
const hashPassword = async (password, salt) => (await scrypt(password, salt, 32)).toString('hex');

/**
 * 비밀번호가 맞는지 확인합니다.
 * 저장된 해시가 없어도(없는 계정) 똑같이 계산해서, 응답 시간으로 계정 존재 여부를 알 수 없게 합니다.
 */
async function passwordMatches(password, salt, storedHash) {
  const given = Buffer.from(await hashPassword(password, salt || 'no-such-user'), 'hex');
  if (!storedHash) return false;
  return crypto.timingSafeEqual(given, Buffer.from(storedHash, 'hex'));
}

module.exports = { newId, newSessionToken, sha256, newInviteCode, newSalt, hashPassword, passwordMatches };
