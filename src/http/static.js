'use strict';
// 화면 파일 내보내기: HTML 페이지, CSS·JS, 로고 같은 이미지
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const { HttpError } = require('./errors');

const SECURITY_HEADER = { 'X-Content-Type-Options': 'nosniff' };

// 폴더별로 내보낼 수 있는 파일 종류와 캐시 정책
const FOLDERS = {
  // 화면 코드는 고치면 바로 반영되도록 매번 확인합니다
  css: { types: { '.css': 'text/css; charset=utf-8' }, cache: 'no-cache' },
  js: { types: { '.js': 'text/javascript; charset=utf-8' }, cache: 'no-cache' },
  assets: {
    types: { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' },
    cache: 'public, max-age=3600',
  },
};

// 앱 화면(index.html)을 보여 줄 주소: 첫 화면, 공개 캘린더 링크(/c/id), 초대 링크(/join/code)
const APP_PAGE = /^\/(?:|c\/[A-Za-z0-9_-]+|join\/[A-Za-z0-9_-]+)$/;

/**
 * GET 요청이 화면 파일이면 응답하고 true, 아니면 false (그다음 API로 넘어갑니다).
 */
function serveStatic(res, pathname) {
  if (APP_PAGE.test(pathname)) return sendPage(res, 'index.html'), true;
  if (pathname === '/login.html') return sendPage(res, 'login.html'), true;

  const folder = /^\/(css|js|assets)\/(.+)$/.exec(pathname);
  if (folder) return sendFolderFile(res, folder[1], folder[2]), true;
  return false;
}

function sendPage(res, name) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ...SECURITY_HEADER });
  fs.createReadStream(path.join(config.publicDir, name)).pipe(res);
}

function sendFolderFile(res, folderName, rawName) {
  const { types, cache } = FOLDERS[folderName];
  const baseDir = path.join(config.publicDir, folderName);
  const file = resolveInside(baseDir, rawName);
  const type = file && types[path.extname(file).toLowerCase()];
  if (!type) throw new HttpError(404, '파일을 찾지 못했어요.');

  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': cache,
    ...SECURITY_HEADER,
    // SVG 안에 스크립트가 있어도 실행되지 않게 막습니다
    ...(type === 'image/svg+xml' ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" } : {}),
  });
  fs.createReadStream(file).pipe(res);
}

/**
 * 폴더 안의 실제 파일 경로를 돌려줍니다. 아래 경우는 null:
 * 주소를 디코딩할 수 없음, 폴더 밖으로 나가는 경로(../), 숨김 파일(.으로 시작), 파일이 없음
 */
function resolveInside(baseDir, rawName) {
  let name;
  try { name = decodeURIComponent(rawName); } catch { return null; }
  const file = path.resolve(baseDir, name);
  if (!file.startsWith(baseDir + path.sep)) return null;
  if (name.split('/').some(part => part.startsWith('.'))) return null;
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) return null;
  return file;
}

module.exports = { serveStatic };
