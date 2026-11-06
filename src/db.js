'use strict';
// DB: SQLite 파일 하나(data/moa.db)에 모든 데이터를 저장합니다. Node 내장 node:sqlite를 씁니다.
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

/*
 * 테이블 한눈에 보기
 *   users          계정 (비밀번호는 scrypt 해시로만 저장)
 *   sessions       로그인 세션 (쿠키 값의 해시로 저장)
 *   cals           캘린더. 이름·색·단체 종류 같은 자주 바뀌는 설정은 data(JSON)에 넣습니다
 *   members        캘린더 멤버. admin=1이면 운영진
 *   join_requests  초대 코드로 보낸 참여 요청 (캘린더 주인이 수락하면 members로 옮겨집니다)
 *   moments        기록 하나(글/사진/영상). 글 내용 등은 data(JSON)에 넣습니다
 *   days           캘린더의 하루 정보: 달력 겉면(cover), AI 요약(ai)
 *   all_covers     "전체 캘린더"에서 사용자가 고른 날짜별 썸네일
 *   files          업로드한 파일 정보 (실제 파일은 data/files/에 있습니다)
 */
const SCHEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, pw_salt TEXT NOT NULL, pw_hash TEXT NOT NULL, entry INTEGER NOT NULL, created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS cals (id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), vis TEXT NOT NULL, invite TEXT UNIQUE, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS members (cal_id TEXT NOT NULL REFERENCES cals(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, admin INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (cal_id, user_id));
  CREATE TABLE IF NOT EXISTS join_requests (cal_id TEXT NOT NULL REFERENCES cals(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created INTEGER NOT NULL, PRIMARY KEY (cal_id, user_id));
  CREATE TABLE IF NOT EXISTS moments (id TEXT PRIMARY KEY, cal_id TEXT NOT NULL REFERENCES cals(id) ON DELETE CASCADE, date TEXT NOT NULL, by_user TEXT NOT NULL REFERENCES users(id), secret INTEGER NOT NULL DEFAULT 0, asset TEXT, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS days (id TEXT PRIMARY KEY, cal_id TEXT NOT NULL REFERENCES cals(id) ON DELETE CASCADE, date TEXT NOT NULL, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS all_covers (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, date TEXT NOT NULL, moment_id TEXT NOT NULL, PRIMARY KEY (user_id, date));
  CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), mime TEXT NOT NULL, created INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS moments_cal ON moments(cal_id);
  CREATE INDEX IF NOT EXISTS days_cal ON days(cal_id);
`;

// 앱 이름을 바꾸기 전의 DB(hakgirok.db)만 있으면 새 이름(moa.db)으로 옮깁니다.
function moveLegacyDbFile() {
  if (fs.existsSync(config.dbFile) || !fs.existsSync(config.legacyDbFile)) return;
  for (const ext of ['', '-wal', '-shm']) {
    if (fs.existsSync(config.legacyDbFile + ext)) fs.renameSync(config.legacyDbFile + ext, config.dbFile + ext);
  }
}

// 예전 DB에 없던 컬럼을 채워 넣습니다. (새 DB는 SCHEMA에 이미 들어 있습니다)
function migrate(db) {
  const memberColumns = db.prepare('PRAGMA table_info(members)').all().map(c => c.name);
  if (!memberColumns.includes('admin')) db.exec('ALTER TABLE members ADD COLUMN admin INTEGER NOT NULL DEFAULT 0');
}

fs.mkdirSync(config.uploadDir, { recursive: true });
moveLegacyDbFile();
const db = new DatabaseSync(config.dbFile);
db.exec(SCHEMA);
migrate(db);

// 같은 SQL은 한 번만 준비(prepare)해서 다시 씁니다.
const statements = new Map();
function statement(sql) {
  if (!statements.has(sql)) statements.set(sql, db.prepare(sql));
  return statements.get(sql);
}

module.exports = {
  /** 한 줄을 가져옵니다. 없으면 undefined */
  one: (sql, ...params) => statement(sql).get(...params),
  /** 여러 줄을 배열로 가져옵니다 */
  all: (sql, ...params) => statement(sql).all(...params),
  /** INSERT/UPDATE/DELETE를 실행합니다 */
  run: (sql, ...params) => statement(sql).run(...params),
};
