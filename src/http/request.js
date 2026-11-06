'use strict';
// 요청 본문 읽기와 클라이언트 IP
const { HttpError } = require('./errors');

const JSON_LIMIT = 1e6; // JSON 본문은 1MB까지

/** 본문을 Buffer로 읽습니다. limit 바이트를 넘으면 413 */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, '파일이나 내용이 너무 커요.'));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** 본문을 JSON으로 읽습니다. 비어 있으면 {}, 형식이 틀리면 400 */
async function readJson(req, limit = JSON_LIMIT) {
  try {
    return JSON.parse((await readBody(req, limit)).toString('utf8') || '{}');
  } catch (e) {
    throw e instanceof HttpError ? e : new HttpError(400, '요청 형식이 올바르지 않아요.');
  }
}

/**
 * 요청 횟수 제한에 쓰는 클라이언트 IP.
 * ngrok 같은 프록시 뒤에서도 실제 IP를 쓰려고 X-Forwarded-For를 먼저 봅니다.
 * (주의: 이 헤더는 클라이언트가 꾸밀 수 있습니다. 프록시 없이 공개 배포한다면 다시 검토해야 합니다.)
 */
function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',')[0].trim();
}

module.exports = { readBody, readJson, clientIp };
