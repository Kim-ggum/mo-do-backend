'use strict';
// 왼쪽 사이드바: 메뉴와 내 캘린더 목록

function renderSide() {
  const navButton = (act, icon, label, active) =>
    `<button class="nav ${active ? 'on' : ''}" data-act="${act}" ${act === 'cal' ? 'data-id="all"' : ''}>${icon}${label}</button>`;

  const calendarRows = myCals().map(sidebarRow).join('') || '<p class="hint">캘린더를 만들어 보세요</p>';
  const waitingList = R.waiting.map(w => `<p class="hint">수락 대기 중 · ${esc(w.name)}</p>`).join('');

  $('side').innerHTML = `<div class="logo"><img src="/assets/img.png" alt=""><b>MoA</b></div>
    ${navButton('cal', ICON.cal, '전체 캘린더', V.cal === 'all' && V.view === 'calendar')}
    ${navButton('years', ICON.years, '대학 4년 기록', V.view === 'years')}
    ${navButton('browse', ICON.browse, '둘러보기', V.view === 'browse')}
    <div class="group">`
      + `<div class="group-head"><span>내 캘린더</span><button class="icon-btn" data-act="new-cal" aria-label="캘린더 만들기">${ICON.plus}</button></div>`
      + calendarRows
      + '<button class="join-btn" data-act="join">초대 코드로 참여</button>'
      + waitingList
    + `</div>
    <div class="side-foot">${navButton('settings', ICON.gear, '설정', false)}</div>`;
}

/**
 * 캘린더 한 줄: [전체 캘린더 표시 점] [이름 + 자물쇠] [참여 요청 수] [설정 또는 초대 버튼]
 *  - 만든 사람: 설정(톱니) 버튼, 참여 요청이 있으면 빨간 숫자
 *  - 초대 권한이 있는 운영진: 초대(+) 버튼
 */
function sidebarRow(cal) {
  const id = esc(cal.id), name = esc(cal.name);
  const hidden = prefs.hidden.includes(cal.id);
  const active = V.cal === cal.id && V.view === 'calendar';

  const toggle = `<button class="dot-btn" style="--c:${colorVar(cal.color)}" data-act="toggle-cal" data-id="${id}" aria-label="${name} 전체 캘린더에 ${hidden ? '표시' : '숨기기'}" aria-pressed="${!hidden}"><i class="ring ${hidden ? '' : 'fill'}"></i></button>`;
  const title = `<button class="cal-name" data-act="cal" data-id="${id}">${name}${isLocked(cal) ? ICON.lock : ''}</button>`;
  const requests = isOwner(cal) && cal.requests.length
    ? `<button class="req-badge" data-act="edit-cal" data-id="${id}" aria-label="참여 요청 ${cal.requests.length}건">${cal.requests.length}</button>`
    : '';

  let action = '';
  if (isOwner(cal)) action = `<button class="icon-btn row-gear" data-act="edit-cal" data-id="${id}" aria-label="${name} 설정">${ICON.gear}</button>`;
  else if (cal.canInvite && cal.vis !== 'private') action = `<button class="icon-btn row-gear" data-act="invite-cal" data-id="${id}" aria-label="${name} 멤버 초대">${ICON.plus}</button>`;

  return `<div class="cal-row ${active ? 'on' : ''}">${toggle}${title}${requests}${action}</div>`;
}
