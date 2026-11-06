'use strict';
// 상태에서 필요한 값을 꺼내는 함수들 (화면을 그리지는 않습니다)

/* ---------- 사용자와 권한 ---------- */

const isVisitor = () => !R.me;

/** 내가 멤버인 캘린더인지 (만든 사람·운영진 포함). 전체 공개 캘린더는 멤버가 아니어도 S에 들어 있습니다 */
const isMember = cal => !!cal.role;
const isOwner = cal => cal?.role === 'owner';
/** 만든 사람 또는 운영진. 단체 캘린더에서는 이들만 기록하고 초대합니다 */
const isAdmin = cal => cal?.role === 'owner' || cal?.role === 'admin';

/** 이 캘린더에 기록을 쓸 수 있는지 (권한 판단은 서버가 보낸 canPost를 따릅니다) */
const canWrite = cal => !!cal && !isVisitor() && isMember(cal) && !!cal.canPost;

/** 게시물을 고치거나 지울 수 있는지: 운영진 이상, 또는 기록 권한이 있는 작성자 */
const canEditPost = (cal, post) => !isVisitor() && (isAdmin(cal) || (post.by === R.me && canWrite(cal)));

/* ---------- 캘린더 ---------- */

const allCals = () => Object.values(S.cals);
/** 사이드바 "내 캘린더": 내가 멤버인 캘린더 */
const myCals = () => allCals().filter(isMember);

/** 자물쇠 표시: 나만 보는 캘린더 (개인 공개, 또는 멤버가 나뿐인 멤버 공개) */
const isLocked = cal => cal.vis === 'private' || (cal.vis === 'members' && (cal.members || []).length <= 1);

/** 지금 달력에 그릴 캘린더: 전체 캘린더면 숨기지 않은 내 캘린더, 아니면 고른 캘린더 하나 */
const visibleCals = () => (V.cal === 'all'
  ? myCals().filter(cal => !prefs.hidden.includes(cal.id))
  : allCals().filter(cal => cal.id === V.cal));

/* ---------- 기록 ---------- */

/** 그날 그 캘린더의 기록 (시각 순) */
const momentsOf = (calId, date) => Object.values(S.moments)
  .filter(m => m.calId === calId && m.date === date)
  .sort((a, b) => String(a.at).localeCompare(String(b.at)));

/** 하루 정보. 아직 없으면 빈 모양을 돌려줍니다 */
const dayOf = (calId, date) => S.days[`${calId}_${date}`] || { id: `${calId}_${date}`, calId, date };

const urlOf = moment => safeUrl(moment.url);
const nameOf = moment => (moment.by === R.me ? '나' : R.names[moment.by] || '멤버');
const hasPhotoDay = (calId, date) => momentsOf(calId, date).some(m => m.kind === 'photo');

/** 같은 post 값을 가진 기록들이 게시물 하나입니다 (글 하나 + 사진·영상 여러 개) */
const postKey = moment => moment.post || moment.id;

/** 그날 기록을 게시물 단위로 묶습니다 → [{ id, at, by, name, secret, text, media: [] }] */
function postsOf(calId, date) {
  const posts = new Map();
  momentsOf(calId, date).forEach(m => {
    const key = postKey(m);
    const post = posts.get(key) || { id: key, at: m.at, by: m.by, name: nameOf(m), secret: !!m.secret, text: null, media: [] };
    if (m.kind === 'text') post.text = m;
    else post.media.push(m);
    posts.set(key, post);
  });
  return [...posts.values()];
}

/**
 * 달력 칸에 보여 줄 겉면을 고릅니다. 기록이 없으면 null
 * 우선순위: 직접 고른 겉면(AI 요약 또는 특정 기록) → 첫 사진 → 첫 글 → 영상 표시
 */
function coverOf(calId, date) {
  const moments = momentsOf(calId, date);
  if (!moments.length) return null;

  const day = dayOf(calId, date), chosen = day.cover;
  if (chosen?.kind === 'summary' && day.ai) return { type: 'text', text: day.ai.summary };
  if (chosen?.kind === 'moment') {
    const m = moments.find(x => x.id === chosen.id);
    if (m?.kind === 'photo') return { type: 'photo', url: urlOf(m) };
    if (m?.kind === 'text') return { type: 'text', text: m.text };
  }
  const photo = moments.find(m => m.kind === 'photo');
  if (photo) return { type: 'photo', url: urlOf(photo) };
  const text = moments.find(m => m.kind === 'text');
  if (text) return { type: 'text', text: text.text };
  return { type: 'video' };
}

/* ---------- 학기 ---------- */

/**
 * 날짜가 몇 학년 몇 학기 몇 주차인지 계산합니다 (입학 연도 기준)
 * 1학기: 3~8월, 2학기: 9~2월 (1·2월은 앞 해의 2학기). 주차는 학기 첫날(3/1, 9/1)이 있는 주가 1주차
 */
function semesterOf(dateText) {
  const date = parse(dateText), month = date.getMonth() + 1;
  const half = month >= 3 && month <= 8 ? 1 : 2;
  const year = month <= 2 ? date.getFullYear() - 1 : date.getFullYear();
  const grade = year - prefs.entry + 1;
  const start = new Date(year, half === 1 ? 2 : 8, 1);
  const week = Math.floor(((date - start) / 864e5 + start.getDay()) / 7) + 1;
  return { grade, half, week, inRange: grade >= 1 && grade <= 4 };
}

/** '1학년 2학기 10주차' (16주가 지나면 '방학', 4년 밖이면 빈 문자열) */
function semLabel(dateText) {
  const s = semesterOf(dateText);
  if (!s.inRange) return '';
  return `${s.grade}학년 ${s.half}학기` + (s.week >= 1 && s.week <= 16 ? ` ${s.week}주차` : ' 방학');
}

/* ---------- 날짜 패널 ---------- */

/** 패널에 보여 줄 캘린더: 직접 고른 것 → 그날 기록이 있는 것 → 기록할 수 있는 것 → 첫 번째 */
function panelCal() {
  const cals = visibleCals();
  if (V.panelCal && cals.some(c => c.id === V.panelCal)) return S.cals[V.panelCal];
  return cals.find(c => momentsOf(c.id, V.sel).length) || cals.find(canWrite) || cals[0] || null;
}

/** 새 기록을 올릴 캘린더들. 전체 캘린더에서 새로 쓸 때만 여러 개를 고를 수 있습니다 */
function composeTargets() {
  const main = panelCal();
  if (V.cal !== 'all' || draft.edit) return main ? [main] : [];
  const ids = draft.targets || (main && canWrite(main) ? [main.id] : []);
  return ids.map(id => S.cals[id]).filter(Boolean);
}
