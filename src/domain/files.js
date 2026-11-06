'use strict';
// 업로드한 파일: 저장, 읽기 권한, 정리
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const db = require('../db');
const { newId } = require('../lib/crypto');
const { getCalendar, canSee } = require('./permissions');

const pathOf = fileId => path.join(config.uploadDir, fileId);

/** 파일을 data/files/에 저장하고 id를 돌려줍니다 */
function saveUpload(ownerId, mime, body) {
  const id = newId();
  fs.writeFileSync(pathOf(id), body);
  db.run('INSERT INTO files VALUES (?, ?, ?, ?)', id, ownerId, mime, Date.now());
  return id;
}

/**
 * 이 사용자가 볼 수 있는 파일이면 파일 정보를, 아니면 null을 돌려줍니다.
 * 올린 사람이거나, 이 파일이 붙은 기록 중 하나라도 볼 수 있으면 됩니다. (남의 비밀 기록은 제외)
 */
function findReadableFile(fileId, userId) {
  const file = db.one('SELECT * FROM files WHERE id = ?', fileId);
  if (!file) return null;
  if (file.owner === userId) return file;
  for (const moment of db.all('SELECT * FROM moments WHERE asset = ?', fileId)) {
    if (moment.secret && moment.by_user !== userId) continue;
    if (canSee(getCalendar(moment.cal_id), userId)) return file;
  }
  return null;
}

/** 이 파일을 쓰는 기록이 더 없으면 DB와 디스크에서 지웁니다 */
function removeFileIfUnused(fileId) {
  if (!fileId || db.one('SELECT 1 FROM moments WHERE asset = ? LIMIT 1', fileId)) return;
  db.run('DELETE FROM files WHERE id = ?', fileId);
  fs.rm(pathOf(fileId), { force: true }, () => {});
}

module.exports = { pathOf, saveUpload, findReadableFile, removeFileIfUnused };
