'use strict';
// "둘러보기" 화면: 전체 공개 캘린더 목록 (모집 중인 캘린더가 먼저)

const BROWSE_FILTERS = {
  '전체': () => true,
  '단체': cal => !!cal.org,
  '모집 중': cal => !!cal.recruit?.on,
  '학생': cal => !cal.org,
};

function renderBrowse() {
  const recruitingFirst = (a, b) => (b.recruit?.on ? 1 : 0) - (a.recruit?.on ? 1 : 0);
  const cards = allCals()
    .filter(cal => cal.vis === 'public')
    .filter(BROWSE_FILTERS[V.browse])
    .sort(recruitingFirst)
    .map(browseCard)
    .join('');

  const filters = Object.keys(BROWSE_FILTERS)
    .map(k => `<button class="filter ${V.browse === k ? 'on' : ''}" data-act="browse-filter" data-k="${k}" aria-pressed="${V.browse === k}">${k}</button>`)
    .join('');

  $('main').innerHTML = `<div class="top"><div><h1>둘러보기</h1><p class="sub">다른 학생과 교내 단체가 실제로 해 온 활동을 캘린더로 봅니다.</p></div></div>
    <div class="filters" role="group" aria-label="보기">${filters}</div>
    ${cards ? `<div class="cards">${cards}</div>` : '<p class="sub">아직 공개된 캘린더가 없어요.</p>'}`;
}

/** 캘린더 카드: 최근 사진 4장, 단체 종류·모집 표시, 소개, 기록한 날 수 */
function browseCard(cal) {
  const moments = Object.values(S.moments).filter(m => m.calId === cal.id).sort((a, b) => b.date.localeCompare(a.date));
  const photos = moments.filter(m => m.kind === 'photo').slice(0, 4);
  const dayCount = new Set(moments.map(m => m.date)).size;

  const strip = Array.from({ length: 4 }, (_, i) => (photos.at(i) ? `<img src="${esc(urlOf(photos.at(i)))}" alt="">` : '<i></i>')).join('');
  const tags = `<span class="tag">${esc(cal.org || '학생')}</span>${cal.recruit?.on ? '<span class="tag solid">모집 중</span>' : ''}`;
  const description = cal.recruit?.on ? (cal.recruit.note || '') : (cal.about || `기록 ${dayCount}일`);
  const latest = moments[0] ? ` · 최근 ${shortDate(moments[0].date)}` : '';

  return `<button class="acard" data-act="cal" data-id="${esc(cal.id)}">`
    + `<span class="strip">${strip}</span>`
    + `<span class="ccard-meta">${tags}</span>`
    + `<h3>${esc(cal.name)}</h3>`
    + `<span class="sub">${esc(description)}</span>`
    + `<span class="label">기록 ${dayCount}일${latest}</span>`
    + '</button>';
}
