'use strict';
// 오른쪽 날짜 패널: 그날의 기록, AI 요약, 기록 작성칸

function renderPanel() {
  const panel = $('panel');
  const isSmallScreen = matchMedia('(max-width: 1160px)').matches;
  const open = V.panelOpen && V.view === 'calendar';
  panel.hidden = !open;
  $('app').classList.toggle('no-panel', !open);
  $('scrim').hidden = !(open && isSmallScreen); // 좁은 화면에서는 패널 뒤를 어둡게
  if (!open) return;

  const cal = panelCal();
  const head = `<div class="panel-head"><div><h2>${longDate(V.sel)}</h2><p class="sub">${esc(semLabel(V.sel))}</p></div><button class="icon-btn" data-act="close" aria-label="닫기">${ICON.x}</button></div>`;
  if (!cal) {
    panel.innerHTML = head + '<div class="notice">내 캘린더의 + 버튼으로 첫 캘린더를 만들면 이날의 사진과 글을 남길 수 있어요.</div>';
    return;
  }

  const posts = postsOf(cal.id, V.sel);
  const day = dayOf(cal.id, V.sel);
  const writable = canWrite(cal);
  const postList = posts.length
    ? posts.map(post => postHtml(cal, post, day, writable)).join('')
    : (writable ? '' : '<p class="sub">이날은 기록이 없어요.</p>');

  panel.innerHTML = head + calendarTabs(cal) + postList + aiSection(cal, posts, day, writable) + panelFooter(cal, posts, writable);
}

/** 그날 기록이 있는 캘린더가 여럿이면 위쪽에 탭을 보여 줍니다 */
function calendarTabs(current) {
  const recorded = visibleCals().filter(c => momentsOf(c.id, V.sel).length);
  if (recorded.length <= 1) return '';
  const tabs = recorded.map(c => `<button class="cal-tab ${c.id === current.id ? 'on' : ''}" data-act="panel-cal" data-id="${esc(c.id)}" aria-pressed="${c.id === current.id}"><i class="ring fill" style="--c:${colorVar(c.color)}"></i>${esc(c.name)}</button>`);
  return `<div class="cal-tabs" role="group" aria-label="기록이 있는 캘린더">${tabs.join('')}</div>`;
}

/**
 * AI 요약 영역
 *  - 요약이 있으면: 제목·요약·사실·역량과 근거, (기록 권한이 있으면) 다시 요약 버튼
 *  - 없으면: AI를 쓸 수 있을 때 "AI로 활동 요약" 버튼, 키가 없으면 안내
 */
function aiSection(cal, posts, day, writable) {
  if (!posts.length) return '';
  const busy = summarizing === day.id;
  const canUseAi = R.ai && writable;

  if (!day.ai) {
    if (canUseAi) return `<button class="btn primary wide" data-act="summarize" ${busy ? 'disabled' : ''}>${busy ? '정리하는 중' : 'AI로 활동 요약'}</button>`;
    return writable ? '<div class="notice">AI 요약은 서버에 AI 키를 설정하면 쓸 수 있어요.</div>' : '';
  }

  // 사진이 있는 날에만 "요약을 달력 겉면으로" 버튼 (사진이 없으면 글이 자동으로 겉면)
  const isCover = day.cover?.kind === 'summary';
  const coverButton = writable && hasPhotoDay(cal.id, V.sel)
    ? `<button class="pick ${isCover ? 'on' : ''}" data-act="cover-summary" aria-pressed="${isCover}">${isCover ? '달력 겉면' : '겉면으로'}</button>`
    : '';
  const skills = day.ai.skills?.length ? `<span class="label">역량과 근거</span><dl class="facts wide">${skillRows(day.ai)}</dl>` : '';
  const again = canUseAi ? `<button class="btn" data-act="summarize" ${busy ? 'disabled' : ''}>${busy ? '정리하는 중' : '다시 요약'}</button>` : '';

  return '<div class="ai">'
    + `<div class="ai-head"><span class="label">AI 요약</span>${coverButton}</div>`
    + `<h3>${esc(day.ai.title)}</h3><p>${esc(day.ai.summary)}</p><dl class="facts">${facts(day.ai)}</dl>`
    + skills + again
    + '</div>';
}

/** 패널 맨 아래: 작성칸, "기록 추가" 버튼, 또는 기록 권한이 없다는 안내 */
function panelFooter(cal, posts, writable) {
  if (!writable) return `<div class="notice">${esc(cal.name)}은 ${cal.org ? '운영진' : '멤버'}만 기록할 수 있어요.</div>`;
  const composing = draft.open || draft.edit || !posts.length; // 기록이 없는 날은 작성칸을 바로 엽니다
  return composing ? composerHtml(cal, posts) : `<button class="btn wide" data-act="open-composer">${ICON.plus}기록 추가</button>`;
}

/* ---------- 게시물 ---------- */

/**
 * 게시물 하나: 큰 사진/영상(hero) + 글 + 첨부 썸네일 + 작성자
 * 겉면 버튼: "대표 사진으로"/"겉면으로"는 그 캘린더의 달력 칸, "전체 썸네일로"는 전체 캘린더의 달력 칸
 */
function postHtml(cal, post, day, writable) {
  const isCover = id => day.cover?.kind === 'moment' && day.cover.id === id;
  const isPinned = id => S.allCovers[V.sel]?.momentId === id;

  // 크게 보여 줄 첨부: 직접 고른 것 → 겉면인 것 → 첫 사진 → 첫 첨부
  const chosen = V.hero[post.id] && post.media.some(m => m.id === V.hero[post.id]) ? V.hero[post.id] : null;
  const heroId = chosen || (post.media.find(m => isCover(m.id)) || post.media.find(m => m.kind === 'photo') || post.media[0])?.id;
  const hero = post.media.find(m => m.id === heroId);

  const coverButton = (id, label, onLabel) => (writable
    ? `<button class="pick ${isCover(id) ? 'on' : ''}" data-act="cover" data-id="${esc(id)}" aria-pressed="${isCover(id)}">${isCover(id) ? onLabel : label}</button>`
    : '');
  const pinButton = id => (V.cal === 'all'
    ? `<button class="pick ${isPinned(id) ? 'on' : ''}" data-act="all-thumb" data-id="${esc(id)}" aria-pressed="${isPinned(id)}">${isPinned(id) ? '전체 썸네일' : '전체 썸네일로'}</button>`
    : '');

  const heroHtml = hero
    ? `<div class="hero">${mediaHtml(hero)}${hero.kind === 'photo' ? `<div class="hero-picks">${coverButton(hero.id, '대표 사진으로', '대표 사진')}${pinButton(hero.id)}</div>` : ''}</div>`
    : '';

  // 그날 사진이 없으면 글이 자동으로 겉면이 되므로 썸네일 버튼을 보여 주지 않습니다
  const textPicks = hasPhotoDay(cal.id, V.sel) ? `<div class="text-picks">${coverButton(post.text?.id, '겉면으로', '달력 겉면')}${pinButton(post.text?.id)}</div>` : '';
  const textHtml = post.text ? `<div class="post-text"><p>${esc(post.text.text)}</p>${textPicks}</div>` : '';

  // 첨부가 여러 개거나 영상이 있으면 썸네일 줄을 보여 줍니다 (눌러서 크게 보기)
  const thumb = m => `<button class="tn ${m.id === heroId ? 'on' : ''}" data-act="hero" data-post="${esc(post.id)}" data-id="${esc(m.id)}" aria-label="${m.kind === 'photo' ? '사진' : '영상'} 크게 보기">`
    + (m.kind === 'photo'
      ? `<img src="${esc(urlOf(m))}" alt="">`
      : `<video src="${esc(safeUrl(m.url))}" muted preload="metadata"></video><span>▶</span><em>0:${pad(Math.round(m.clipEnd || 5))}</em>`)
    + '</button>';
  const attachments = post.media.length > 1 || post.media.some(m => m.kind === 'video')
    ? `<div class="attach-wrap"><span class="label">첨부 파일</span><div class="thumbs">${post.media.map(thumb).join('')}</div></div>`
    : '';

  const editButtons = canEditPost(cal, post)
    ? `<button class="icon-btn" data-act="edit-post" data-id="${esc(post.id)}" aria-label="기록 수정">${ICON.edit}</button><button class="icon-btn" data-act="del-post" data-id="${esc(post.id)}" aria-label="기록 삭제">${ICON.trash}</button>`
    : '';
  const meta = [ampm(post.at), post.secret ? '비밀 기록' : '', post.media.some(m => m.temp) ? '영상은 새로고침하면 사라져요' : ''].filter(Boolean).join(' · ');
  const author = `<div class="who"><span class="avatar">${ICON.person}</span><div>${esc(post.name)}<small>${esc(meta)}</small></div>${editButtons}</div>`;

  return `<article class="post">${heroHtml}${textHtml}${attachments}${author}</article>`;
}

/* ---------- 작성칸 ---------- */

/** 새 기록 쓰기 또는 기존 게시물 고치기 */
function composerHtml(cal, posts) {
  const editing = !!draft.edit;
  const post = editing ? posts.find(p => p.id === draft.edit) : null;
  const keptMedia = post ? post.media.filter(m => !draft.remove.includes(m.id)) : [];
  const targets = composeTargets();
  const canBeSecret = !editing && targets.some(c => c.vis !== 'private'); // 나만 보는 캘린더에는 비밀 옵션이 필요 없음

  const photoCount = keptMedia.filter(m => m.kind === 'photo').length + draft.files.filter(f => f.kind === 'photo').length;
  const pending = keptMedia.length || draft.files.length
    ? `<div class="pending">${keptMedia.map(existingThumb).join('')}${draft.files.map(newFileThumb).join('')}</div>`
    : '';

  return `<form class="composer" data-form="compose"><label class="t" for="cmp-text">${editing ? '기록 수정' : '이날의 기록'}</label>
    ${editing ? '' : targetPicker(targets)}
    <textarea id="cmp-text" placeholder="오늘 있었던 일을 한 줄만 적어도 충분해요">${esc(draft.text)}</textarea>
    ${pending}
    ${photoCount > 1 ? '<span class="label">사진을 눌러 대표 사진을 고르세요.</span>' : ''}
    <div class="attach"><input id="cmp-photo" type="file" accept="image/*" multiple data-attach="photo"><label class="btn" for="cmp-photo">사진</label>
      <input id="cmp-video" type="file" accept="video/*" data-attach="video"><label class="btn" for="cmp-video">5초 영상</label></div>
    ${canBeSecret ? `<label class="check"><input type="checkbox" id="cmp-secret" ${draft.secret ? 'checked' : ''}>비밀 기록, 나만 볼 수 있어요</label>` : ''}
    <div class="row-end">${posts.length || editing ? '<button type="button" class="btn" data-act="cancel-compose">취소</button>' : ''}<button class="btn primary" type="submit" id="cmp-send">${editing ? '저장' : '남기기'}</button></div></form>`;
}

/** 전체 캘린더에서 새로 쓸 때: 올릴 캘린더를 여러 개 고르는 탭 (기록할 수 있는 캘린더가 둘 이상일 때) */
function targetPicker(targets) {
  const choices = myCals().filter(canWrite);
  if (V.cal !== 'all' || choices.length <= 1) return '';
  const tabs = choices.map(c => {
    const on = targets.some(t => t.id === c.id);
    return `<button type="button" class="cal-tab ${on ? 'on' : ''}" data-act="target" data-id="${esc(c.id)}" aria-pressed="${on}"><i class="ring fill" style="--c:${colorVar(c.color)}"></i>${esc(c.name)}</button>`;
  });
  return `<div class="targets"><span class="label">올릴 캘린더, 여러 개 고를 수 있어요</span><div class="cal-tabs" role="group" aria-label="올릴 캘린더">${tabs.join('')}</div></div>`;
}

/** 이미 올린 첨부 (고칠 때). 사진을 누르면 대표 사진, ×는 빼기 */
function existingThumb(moment) {
  const isRep = draft.rep?.old === moment.id;
  const content = moment.kind === 'photo'
    ? `<button type="button" class="rep-btn" data-act="rep" data-old="${esc(moment.id)}" aria-pressed="${isRep}" aria-label="대표 사진으로 고르기"><img src="${esc(urlOf(moment))}" alt=""></button>${isRep ? '<em>대표</em>' : ''}`
    : '영상';
  return `<div class="${isRep ? 'rep' : ''}">${content}<button type="button" class="x" data-act="remove-existing" data-id="${esc(moment.id)}" aria-label="첨부 빼기">×</button></div>`;
}

/** 새로 첨부한 파일 (아직 올리기 전) */
function newFileThumb(file, index) {
  const isRep = draft.rep?.i === index;
  const content = file.kind === 'photo'
    ? `<button type="button" class="rep-btn" data-act="rep" data-i="${index}" aria-pressed="${isRep}" aria-label="대표 사진으로 고르기"><img src="${esc(file.preview)}" alt=""></button>${isRep ? '<em>대표</em>' : ''}`
    : '5초 영상';
  return `<div class="${isRep ? 'rep' : ''}">${content}<button type="button" class="x" data-act="unattach" data-i="${index}" aria-label="첨부 빼기">×</button></div>`;
}
