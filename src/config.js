'use strict';
// 서버 설정: 환경변수(.env)와 폴더 경로를 한곳에 모읍니다.
const path = require('node:path');

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT_DIR, 'data');

module.exports = {
  port: Number(process.env.PORT || 3000),

  // 데이터: DB 파일과 업로드한 사진·영상 (git에는 올라가지 않습니다)
  dataDir: DATA_DIR,
  dbFile: path.join(DATA_DIR, 'moa.db'),
  legacyDbFile: path.join(DATA_DIR, 'hakgirok.db'), // 앱 이름을 바꾸기 전의 DB 파일
  uploadDir: path.join(DATA_DIR, 'files'),

  // 화면: HTML, CSS, JS, 로고
  publicDir: path.join(ROOT_DIR, 'public'),

  // 화면이 GET이 아닌 요청에 붙이는 헤더 값. 다른 사이트에서 몰래 보내는 요청(CSRF)을 막습니다.
  requestedWith: 'moa',

  // AI 요약 (Claude API). 키가 없으면 AI 기능만 꺼집니다.
  ai: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
  },
};
