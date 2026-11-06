'use strict';
// 대화상자: 캘린더 만들기·설정, 멤버 초대, 내 설정, 초대 코드 참여
// 모든 대화상자는 같은 <dialog id="dlg">에 내용을 바꿔 넣어 씁니다. dlg.dataset.id에 대상 캘린더 id를 둡니다.

/**
 * 캘린더 설정 창에서 편집 중인 멤버 목록. 저장 버튼을 누르기 전까지는 서버에 보내지 않습니다.
 *   dlgMembers  멤버 id 목록 (나 포함)
 *   dlgAdmins   운영진 id 목록
 *   dlgOrg      단체 캘린더인지 (단체 종류를 바꾸면 바로 반영해 운영진 버튼을 보여 줍니다)
 */
let dlgMembers = [], dlgAdmins = [], dlgOrg = false;

function openDialog(html, calId = '') {
  const dlg = $('dlg');
  dlg.innerHTML = html;
  dlg.dataset.id = calId;
  dlg.showModal();
}

/* ---------- 캘린더 만들기·설정 ---------- */

/** cal이 없으면 새 캘린더 만들기, 있으면 설정 (만든 사람만 엽니다) */
function calDialog(cal) {
  const isNew = !cal;
  cal = cal || { name: '', vis: 'private', color: COLORS.at(myCals().length % COLORS.length) };

  const visibilityOption = (value, hint) => `<label class="opt"><input type="radio" name="vis" value="${value}" ${cal.vis === value ? 'checked' : ''}><span>${VIS[value]}<small>${hint}</small></span></label>`;
  const colorOptions = COLORS.map(c => `<label aria-label="${COLOR_NAMES[c]}"><input type="radio" name="color" value="${c}" ${cal.color === c ? 'checked' : ''}><i style="--c:${colorVar(c)}"></i></label>`).join('');
  const deleteButton = isNew ? '' : `<button type="button" class="btn danger" data-act="del-cal" data-id="${esc(cal.id)}">삭제</button>`;

  openDialog(`<form data-form="cal"><h2>${isNew ? '캘린더 만들기' : '캘린더 설정'}</h2>
    <label class="field">이름<input id="cal-name" required maxlength="24" value="${esc(cal.name)}" placeholder="캘린더 이름"></label>
    <fieldset><legend>색</legend><div class="swatches">${colorOptions}</div></fieldset>
    <fieldset><legend>공개 범위</legend>
      ${visibilityOption('private', '나만 볼 수 있어요')}
      ${visibilityOption('members', '추가한 멤버만 보고 기록할 수 있어요')}
      ${visibilityOption('public', '둘러보기에 공개되고, 기록은 멤버만 할 수 있어요')}
    </fieldset>
    ${isNew ? '<p class="sub">멤버는 캘린더를 만든 뒤 캘린더 설정에서 추가할 수 있어요.</p>' : memberField(cal)}
    ${isNew ? '' : '<div class="field" id="req-wrap" hidden>참여 요청<div id="reqs" class="field"></div><small>초대 코드로 들어온 사람이에요. 수락하면 멤버가 돼요.</small></div>'}
    ${isNew ? '' : inviteField(cal)}
    ${!isNew && cal.vis === 'public' ? publicFields(cal) : ''}
    <div class="dlg-foot">${deleteButton}<button type="button" class="btn" data-act="dlg-close">취소</button><button class="btn primary" type="submit">${isNew ? '만들기' : '저장'}</button></div></form>`,
  isNew ? '' : cal.id);

  if (!isNew) {
    dlgMembers = [...(cal.members || [])];
    dlgAdmins = [...(cal.admins || [])];
    dlgOrg = !!cal.org;
    drawMembers();
    drawRequests(cal.id);
  }
}

function memberField(cal) {
  const hint = cal.org
    ? '단체 캘린더예요. 운영진으로 지정한 멤버만 기록하고 초대할 수 있고, 다른 멤버는 보기만 해요.'
    : '멤버는 이 캘린더를 보고 기록할 수 있어요. 단체 종류를 정하면 운영진만 기록하게 바꿀 수 있어요. 개인 공개 캘린더에 멤버를 넣으면 멤버 공개로 바뀌어요.';
  return `<div class="field">멤버<div class="people" id="members"></div><input id="mem-search" placeholder="이름이나 이메일로 찾아 추가"><div class="people" id="mem-hits"></div><small>${hint}</small></div>`;
}

/** 초대 코드 (개인 공개면 공유할 수 없다는 안내) */
function inviteField(cal) {
  if (cal.vis === 'private') return '<p class="sub">개인 공개 캘린더는 나만 볼 수 있어 공유 링크가 없어요.</p>';
  return '<div class="field">멤버 초대<div class="share-row">'
    + `<span class="code" id="inv-code">${esc(cal.invite || '저장하면 만들어져요')}</span>`
    + `<button type="button" class="btn" data-act="copy-code" ${cal.invite ? '' : 'disabled'}>링크 복사</button>`
    + `<button type="button" class="btn" data-act="new-code" data-id="${esc(cal.id)}">재발급</button>`
    + '</div><small>코드로 들어온 사람은 내가 수락해야 멤버가 돼요. 재발급하면 이전 코드와 링크는 쓸 수 없어요.</small></div>';
}

/** 전체 공개 캘린더에만 있는 칸: 공개 링크, 단체 종류, 소개, 모집 안내 */
function publicFields(cal) {
  const orgOptions = ORGS.map(o => `<option ${cal.org === o ? 'selected' : ''}>${o}</option>`).join('');
  return `<div class="field">공개 링크<div class="share-row"><input id="pub-link" readonly value="${esc(`${location.origin}/c/${cal.id}`)}"><button type="button" class="btn" data-act="copy-link">복사</button></div></div>
    <label class="field">단체 종류<select id="cal-org"><option value="">개인</option>${orgOptions}</select></label>
      <label class="field">소개<input id="cal-about" maxlength="60" value="${esc(cal.about || '')}"></label>
      <label class="opt"><input type="checkbox" id="rec-on" ${cal.recruit?.on ? 'checked' : ''}><span>지금 모집 중<small>캘린더 위와 둘러보기에 모집 안내가 보여요</small></span></label>
      <label class="field">모집 마감일<input type="date" id="rec-until" value="${esc(cal.recruit?.until || '')}"></label>
      <label class="field">모집 안내<input id="rec-note" maxlength="60" value="${esc(cal.recruit?.note || '')}"></label>`;
}

/** 참여 요청 목록 (없으면 숨김) */
function drawRequests(calId) {
  const wrap = $('req-wrap');
  if (!wrap) return;
  const requests = S.cals[calId]?.requests || [];
  wrap.hidden = !requests.length;
  $('reqs').innerHTML = requests.map(r => '<div class="req-row">'
    + `<span>${esc(r.name)}</span>`
    + `<button type="button" class="btn" data-act="req-no" data-cal="${esc(calId)}" data-id="${esc(r.id)}">거절</button>`
    + `<button type="button" class="btn primary" data-act="req-yes" data-cal="${esc(calId)}" data-id="${esc(r.id)}">수락</button>`
    + '</div>').join('');
}

/**
 * 멤버 목록. 단체 캘린더면 이름을 눌러 운영진을 지정·해제할 수 있습니다.
 * 나(만든 사람)는 뺄 수 없습니다.
 */
function drawMembers() {
  const list = $('members');
  if (!list) return;
  list.innerHTML = dlgMembers.map(id => {
    if (id === R.me) return `<button type="button" disabled>나${dlgOrg ? ' · 운영진' : ''}</button>`;
    const name = esc(R.names[id] || '멤버');
    const removeButton = `<button type="button" data-act="mem-remove" data-id="${esc(id)}"`;
    if (!dlgOrg) return `${removeButton}>${name} ×</button>`;
    const isAdmin = dlgAdmins.includes(id);
    return '<span class="mem">'
      + `<button type="button" class="${isAdmin ? 'on' : ''}" data-act="mem-admin" data-id="${esc(id)}" aria-pressed="${isAdmin}" title="눌러서 운영진 지정·해제">${name} · ${isAdmin ? '운영진' : '멤버'}</button>`
      + `${removeButton} aria-label="${name} 빼기">×</button>`
      + '</span>';
  }).join('');
}

/* ---------- 멤버 초대 (만든 사람이 아닌 운영진용) ---------- */

function inviteDialog(cal) {
  openDialog(`<form data-form="invite"><h2>${esc(cal.name)} 멤버 초대</h2>
    <div class="field">초대 코드<div class="share-row"><span class="code" id="inv-code">${esc(cal.invite || '')}</span><button type="button" class="btn" data-act="copy-code" ${cal.invite ? '' : 'disabled'}>링크 복사</button><button type="button" class="btn" data-act="new-code" data-id="${esc(cal.id)}">재발급</button></div><small>코드나 링크로 들어온 사람은 캘린더 주인이 수락하면 일반 멤버가 되어 보기만 할 수 있어요.</small></div>
    <div class="field">직접 추가<input id="mem-search" placeholder="이름이나 이메일로 찾기"><div class="people" id="mem-hits"></div><small>운영진 지정은 캘린더를 만든 사람만 할 수 있어요.</small></div>
    <div class="dlg-foot"><button type="button" class="btn" data-act="dlg-close">닫기</button></div></form>`, cal.id);
}

/* ---------- 내 설정 ---------- */

function settingsDialog() {
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 8 }, (_, i) => thisYear - i);
  openDialog(`<form data-form="settings"><h2>설정</h2>
    <label class="field">입학 연도<select id="set-entry">${years.map(y => `<option value="${y}" ${y === prefs.entry ? 'selected' : ''}>${y}년</option>`).join('')}</select><small>학년과 학기 표시에 쓰여요.</small></label>
    <hr class="dlg-sep"><h2>내 정보</h2>
    <label class="field">이름<input id="set-name" required maxlength="40" value="${esc(R.myName)}" autocomplete="name"></label>
    <label class="field">이메일<input id="set-email" type="email" required maxlength="200" value="${esc(R.myEmail)}" autocomplete="email"></label>
    <label class="field">새 비밀번호<input id="set-pw" type="password" maxlength="200" autocomplete="new-password" placeholder="바꿀 때만 입력"><small>8자 이상, 영문과 숫자를 포함해 주세요. 바꾸면 다른 기기에서는 로그아웃돼요.</small></label>
    <label class="field">현재 비밀번호<input id="set-cur" type="password" maxlength="200" autocomplete="current-password"><small>이메일이나 비밀번호를 바꿀 때 필요해요.</small></label>
    <div class="dlg-foot"><button type="button" class="btn danger" data-act="logout">로그아웃</button><button type="button" class="btn" data-act="dlg-close">취소</button><button class="btn primary" type="submit" id="set-save">저장</button></div></form>`);
}

/* ---------- 초대 코드로 참여 ---------- */

function joinDialog() {
  openDialog('<form data-form="join"><h2>초대 코드로 참여</h2><label class="field">초대 코드<input id="join-code" required maxlength="6" autocomplete="off"></label><div class="dlg-foot"><button type="button" class="btn" data-act="dlg-close">취소</button><button class="btn primary" type="submit">참여하기</button></div></form>');
}
