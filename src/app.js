'use strict';
// 요청 하나를 처리하는 흐름
const config = require('./config');
const { HttpError } = require('./http/errors');
const { sendJson } = require('./http/response');
const { Router } = require('./http/router');
const { serveStatic } = require('./http/static');
const { findSessionUser } = require('./auth/session');

// 기능별 API를 라우터에 등록합니다
const router = new Router();
require('./routes/auth')(router);
require('./routes/account')(router);
require('./routes/calendars')(router);
require('./routes/records')(router);
require('./routes/files')(router);
require('./routes/ai')(router);

/*
 * 1. GET이면 먼저 화면 파일(HTML·CSS·JS·로고)인지 봅니다.
 * 2. GET이 아니면 X-Requested-With 헤더를 확인합니다. (다른 사이트에서 보낸 요청 차단)
 * 3. 쿠키로 로그인한 사용자를 찾고, 경로에 맞는 API를 실행합니다.
 * 4. 오류가 나면 { error: 메시지 } JSON으로 응답합니다.
 */
async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://local');
  try {
    if (req.method === 'GET') {
      if (serveStatic(res, url.pathname)) return;
    } else if (req.headers['x-requested-with'] !== config.requestedWith) {
      throw new HttpError(403, '허용되지 않은 요청이에요.');
    }

    const route = router.match(req.method, url.pathname);
    if (!route) throw new HttpError(404, '찾을 수 없어요.');
    await route.handler({ req, res, url, params: route.params, user: findSessionUser(req) });
  } catch (error) {
    sendError(res, error);
  }
}

function sendError(res, error) {
  const expected = error instanceof HttpError;
  if (!expected) console.error(error); // 예상하지 못한 오류만 로그에 남깁니다
  if (res.headersSent) return;
  sendJson(res, expected ? error.status : 500, { error: expected ? error.message : '서버 오류가 났어요. 다시 시도해 주세요.' });
}

module.exports = { handleRequest };
