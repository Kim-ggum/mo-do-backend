'use strict';
// MoA (Memory of All) 서버 시작점. 외부 패키지 없이 Node.js 22.13 이상에서 실행합니다.
// 실제 코드는 src/ 아래에 있습니다. 구조는 README.md를 참고하세요.
const http = require('node:http');
const config = require('./src/config');
const { handleRequest } = require('./src/app');
const { removeExpiredSessions } = require('./src/auth/session');

removeExpiredSessions();
http.createServer(handleRequest).listen(config.port, () => {
  console.log(`MoA 실행 중: http://localhost:${config.port}`);
});
