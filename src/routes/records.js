'use strict';
// 기록(moments), 하루 정보(days: 달력 겉면·AI 요약), 전체 캘린더 썸네일(all-covers)
const db = require('../db');
const { HttpError } = require('../http/errors');
const { readJson } = require('../http/request');
const { sendJson } = require('../http/response');
const { requireUser } = require('../auth/session');
const { isId, isDate, clip, MOMENT_KINDS } = require('../lib/validate');
const { getCalendar, isOrgCalendar, isManager, canPost } = require('../domain/permissions');
const { momentView } = require('../domain/views');
const { removeFileIfUnused } = require('../domain/files');

const MAX_VIDEO_SECONDS = 5;
const MAX_DAY_DATA = 20000; // 하루 정보(JSON) 최대 길이

const findMoment = id => db.one('SELECT * FROM moments WHERE id = ?', id);

module.exports = router => {
  /*
   * 기록 만들기·수정 (같은 id로 다시 보내면 수정)
   *  - 기록 권한(canPost)이 있어야 합니다
   *  - 남의 기록은 만든 사람·운영진만 고칠 수 있습니다
   *  - 사진·영상은 먼저 /api/upload로 올린 내 파일만 붙일 수 있고, 처음 만들 때만 붙입니다
   *  - 비밀 여부는 처음 만들 때만 정하고, 개인 공개 캘린더에서는 비밀로 저장하지 않습니다
   */
  router.put('/api/moments/:id', async ({ req, res, user, params: { id } }) => {
    requireUser(user);
    const body = await readJson(req);
    const existing = findMoment(id);
    const calId = existing ? existing.cal_id : body.calId;
    const cal = calId ? getCalendar(calId) : undefined;

    if (!isId(id) || !cal || !canPost(cal, user.id)) {
      const onlyManagers = cal && isOrgCalendar(cal);
      throw new HttpError(403, onlyManagers ? '운영진만 기록할 수 있어요.' : '이 캘린더의 멤버만 기록할 수 있어요.');
    }
    if (existing && existing.by_user !== user.id && !isManager(cal, user.id)) throw new HttpError(403, '작성자만 고칠 수 있어요.');
    if (!isDate(body.date) || !MOMENT_KINDS.includes(body.kind)) throw new HttpError(400, '기록 형식이 올바르지 않아요.');

    let fileId = existing?.asset || null;
    if (!existing && body.kind !== 'text') {
      const file = isId(body.assetId) && db.one('SELECT owner FROM files WHERE id = ?', body.assetId);
      if (!file || file.owner !== user.id) throw new HttpError(400, '파일을 찾지 못했어요.');
      fileId = body.assetId;
    }

    const data = JSON.stringify({
      post: clip(body.post, 64), // 같은 post 값의 기록들은 화면에서 게시물 하나로 묶입니다
      kind: body.kind,
      text: clip(body.text, 5000),
      clipEnd: Math.min(Number(body.clipEnd) || MAX_VIDEO_SECONDS, MAX_VIDEO_SECONDS), // 영상은 앞 5초만 재생
      at: clip(body.at, 25), // 기록한 시각
    });
    const secret = existing ? existing.secret : (body.secret && cal.vis !== 'private' ? 1 : 0);
    const author = existing?.by_user || user.id;

    // 이미 있으면 내용(data)만 바꿉니다. 날짜·작성자·파일·비밀 여부는 그대로입니다
    db.run(
      `INSERT INTO moments VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
      id, cal.id, body.date, author, secret, fileId, data,
    );
    sendJson(res, 200, momentView(findMoment(id)));
  });

  // 기록 삭제 (작성자, 만든 사람, 운영진). 붙은 파일을 더 쓰는 곳이 없으면 같이 지웁니다
  router.delete('/api/moments/:id', async ({ res, user, params: { id } }) => {
    requireUser(user);
    const moment = findMoment(id);
    if (!moment) return sendJson(res, 200, { ok: true });
    if (moment.by_user !== user.id && !isManager(getCalendar(moment.cal_id), user.id)) throw new HttpError(403, '작성자만 지울 수 있어요.');

    db.run('DELETE FROM moments WHERE id = ?', id);
    removeFileIfUnused(moment.asset);
    sendJson(res, 200, { ok: true });
  });

  // 하루 정보 저장: 달력 겉면(cover)과 AI 요약(ai). id는 "캘린더id_날짜" 형식입니다
  router.put('/api/days/:id', async ({ req, res, user, params: { id } }) => {
    requireUser(user);
    const body = await readJson(req);
    const cal = body.calId ? getCalendar(body.calId) : undefined;
    if (!cal || !canPost(cal, user.id) || !isDate(body.date) || id !== `${body.calId}_${body.date}`) {
      throw new HttpError(403, '기록 권한이 있는 사람만 고칠 수 있어요.');
    }
    const data = JSON.stringify({ cover: body.cover || null, ai: body.ai || null });
    if (data.length > MAX_DAY_DATA) throw new HttpError(413, '내용이 너무 길어요.');

    db.run(
      `INSERT INTO days VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
      id, cal.id, body.date, data,
    );
    sendJson(res, 200, { ok: true });
  });

  // "전체 캘린더"에서 그날 보여 줄 썸네일 고르기 (사용자마다 따로 저장)
  router.put('/api/all-covers/:date', async ({ req, res, user, params: { date } }) => {
    requireUser(user);
    const { momentId } = await readJson(req);
    if (!isDate(date) || !isId(momentId)) throw new HttpError(400, '요청 형식이 올바르지 않아요.');
    db.run(
      `INSERT INTO all_covers VALUES (?, ?, ?)
       ON CONFLICT(user_id, date) DO UPDATE SET moment_id = excluded.moment_id`,
      user.id, date, momentId,
    );
    sendJson(res, 200, { ok: true });
  });

  router.delete('/api/all-covers/:date', async ({ res, user, params: { date } }) => {
    requireUser(user);
    db.run('DELETE FROM all_covers WHERE user_id = ? AND date = ?', user.id, date);
    sendJson(res, 200, { ok: true });
  });
};
