'use strict';
// 사용자 동작 처리: 기록 남기기, 겉면·썸네일, 참여·초대, 설정 저장, 캘린더 저장·삭제

/* ---------- 기록 ---------- */

/**
 * 작성칸의 내용을 저장합니다.
 *  - 새 기록: 고른 캘린더마다 게시물 하나 (첨부는 한 번만 올리고 여러 캘린더에서 같이 씁니다)
 *  - 고치기: 첨부 추가·빼기, 글 수정·삭제
 * 게시물 = 같은 post 값을 가진 기록들 (첨부마다 기록 하나, 글 기록 하나)
 */
async function compose() {
  const editing = draft.edit;
  const targets = composeTargets().filter(canWrite);
  if (!targets.length) { toast('기록할 캘린더를 골라 주세요.'); return; }
  const text = draft.text.trim();
  if (!editing && !text && !draft.files.length) { toast('글을 쓰거나 사진, 영상을 추가해 주세요.'); return; }

  const sendButton = $('cmp-send');
  if (sendButton) { sendButton.disabled = true; sendButton.textContent = '올리는 중'; }

  const date = V.sel;
  const uploaded = new Map(); // 첨부 순번 → 올린 결과 (캘린더가 여러 개여도 한 번만 올림)
  try {
    for (const cal of targets) {
      const postId = editing || uid('p');
      const old = editing ? postsOf(cal.id, date).find(p => p.id === editing) : null;
      const secret = old ? old.secret : !!draft.secret && cal.vis !== 'private';
      // 기록마다 시각을 1ms씩 늘려 순서를 지킵니다
      const base = order => {
        const fields = { calId: cal.id, date, post: postId, by: R.me, at: old?.at || new Date(Date.now() + order).toLocaleString('sv').replace(' ', 'T') };
        if (secret) fields.secret = true;
        return fields;
      };

      let order = 0, representativeId = draft.rep?.old || null;
      for (const [index, file] of draft.files.entries()) {
        if (!uploaded.has(index)) uploaded.set(index, await storeFile(file));
        const id = uid('m');
        await put('moments', { ...base(order++), id, kind: file.kind, ...uploaded.get(index) });
        if (draft.rep?.i === index) representativeId = id;
      }

      if (old) {
        draft.remove.forEach(id => S.moments[id] && drop('moments', S.moments[id]));
        if (old.text && !text) drop('moments', old.text);
        else if (old.text) put('moments', { ...old.text, text });
        else if (text) put('moments', { ...base(order++), id: uid('m'), kind: 'text', text });
      } else if (text) {
        put('moments', { ...base(order++), id: uid('m'), kind: 'text', text });
      }

      // 고른 대표 사진을 그날 달력 겉면으로
      if (representativeId) put('days', { ...dayOf(cal.id, date), cover: { kind: 'moment', id: representativeId } });
    }
    if (!editing) V.panelCal = targets[0].id;
    if (targets.length > 1) toast(`${targets.length}개 캘린더에 올렸어요.`);
    resetDraft();
  } catch (e) { toast(e.message); }
  render();
}

/** 게시물 삭제: 두 번 눌러야 지워집니다 (첫 번째는 버튼을 빨갛게) */
function deletePost(button, postId) {
  if (button.dataset.sure !== '1') {
    button.dataset.sure = '1';
    button.style.color = 'var(--danger)';
    toast('한 번 더 누르면 이 기록이 지워져요.');
    return;
  }
  momentsOf(panelCal().id, V.sel).filter(m => postKey(m) === postId).forEach(m => drop('moments', m));
  render();
}

/* ---------- 겉면과 썸네일 ---------- */

/** 그 캘린더의 달력 칸 겉면. null이면 자동(첫 사진 → 첫 글) */
function setCover(cal, date, cover) {
  put('days', { ...dayOf(cal.id, date), cover });
  render();
}

/** 전체 캘린더의 달력 칸 썸네일. 같은 걸 다시 누르면 해제 */
function pinAllCover(momentId) {
  const current = S.allCovers[V.sel];
  if (current?.momentId === momentId) drop('allCovers', current);
  else put('allCovers', { id: V.sel, date: V.sel, momentId });
  render();
}

/* ---------- 참여와 초대 ---------- */

/** 초대 코드로 참여 요청. 이미 멤버면 그 캘린더로 이동합니다 */
async function joinByCode(raw) {
  const code = raw.trim().toUpperCase();
  if (!code) return;
  try {
    const result = await api('POST', '/api/join', { code });
    await loadState();
    if (result.pending) {
      toast(`${result.name}에 참여 요청을 보냈어요. 캘린더 주인이 수락하면 볼 수 있어요.`);
    } else {
      V.cal = result.cal.id; V.view = 'calendar'; V.panelCal = null;
      toast(`이미 ${result.cal.name}의 멤버예요.`);
    }
  } catch (e) { toast(e.message); }
  render();
}

/** 참여 요청 수락/거절 (캘린더 설정 창에서) */
async function answerRequest(calId, userId, accept) {
  try {
    S.cals[calId] = normalizeCalendar(await api('POST', `/api/cals/${calId}/requests/${userId}`, { accept }));
    // 설정 창을 이어서 저장해도 방금 수락한 멤버가 빠지지 않게 목록에 넣어 둡니다
    if (accept && !dlgMembers.includes(userId)) dlgMembers.push(userId);
    drawRequests(calId);
    drawMembers();
    renderSide();
    toast(accept ? '참여를 수락했어요.' : '참여 요청을 거절했어요.');
  } catch (e) { toast(e.message); }
}

/** 운영진의 직접 초대 (멤버 초대 창에서) */
async function inviteMember(calId, userId, name) {
  try {
    S.cals[calId] = normalizeCalendar(await api('POST', `/api/cals/${calId}/members`, { userId }));
    R.names[userId] = name;
    toast(`${name}님을 초대했어요.`);
    render();
  } catch (e) { toast(e.message); }
}

/** 초대 코드 재발급 */
async function reissueInviteCode(calId) {
  try {
    const { invite } = await api('POST', `/api/cals/${calId}/invite`);
    S.cals[calId].invite = invite;
    $('inv-code').textContent = invite;
    toast('새 코드를 만들었어요.');
  } catch (e) { toast(e.message); }
}

/** 클립보드 복사. 막혀 있으면 입력칸을 선택해 직접 복사하게 합니다 */
async function copyText(text, inputId) {
  try {
    await navigator.clipboard.writeText(text);
    toast('복사했어요.');
  } catch {
    const input = inputId && $(inputId);
    if (input) { input.focus(); input.select(); }
    toast('복사하지 못했어요. 표시된 내용을 직접 복사해 주세요.');
  }
}

/* ---------- 내 설정 ---------- */

/** 설정 창 저장: 입학 연도, 이름, 이메일, 비밀번호 */
async function saveSettings() {
  const body = { entry: Number($('set-entry').value), name: $('set-name').value.trim(), email: $('set-email').value.trim() };
  const newPassword = $('set-pw').value, currentPassword = $('set-cur').value;
  if (newPassword) body.newPassword = newPassword;
  if (currentPassword) body.currentPassword = currentPassword;

  const changingLogin = newPassword || body.email.toLowerCase() !== R.myEmail;
  if (changingLogin && !currentPassword) {
    toast('이메일이나 비밀번호를 바꾸려면 현재 비밀번호를 입력해 주세요.');
    $('set-cur').focus();
    return;
  }

  $('set-save').disabled = true;
  try {
    const { user } = await api('PATCH', '/api/me', body);
    R.myName = user.name; R.myEmail = user.email; R.names[R.me] = user.name;
    prefs.entry = user.entry;
    lsSet('moa-prefs', prefs);
    $('dlg').close();
    render();
    toast('저장했어요.');
  } catch (e) {
    toast(e.message);
    $('set-save').disabled = false;
  }
}

/* ---------- 캘린더 ---------- */

/** 캘린더 설정 창의 저장 버튼: 새로 만들거나 기존 설정을 저장합니다 */
function saveCalendarForm(form) {
  const name = $('cal-name').value.trim();
  if (!name) return;
  const id = $('dlg').dataset.id;
  const color = form.querySelector('[name=color]:checked')?.value || 'blue';
  const visibility = form.querySelector('[name=vis]:checked')?.value;

  if (id) {
    const cal = { ...S.cals[id], name, color };
    cal.members = dlgMembers;
    cal.admins = dlgAdmins.filter(x => dlgMembers.includes(x));
    cal.vis = visibility === 'private' && dlgMembers.length > 1 ? 'members' : visibility; // 멤버가 있으면 개인 공개일 수 없음
    if ($('cal-org')) { // 전체 공개 캘린더에만 있는 칸들
      cal.org = $('cal-org').value;
      cal.about = $('cal-about').value.trim();
      cal.recruit = { on: $('rec-on').checked, until: $('rec-until').value, note: $('rec-note').value.trim() };
    }
    put('cals', cal);
    track(api('GET', '/api/state').then(applyState), render); // 권한·초대 코드 등 서버가 정한 값을 다시 받습니다
  } else {
    const cal = normalizeCalendar({ id: uid('c'), name, color, vis: visibility, members: [R.me], by: R.me, role: 'owner' });
    createCalendar(cal);
    V.cal = cal.id; V.view = 'calendar';
    resetDraft();
  }
  $('dlg').close();
  render();
}

/** 새 캘린더: 화면에 먼저 보여 주고, 서버가 돌려준 값(초대 코드 등)으로 바꿉니다 */
function createCalendar(cal) {
  track(api('PUT', `/api/cals/${cal.id}`, cal).then(saved => { S.cals[cal.id] = normalizeCalendar(saved); render(); }));
  S.cals[cal.id] = cal;
}

/** 캘린더 삭제: 두 번 눌러야 지워집니다 */
function deleteCalendar(id) {
  const cal = S.cals[id];
  if (!cal) return;
  const button = document.querySelector('[data-act="del-cal"]');
  if (button.dataset.sure !== '1') {
    button.dataset.sure = '1';
    button.textContent = '기록까지 모두 삭제';
    return;
  }
  Object.values(S.moments).filter(m => m.calId === id).forEach(m => delete S.moments[m.id]);
  Object.values(S.days).filter(d => d.calId === id).forEach(d => delete S.days[d.id]);
  drop('cals', cal);
  if (V.cal === id) V.cal = 'all';
  $('dlg').close();
  render();
  toast('캘린더를 삭제했어요.');
}
