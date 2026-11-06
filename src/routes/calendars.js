'use strict';
// 캘린더: 만들기·설정, 삭제, 멤버 초대, 초대 코드 참여와 수락
const db = require('../db');
const { HttpError } = require('../http/errors');
const { readJson } = require('../http/request');
const { sendJson } = require('../http/response');
const { rateLimit, MINUTE } = require('../http/rateLimit');
const { requireUser } = require('../auth/session');
const { newInviteCode } = require('../lib/crypto');
const { isId, isDate, clip, VISIBILITIES, CALENDAR_COLORS } = require('../lib/validate');
const { getCalendar, settingsOf, roleOf, canInvite, adminIdsOf } = require('../domain/permissions');
const { calendarView } = require('../domain/views');
const { removeFileIfUnused } = require('../domain/files');

const userExists = id => !!db.one('SELECT 1 FROM users WHERE id = ?', id);

/** 화면에서 보낸 설정값을 허용된 값으로 다듬어 JSON으로 만듭니다 */
function calendarSettings(body, name) {
  const recruit = body.recruit?.on
    ? { on: true, until: isDate(body.recruit.until) ? body.recruit.until : '', note: clip(body.recruit.note, 60) }
    : { on: false };
  return JSON.stringify({
    name,
    color: CALENDAR_COLORS.includes(body.color) ? body.color : 'blue',
    org: clip(body.org, 20), // 단체 종류. 비어 있지 않으면 단체 캘린더
    about: clip(body.about, 60),
    recruit,
  });
}

/** 참여 요청이 있던 사람이 다른 방법으로 멤버가 되면 요청을 지웁니다 */
const clearJoinRequest = (calId, userId) => db.run('DELETE FROM join_requests WHERE cal_id = ? AND user_id = ?', calId, userId);

module.exports = router => {
  /*
   * 캘린더 만들기 또는 설정 저장 (만든 사람만)
   * 멤버 목록과 운영진 목록을 통째로 받아 바꿉니다. 운영진 목록(admins)을 안 보내면 기존 운영진을 유지합니다.
   * 개인 공개인데 멤버가 있으면 멤버 공개로 바꿉니다.
   */
  router.put('/api/cals/:id', async ({ req, res, user, params: { id } }) => {
    requireUser(user);
    if (!isId(id)) throw new HttpError(400, '잘못된 캘린더예요.');
    const body = await readJson(req);
    const existing = getCalendar(id);
    if (existing && existing.owner !== user.id) throw new HttpError(403, '캘린더를 만든 사람만 설정을 바꿀 수 있어요.');

    const name = clip(body.name, 24).trim();
    if (!name) throw new HttpError(400, '이름을 입력해 주세요.');

    const requested = Array.isArray(body.members) ? body.members.filter(isId) : [];
    const memberIds = [...new Set([user.id, ...requested])].filter(userExists); // 나는 항상 멤버
    let vis = VISIBILITIES.includes(body.vis) ? body.vis : 'private';
    if (vis === 'private' && memberIds.length > 1) vis = 'members';

    // 개인 공개면 초대 코드가 필요 없고, 공유하면 없을 때 새로 만듭니다
    const invite = vis === 'private' ? (existing?.invite ?? null) : (existing?.invite || newInviteCode());
    const adminIds = new Set(Array.isArray(body.admins) ? body.admins.filter(isId) : (existing ? adminIdsOf(id) : []));
    const settings = calendarSettings(body, name);

    if (existing) db.run('UPDATE cals SET vis = ?, invite = ?, data = ? WHERE id = ?', vis, invite, settings, id);
    else db.run('INSERT INTO cals VALUES (?, ?, ?, ?, ?)', id, user.id, vis, invite, settings);

    db.run('DELETE FROM members WHERE cal_id = ?', id);
    for (const memberId of memberIds) {
      const isAdmin = memberId !== user.id && adminIds.has(memberId) ? 1 : 0; // 만든 사람은 따로 admin 표시를 하지 않습니다
      db.run('INSERT INTO members (cal_id, user_id, admin) VALUES (?, ?, ?)', id, memberId, isAdmin);
      clearJoinRequest(id, memberId);
    }
    sendJson(res, 200, calendarView(getCalendar(id), user.id));
  });

  // 캘린더 삭제 (만든 사람만). 기록과 함께 쓰이지 않게 된 파일도 지웁니다
  router.delete('/api/cals/:id', async ({ res, user, params: { id } }) => {
    requireUser(user);
    const cal = getCalendar(id);
    if (!cal) return sendJson(res, 200, { ok: true });
    if (cal.owner !== user.id) throw new HttpError(403, '캘린더를 만든 사람만 삭제할 수 있어요.');

    const fileIds = db.all('SELECT asset FROM moments WHERE cal_id = ? AND asset IS NOT NULL', id).map(r => r.asset);
    db.run('DELETE FROM cals WHERE id = ?', id); // 멤버·기록·하루 정보·참여 요청은 함께 지워집니다 (ON DELETE CASCADE)
    fileIds.forEach(removeFileIfUnused);
    sendJson(res, 200, { ok: true });
  });

  // 멤버 직접 초대 (초대 권한이 있는 사람: 단체 캘린더는 운영진 이상). 수락 없이 바로 멤버가 됩니다
  router.post('/api/cals/:id/members', async ({ req, res, user, params: { id } }) => {
    requireUser(user);
    const cal = getCalendar(id);
    if (!cal || !canInvite(cal, user.id)) throw new HttpError(403, '운영진만 멤버를 초대할 수 있어요.');
    if (cal.vis === 'private') throw new HttpError(400, '개인 공개 캘린더에는 멤버를 초대할 수 없어요. 공개 범위를 먼저 바꿔 주세요.');

    const { userId } = await readJson(req);
    if (!isId(userId) || !userExists(userId)) throw new HttpError(404, '사용자를 찾지 못했어요.');
    db.run('INSERT OR IGNORE INTO members (cal_id, user_id) VALUES (?, ?)', id, userId);
    clearJoinRequest(id, userId);
    sendJson(res, 200, calendarView(cal, user.id));
  });

  // 초대 코드 재발급. 이전 코드와 링크는 더 이상 쓸 수 없습니다
  router.post('/api/cals/:id/invite', async ({ res, user, params: { id } }) => {
    requireUser(user);
    const cal = getCalendar(id);
    if (!cal || !canInvite(cal, user.id)) throw new HttpError(403, '운영진만 초대 코드를 재발급할 수 있어요.');
    const invite = newInviteCode();
    db.run('UPDATE cals SET invite = ? WHERE id = ?', invite, id);
    sendJson(res, 200, { invite });
  });

  /*
   * 초대 코드로 참여: 바로 멤버가 되지 않고 참여 요청(202)으로 남습니다.
   * 이미 멤버라면 캘린더 정보를 돌려줍니다(200).
   */
  router.post('/api/join', async ({ req, res, user }) => {
    requireUser(user);
    rateLimit(`join:${user.id}`, 10, 15 * MINUTE);
    const body = await readJson(req);
    const code = clip(body.code, 6).trim().toUpperCase();
    const cal = db.one('SELECT * FROM cals WHERE invite = ?', code);
    if (!cal || cal.vis === 'private') throw new HttpError(404, '이 코드의 캘린더를 찾지 못했어요. 코드를 다시 확인해 주세요.');

    if (roleOf(cal, user.id)) return sendJson(res, 200, { joined: true, cal: calendarView(cal, user.id) });
    db.run('INSERT OR IGNORE INTO join_requests VALUES (?, ?, ?)', cal.id, user.id, Date.now());
    sendJson(res, 202, { pending: true, id: cal.id, name: settingsOf(cal).name });
  });

  // 참여 요청 수락({ accept: true }) 또는 거절 (캘린더 주인만)
  router.post('/api/cals/:id/requests/:userId', async ({ req, res, user, params: { id, userId } }) => {
    requireUser(user);
    const cal = getCalendar(id);
    if (!cal || cal.owner !== user.id) throw new HttpError(403, '캘린더 주인만 참여 요청을 처리할 수 있어요.');
    if (!db.one('SELECT 1 FROM join_requests WHERE cal_id = ? AND user_id = ?', id, userId)) throw new HttpError(404, '참여 요청을 찾지 못했어요.');

    const { accept } = await readJson(req);
    clearJoinRequest(id, userId);
    if (accept) db.run('INSERT OR IGNORE INTO members (cal_id, user_id) VALUES (?, ?)', id, userId);
    sendJson(res, 200, calendarView(cal, user.id));
  });
};
