'use strict';
// 클릭·입력·제출 이벤트를 각 동작으로 연결합니다
// 화면의 버튼은 data-act="동작 이름"을 갖고, 여기 CLICK_ACTIONS에서 그 이름으로 처리 함수를 찾습니다.

/** 전체 화면을 다시 그리기 전에 화면 상태(V)를 바꾸는 작은 도우미 */
const openCalendarView = changes => { Object.assign(V, changes); resetDraft(); render(); };

/**
 * 클릭 동작 목록. 각 함수는 (누른 요소, 그 요소의 data-id)를 받습니다.
 */
const CLICK_ACTIONS = {
  /* --- 이동 --- */
  menu: () => { V.menu = !V.menu; renderMain(); },
  cal: (el, id) => {
    const fromBrowse = V.view === 'browse';
    V.cal = id; V.view = 'calendar'; V.panelCal = null;
    resetDraft();
    // 둘러보기에서 들어오면 그 캘린더의 마지막 기록 날짜로 갑니다
    if (fromBrowse) {
      const last = Object.values(S.moments).filter(m => m.calId === id).map(m => m.date).sort().at(-1);
      if (last) { const d = parse(last); V.y = d.getFullYear(); V.m = d.getMonth(); V.sel = last; }
    }
    render();
  },
  years: () => { V.view = 'years'; render(); },
  browse: () => { V.view = 'browse'; render(); },
  'browse-filter': el => { V.browse = el.dataset.k; renderBrowse(); },
  kind: el => { V.kind = el.dataset.kind; renderYears(); },
  'to-auth': () => { location.href = `/login.html?next=${encodeURIComponent(location.pathname)}`; },
  logout: () => api('POST', '/api/auth/logout').finally(() => { location.href = '/login.html'; }),

  /* --- 사이드바 --- */
  'toggle-cal': (el, id) => { // 전체 캘린더에 보이기/숨기기
    prefs.hidden = prefs.hidden.includes(id) ? prefs.hidden.filter(x => x !== id) : [...prefs.hidden, id];
    lsSet('moa-prefs', prefs);
    render();
  },
  'new-cal': () => calDialog(null),
  'edit-cal': (el, id) => calDialog(S.cals[id]),
  'invite-cal': (el, id) => inviteDialog(S.cals[id]),
  join: () => joinDialog(),
  settings: () => settingsDialog(),

  /* --- 달력 --- */
  day: el => openCalendarView({ sel: el.dataset.date, panelOpen: true, panelCal: null }),
  goto: el => { // 활동 카드 → 전체 캘린더의 그날
    const d = parse(el.dataset.date);
    openCalendarView({ sel: el.dataset.date, y: d.getFullYear(), m: d.getMonth(), view: 'calendar', cal: 'all', mode: 'month', panelCal: el.dataset.cal, panelOpen: true });
  },
  prev: () => moveCalendar(-1),
  next: () => moveCalendar(1),
  today: () => { const d = new Date(); V.y = d.getFullYear(); V.m = d.getMonth(); V.sel = today; render(); },
  mode: el => { V.mode = el.dataset.mode; render(); },

  /* --- 날짜 패널 --- */
  'open-panel': () => { V.panelOpen = true; render(); },
  close: () => { V.panelOpen = false; resetDraft(); render(); },
  'panel-cal': (el, id) => { V.panelCal = id; resetDraft(); renderPanel(); },
  hero: (el, id) => { V.hero[el.dataset.post] = id; renderPanel(); },
  cover: (el, id) => { const cal = panelCal(); setCover(cal, V.sel, dayOf(cal.id, V.sel).cover?.id === id ? null : { kind: 'moment', id }); },
  'cover-summary': () => { const cal = panelCal(); setCover(cal, V.sel, dayOf(cal.id, V.sel).cover?.kind === 'summary' ? null : { kind: 'summary' }); },
  'all-thumb': (el, id) => pinAllCover(id),
  summarize: () => summarize(),
  story: () => writeStory(),

  /* --- 작성칸 --- */
  'open-composer': () => { draft.open = true; renderPanel(); },
  'cancel-compose': () => { resetDraft(); renderPanel(); },
  'edit-post': (el, id) => {
    const post = postsOf(panelCal().id, V.sel).find(p => p.id === id);
    draft = { ...newDraft(), open: true, edit: id, text: post?.text?.text || '' };
    renderPanel();
  },
  'del-post': (el, id) => deletePost(el, id),
  'remove-existing': (el, id) => { draft.remove.push(id); renderPanel(); },
  unattach: el => { // 새 첨부 빼기 (대표 사진 순번도 맞춰 줍니다)
    const index = Number(el.dataset.i);
    draft.files.splice(index, 1);
    if (draft.rep?.i === index) draft.rep = null;
    else if (draft.rep?.i > index) draft.rep.i--;
    renderPanel();
  },
  rep: el => { draft.rep = el.dataset.old ? { old: el.dataset.old } : { i: Number(el.dataset.i) }; renderPanel(); },
  target: (el, id) => { // 올릴 캘린더 고르기/빼기
    const current = composeTargets().map(c => c.id);
    draft.targets = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
    renderPanel();
  },

  /* --- 대화상자 --- */
  'dlg-close': () => $('dlg').close(),
  'del-cal': (el, id) => deleteCalendar(id),
  'copy-code': () => copyText(`${location.origin}/join/${$('inv-code').textContent}`),
  'copy-link': () => copyText($('pub-link').value, 'pub-link'),
  'new-code': (el, id) => reissueInviteCode(id),
  'req-yes': (el, id) => { el.disabled = true; answerRequest(el.dataset.cal, id, true); },
  'req-no': (el, id) => { el.disabled = true; answerRequest(el.dataset.cal, id, false); },
  'mem-remove': (el, id) => {
    dlgMembers = dlgMembers.filter(x => x !== id);
    dlgAdmins = dlgAdmins.filter(x => x !== id);
    drawMembers();
  },
  'mem-admin': (el, id) => {
    dlgAdmins = dlgAdmins.includes(id) ? dlgAdmins.filter(x => x !== id) : [...dlgAdmins, id];
    drawMembers();
  },
  'mem-add': (el, id) => { // 검색 결과에서 사람 고르기
    $('mem-hits').innerHTML = '';
    $('mem-search').value = '';
    // 운영진의 초대 창에서는 바로 초대하고, 캘린더 설정 창에서는 목록에만 넣었다가 저장할 때 보냅니다
    if (el.closest('[data-form="invite"]')) return inviteMember($('dlg').dataset.id, id, el.dataset.name);
    if (!dlgMembers.includes(id)) dlgMembers.push(id);
    R.names[id] = el.dataset.name;
    drawMembers();
  },
};

/** 이전/다음: 월 보기는 한 달, 주 보기는 7일, 일 보기는 하루씩 */
function moveCalendar(step) {
  if (V.mode === 'month') {
    const d = new Date(V.y, V.m + step, 1);
    V.y = d.getFullYear(); V.m = d.getMonth();
  } else {
    const d = parse(V.sel);
    d.setDate(d.getDate() + step * (V.mode === 'week' ? 7 : 1));
    V.sel = ymd(d); V.y = d.getFullYear(); V.m = d.getMonth();
  }
  render();
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  // 제목 메뉴가 열려 있으면, 메뉴 버튼이 아닌 곳을 누를 때 닫습니다
  if (V.menu && el?.dataset.act !== 'menu') {
    V.menu = false;
    if (!el) return renderMain();
  }
  if (!el) return;
  CLICK_ACTIONS[el.dataset.act]?.(el, el.dataset.id);
});

// 좁은 화면에서 패널 뒤 어두운 곳을 누르면 패널을 닫습니다
$('scrim').addEventListener('click', () => { V.panelOpen = false; resetDraft(); render(); });

document.addEventListener('input', async e => {
  if (e.target.id === 'cmp-text') draft.text = e.target.value;
  if (e.target.id === 'cmp-secret') draft.secret = e.target.checked;
  if (e.target.id === 'mem-search') { // 멤버 검색 (두 글자부터 서버가 결과를 줍니다)
    const { users } = await api('GET', `/api/users/search?q=${encodeURIComponent(e.target.value)}`).catch(() => ({ users: [] }));
    $('mem-hits').innerHTML = users.map(u => `<button type="button" data-act="mem-add" data-id="${esc(u.id)}" data-name="${esc(u.name)}">${esc(u.name)} +</button>`).join('');
  }
});

document.addEventListener('change', e => {
  if (e.target.id === 'cal-org') { dlgOrg = !!e.target.value; drawMembers(); } // 단체 종류를 바꾸면 운영진 버튼 표시
  const kind = e.target.dataset?.attach; // 사진·영상 파일 선택
  if (kind) {
    attach(kind, [...e.target.files]);
    e.target.value = '';
  }
});

// 영상은 앞 clipEnd초(최대 5초)만 반복 재생합니다
document.addEventListener('timeupdate', e => {
  const video = e.target;
  if (video.tagName === 'VIDEO' && video.currentTime >= Number(video.dataset.end || 5)) video.currentTime = 0;
}, true);

document.addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target.dataset.form;
  if (form === 'compose') compose();
  if (form === 'join') { const code = $('join-code').value; $('dlg').close(); joinByCode(code); }
  if (form === 'find') findExperience($('find-q').value.trim());
  if (form === 'settings') saveSettings();
  if (form === 'cal') saveCalendarForm(e.target);
});

addEventListener('resize', () => renderPanel());
