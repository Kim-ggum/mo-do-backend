'use strict';
// DB 한 줄을 화면에 보낼 모양(JSON)으로 바꿉니다. 사용자에 따라 보이는 정보가 달라집니다.
const db = require('../db');
const { settingsOf, roleOf, canPost, canInvite, memberIdsOf, adminIdsOf } = require('./permissions');

/**
 * 캘린더. 멤버가 아니면 멤버 목록을, 초대 권한이 없으면 초대 코드를,
 * 만든 사람이 아니면 참여 요청 목록을 비워서 보냅니다.
 */
function calendarView(cal, userId) {
  const role = roleOf(cal, userId);
  const invitable = canInvite(cal, userId);
  return {
    ...settingsOf(cal), // name, color, org, about, recruit
    id: cal.id,
    vis: cal.vis,
    by: cal.owner,
    role,
    canPost: canPost(cal, userId),
    canInvite: invitable,
    invite: invitable ? cal.invite : undefined,
    members: role ? memberIdsOf(cal.id) : [],
    admins: role ? adminIdsOf(cal.id) : [],
    requests: role === 'owner' ? pendingRequestsOf(cal.id) : [],
  };
}

/** 이 캘린더에 들어온, 아직 처리하지 않은 참여 요청 (오래된 순) */
function pendingRequestsOf(calId) {
  return db.all(
    `SELECT r.user_id AS id, u.name
       FROM join_requests r JOIN users u ON u.id = r.user_id
      WHERE r.cal_id = ? ORDER BY r.created`,
    calId,
  );
}

/** 기록 하나. 파일이 붙어 있으면 파일 주소(url)도 넣습니다 */
function momentView(row) {
  return {
    ...JSON.parse(row.data), // post, kind, text, clipEnd, at
    id: row.id,
    calId: row.cal_id,
    date: row.date,
    by: row.by_user,
    secret: !!row.secret,
    assetId: row.asset || undefined,
    url: row.asset ? `/files/${row.asset}` : undefined,
  };
}

/** 하루 정보 (달력 겉면, AI 요약) */
function dayView(row) {
  return { ...JSON.parse(row.data), id: row.id, calId: row.cal_id, date: row.date };
}

module.exports = { calendarView, momentView, dayView };
