'use strict';
// 화면이 처음 열릴 때(그리고 8초마다) 받아 가는 전체 상태를 만듭니다.
const db = require('../db');
const { getCalendar } = require('./permissions');
const { calendarView, momentView, dayView } = require('./views');

/**
 * 볼 수 있는 캘린더와 그 안의 기록·하루 정보를 모읍니다.
 *  - 로그인한 사용자: 전체 공개 캘린더 + 내가 만들었거나 멤버인 캘린더
 *  - 방문자: publicCalId로 지정한 전체 공개 캘린더 하나만
 * 남의 비밀 기록은 빼고 보냅니다.
 */
function buildState(userId, publicCalId) {
  const cals = visibleCalendars(userId, publicCalId);
  const calendars = [], moments = [], days = [], people = new Set();

  for (const cal of cals) {
    const view = calendarView(cal, userId);
    calendars.push(view);
    view.members.forEach(id => people.add(id));

    for (const row of db.all('SELECT * FROM moments WHERE cal_id = ?', cal.id)) {
      if (row.secret && row.by_user !== userId) continue;
      moments.push(momentView(row));
      people.add(row.by_user);
    }
    for (const row of db.all('SELECT * FROM days WHERE cal_id = ?', cal.id)) days.push(dayView(row));
  }

  return {
    cals: calendars,
    moments,
    days,
    allCovers: userId ? allCoversOf(userId) : [],
    names: namesOf(people), // 멤버·작성자 id → 이름
    pending: userId ? myPendingRequests(userId) : [],
  };
}

function visibleCalendars(userId, publicCalId) {
  if (userId) {
    return db.all(
      `SELECT DISTINCT c.* FROM cals c LEFT JOIN members m ON m.cal_id = c.id
        WHERE c.vis = 'public' OR c.owner = ? OR m.user_id = ?`,
      userId, userId,
    );
  }
  const cal = publicCalId && getCalendar(publicCalId);
  return cal && cal.vis === 'public' ? [cal] : [];
}

function namesOf(userIds) {
  const names = {};
  for (const id of userIds) {
    const user = db.one('SELECT name FROM users WHERE id = ?', id);
    if (user) names[id] = user.name;
  }
  return names;
}

/** "전체 캘린더"에서 고른 날짜별 썸네일 */
function allCoversOf(userId) {
  return db.all('SELECT date, moment_id FROM all_covers WHERE user_id = ?', userId)
    .map(r => ({ id: r.date, date: r.date, momentId: r.moment_id }));
}

/** 내가 보내고 아직 수락을 기다리는 참여 요청 */
function myPendingRequests(userId) {
  return db.all('SELECT c.id, c.data FROM join_requests r JOIN cals c ON c.id = r.cal_id WHERE r.user_id = ?', userId)
    .map(r => ({ id: r.id, name: JSON.parse(r.data).name }));
}

module.exports = { buildState };
