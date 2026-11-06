'use strict';
// 사진·영상 업로드와 내려받기
const fs = require('node:fs');
const { HttpError } = require('../http/errors');
const { readBody } = require('../http/request');
const { sendJson } = require('../http/response');
const { rateLimit, HOUR } = require('../http/rateLimit');
const { requireUser } = require('../auth/session');
const { isId, UPLOAD_TYPES } = require('../lib/validate');
const { pathOf, saveUpload, findReadableFile } = require('../domain/files');

const MAX_UPLOAD_BYTES = 21e6; // 약 20MB (사진은 화면에서 미리 줄여서 보냅니다)

module.exports = router => {
  // 업로드: 본문 전체가 파일입니다 (Content-Type이 파일 종류). 1시간에 120개까지
  router.post('/api/upload', async ({ req, res, user }) => {
    requireUser(user);
    rateLimit(`upload:${user.id}`, 120, HOUR);
    const mime = String(req.headers['content-type'] || '').split(';')[0];
    if (!UPLOAD_TYPES.includes(mime)) throw new HttpError(415, 'JPG, PNG, WEBP 사진이나 MP4, WEBM, MOV 영상을 올려 주세요.');

    const id = saveUpload(user.id, mime, await readBody(req, MAX_UPLOAD_BYTES));
    sendJson(res, 201, { id, url: `/files/${id}` });
  });

  /*
   * 파일 내려받기: 볼 권한이 없으면 파일이 없는 것처럼 404.
   * 영상 재생을 위해 범위 요청(Range: bytes=시작-끝)을 지원합니다.
   */
  router.get('/files/:id', async ({ req, res, user, params: { id } }) => {
    const file = isId(id) && findReadableFile(id, user?.id);
    if (!file) throw new HttpError(404, '파일을 찾지 못했어요.');

    const filePath = pathOf(id);
    const size = fs.statSync(filePath).size;
    const headers = { 'Content-Type': file.mime, 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600' };

    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    if (!range) {
      res.writeHead(200, { ...headers, 'Content-Length': size });
      return fs.createReadStream(filePath).pipe(res);
    }

    const start = Number(range[1]);
    const end = Math.min(range[2] ? Number(range[2]) : size - 1, size - 1);
    if (start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      return res.end();
    }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  });
};
