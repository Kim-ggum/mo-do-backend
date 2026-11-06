'use strict';
/*
 * 캘린더 권한
 *
 * 역할: owner(만든 사람) > admin(운영진) > member(멤버) > 없음(구경하는 사람)
 *
 *                     개인 캘린더        단체 캘린더(단체 종류를 고른 캘린더)
 *   기록 올리기·수정    멤버 모두          만든 사람과 운영진만
 *   멤버 초대          멤버 모두          만든 사람과 운영진만
 *   캘린더 설정·삭제    만든 사람만        만든 사람만
 *   참여 요청 수락      만든 사람만        만든 사람만
 *   보기              멤버 (전체 공개면 누구나)
 */
const db = require('../db');

const getCalendar = id => db.one('SELECT * FROM cals WHERE id = ?', id);

/** 캘린더 설정(JSON)을 꺼냅니다 */
const settingsOf = cal => JSON.parse(cal.data);

/** 단체 종류(동아리·학생회 등)를 고른 캘린더인지 */
const isOrgCalendar = cal => !!settingsOf(cal).org;

/** 이 사용자의 역할: 'owner' | 'admin' | 'member' | null */
function roleOf(cal, userId) {
  if (!userId) return null;
  if (cal.owner === userId) return 'owner';
  const membership = db.one('SELECT admin FROM members WHERE cal_id = ? AND user_id = ?', cal.id, userId);
  if (!membership) return null;
  return membership.admin ? 'admin' : 'member';
}

/** 만든 사람 또는 운영진 */
const isManager = (cal, userId) => ['owner', 'admin'].includes(roleOf(cal, userId));

/** 기록을 올리고 고칠 수 있는지 (단체 캘린더는 운영진 이상, 그 밖에는 멤버 모두) */
const canPost = (cal, userId) => (isOrgCalendar(cal) ? isManager(cal, userId) : !!roleOf(cal, userId));

/** 멤버를 초대할 수 있는지 (기록 권한과 같습니다) */
const canInvite = canPost;

/** 캘린더를 볼 수 있는지 */
const canSee = (cal, userId) => cal.vis === 'public' || !!roleOf(cal, userId);

const memberIdsOf = calId => db.all('SELECT user_id FROM members WHERE cal_id = ?', calId).map(r => r.user_id);
const adminIdsOf = calId => db.all('SELECT user_id FROM members WHERE cal_id = ? AND admin = 1', calId).map(r => r.user_id);

module.exports = { getCalendar, settingsOf, isOrgCalendar, roleOf, isManager, canPost, canInvite, canSee, memberIdsOf, adminIdsOf };
