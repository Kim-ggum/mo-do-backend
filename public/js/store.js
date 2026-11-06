'use strict';
// 앱 상태와 서버 통신

/* ---------- 상태 ---------- */

const today = ymd(new Date());

// 예전 이름(hgr-*)으로 저장된 값이 있으면 새 이름(moa-*)으로 옮깁니다
['prefs', 'story'].forEach(key => {
  try {
    const old = localStorage.getItem(`hgr-${key}`);
    if (old !== null && localStorage.getItem(`moa-${key}`) === null) localStorage.setItem(`moa-${key}`, old);
    localStorage.removeItem(`hgr-${key}`);
  } catch {}
});

/** 이 브라우저에만 저장하는 설정: 입학 연도, 전체 캘린더에서 숨긴 캘린더 */
const prefs = Object.assign({ entry: 2025, hidden: [] }, lsGet('moa-prefs', {}));

/**
 * S: 서버에서 받은 데이터 (id로 찾을 수 있게 객체로 보관)
 *   cals       캘린더          moments  기록(글·사진·영상 하나씩)
 *   days       하루 정보(겉면, AI 요약). id는 "캘린더id_날짜"
 *   allCovers  전체 캘린더에서 고른 날짜별 썸네일. id는 날짜
 */
const S = { cals: {}, moments: {}, days: {}, allCovers: {} };

/**
 * V: 지금 화면 상태
 *   cal        보고 있는 캘린더 id ('all' = 전체 캘린더)
 *   view       'calendar' | 'years'(대학 4년 기록) | 'browse'(둘러보기)
 *   mode       달력 보기 단위 'month' | 'week' | 'day'
 *   y, m       달력에 보이는 연도와 월(0부터)
 *   sel        고른 날짜 (오른쪽 패널에 보이는 날)
 *   panelCal   패널에서 고른 캘린더 (전체 캘린더에서 같은 날 여러 캘린더에 기록이 있을 때)
 *   panelOpen  오른쪽 패널을 열었는지 (넓은 화면에서는 처음부터 열림)
 *   menu       제목 옆 캘린더 메뉴를 열었는지
 *   hero       게시물마다 크게 보고 있는 첨부 { 게시물id: 기록id }
 *   kind, browse, findQ, find   4년 기록·둘러보기의 필터와 경험 찾기 결과
 */
const V = {
  cal: 'all', view: 'calendar', mode: 'month',
  y: new Date().getFullYear(), m: new Date().getMonth(), sel: today,
  panelCal: null, panelOpen: innerWidth > 1160, menu: false, hero: {},
  kind: '전체', browse: '전체', findQ: '', find: null,
};

/**
 * draft: 작성 중인 기록
 *   open     작성칸을 열었는지      text    글
 *   files    새로 첨부한 파일 [{ kind, file, preview | clipEnd }]
 *   edit     고치는 중인 게시물 id   remove  고칠 때 뺄 기존 첨부 id 목록
 *   secret   비밀 기록인지          targets 올릴 캘린더 id 목록 (전체 캘린더에서 여러 개 고를 때)
 *   rep      대표 사진 { i: 새 파일 순번 } 또는 { old: 기존 기록 id }
 */
const newDraft = () => ({ open: false, text: '', files: [], edit: null, remove: [], secret: false, targets: null, rep: null });
let draft = newDraft();
function resetDraft() { draft = newDraft(); }

/**
 * R: 로그인·서버 관련
 *   me, myName, myEmail  로그인한 사용자 (방문자면 me가 null)
 *   ai                   서버에 AI 키가 있어 AI 기능을 쓸 수 있는지
 *   names                사용자 id → 이름
 *   pending              아직 끝나지 않은 저장 요청 수 (0일 때만 서버 상태로 덮어씁니다)
 *   waiting              내가 보내고 수락을 기다리는 참여 요청
 */
const R = { me: null, myName: '', myEmail: '', ai: false, names: {}, pending: 0, waiting: [] };

// AI 작업 진행 표시, 저장해 둔 성장 이야기
let summarizing = null, storyBusy = false, findBusy = false;
let story = lsGet('moa-story', '');

/* ---------- 서버 요청 ---------- */

/** JSON API를 부릅니다. 실패하면 서버가 보낸 메시지로 Error를 던집니다 */
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'moa' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || '요청을 처리하지 못했어요.');
    error.status = res.status;
    throw error;
  }
  return data;
}

/* ---------- 저장 ---------- */
// 화면 상태(S)를 먼저 바꾸고 서버에 저장합니다. 실패하면 알림만 띄웁니다.

const API_PATHS = { cals: 'cals', moments: 'moments', days: 'days', allCovers: 'all-covers' };

/** 저장 요청을 세어 두었다가 끝나면 뺍니다. 저장 중에는 주기적 새로고침이 화면을 덮어쓰지 않습니다 */
function track(promise, onSuccess) {
  R.pending++;
  return promise.then(onSuccess).catch(e => toast(e.message)).finally(() => { R.pending--; });
}
function put(collection, item) {
  S[collection][item.id] = item;
  return track(api('PUT', `/api/${API_PATHS[collection]}/${item.id}`, item));
}
function drop(collection, item) {
  delete S[collection][item.id];
  return track(api('DELETE', `/api/${API_PATHS[collection]}/${item.id}`));
}

/** 서버 캘린더 정보에 빠진 값을 채웁니다 (화면에서 막 만든 캘린더도 같은 모양이 되게) */
const normalizeCalendar = cal => ({
  ...cal,
  members: cal.members || [],
  admins: cal.admins || [],
  requests: cal.requests || [],
  color: COLORS.includes(cal.color) ? cal.color : 'blue',
  canPost: cal.canPost ?? cal.role === 'owner',
  canInvite: cal.canInvite ?? cal.role === 'owner',
});

/** 서버에서 받은 전체 상태(/api/state)로 S와 R을 채웁니다 */
function applyState(data) {
  ['cals', 'moments', 'days', 'allCovers'].forEach(key => {
    S[key] = {};
    (data[key] || []).forEach(item => { S[key][item.id] = key === 'cals' ? normalizeCalendar(item) : item; });
  });
  R.names = data.names || {};
  R.waiting = data.pending || [];
  // 참여 요청한 사람 이름도 알아 둡니다
  (data.cals || []).forEach(cal => (cal.requests || []).forEach(r => { R.names[r.id] = r.name; }));
}

/** 방문자는 공개 캘린더 id를 함께 보내 그 캘린더만 받습니다 */
async function loadState(publicCalId) {
  applyState(await api('GET', `/api/state${publicCalId ? `?cal=${publicCalId}` : ''}`));
}
