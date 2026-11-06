'use strict';
// 요청 횟수 제한: 같은 key로 windowMs 안에 max번을 넘으면 429.
// 메모리에만 기억하므로 서버를 다시 켜면 초기화됩니다.
const { HttpError } = require('./errors');

const MINUTE = 60e3;
const HOUR = 60 * MINUTE;
const hitsByKey = new Map();

function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const recent = (hitsByKey.get(key) || []).filter(time => now - time < windowMs);
  if (recent.length >= max) throw new HttpError(429, '요청이 많아요. 잠시 뒤 다시 시도해 주세요.');
  recent.push(now);
  hitsByKey.set(key, recent);
}

module.exports = { rateLimit, MINUTE, HOUR };
