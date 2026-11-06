'use strict';

/** JSON 응답을 보냅니다. body가 undefined면 빈 본문 */
function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

module.exports = { sendJson };
