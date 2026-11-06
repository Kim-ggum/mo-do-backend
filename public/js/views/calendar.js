'use strict';
// 가운데 달력: 월/주/일 보기

function renderCalendar() {
  const cal = S.cals[V.cal];
  const { heading, grid } = V.mode === 'month' ? monthGrid() : V.mode === 'week' ? weekGrid() : dayList();
  const title = V.cal === 'all' ? '전체 캘린더' : (cal?.name || '캘린더');
  const visitor = isVisitor();

  // 제목: 로그인했으면 눌러서 다른 캘린더로 바꾸는 메뉴, 방문자면 그냥 제목 + 시작하기 버튼
  const menu = V.menu
    ? `<div class="menu"><button data-act="cal" data-id="all">전체 캘린더</button>${myCals().map(c => `<button data-act="cal" data-id="${esc(c.id)}">${esc(c.name)}</button>`).join('')}</div>`
    : '';
  const titleArea = visitor
    ? `<h1>${esc(title)}</h1>`
    : `<button class="title-btn" data-act="menu" aria-expanded="${V.menu}"><h1>${esc(title)}</h1>${ICON.down}</button>${menu}`;

  // 모집 안내, 그리고 기록 권한이 없는 캘린더의 소개
  const recruit = cal?.recruit?.on ? recruitBanner(cal.recruit) : '';
  const info = cal && !canWrite(cal) ? `<div class="banner">${esc(cal.about || '다른 사람의 캘린더를 구경하고 있어요.')}</div>` : '';

  const modes = [['month', '월'], ['week', '주'], ['day', '일']]
    .map(([key, label]) => `<button class="${V.mode === key ? 'on' : ''}" data-act="mode" data-mode="${key}" aria-pressed="${V.mode === key}">${label}</button>`)
    .join('');

  $('main').innerHTML = `<div class="top"><div class="title-wrap">${titleArea}</div>${visitor ? '<button class="btn primary" data-act="to-auth">MoA 시작하기</button>' : ''}</div>
    ${recruit}${info}
    <div class="bar"><button class="icon-btn" data-act="prev" aria-label="이전">‹</button><h2 aria-live="polite">${esc(heading)}</h2><button class="icon-btn" data-act="next" aria-label="다음">›</button>
      <button class="btn" data-act="today">오늘</button>
      <div class="seg" role="group" aria-label="보기 단위">${modes}</div></div>
    ${grid}`;
}

function recruitBanner(recruit) {
  const until = recruit.until ? `${parse(recruit.until).getMonth() + 1}월 ${parse(recruit.until).getDate()}일까지 · ` : '';
  return `<div class="banner"><span class="tag solid">모집 중</span><span>${until}${esc(recruit.note || '새 회원을 모집합니다.')}</span></div>`;
}

const weekdayHeader = () => `<div class="dow">${DOW.map(d => `<span>${d}</span>`).join('')}</div>`;

/** 월 보기: 그달 1일이 있는 주부터 마지막 날이 있는 주까지 */
function monthGrid() {
  const first = new Date(V.y, V.m, 1);
  const start = new Date(V.y, V.m, 1 - first.getDay());
  const weeks = Math.ceil((first.getDay() + new Date(V.y, V.m + 1, 0).getDate()) / 7);
  let cells = '';
  for (let i = 0; i < weeks * 7; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells += cellHtml(ymd(date), date.getMonth() === V.m);
  }
  return { heading: `${V.y}년 ${V.m + 1}월`, grid: `<div class="cal">${weekdayHeader()}<div class="grid">${cells}</div></div>` };
}

/** 주 보기: 고른 날짜가 있는 주 (일~토) */
function weekGrid() {
  const selected = parse(V.sel);
  const start = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() - selected.getDay());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  let cells = '';
  for (let i = 0; i < 7; i++) cells += cellHtml(ymd(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)), true);
  return {
    heading: `${start.getMonth() + 1}월 ${start.getDate()}일 – ${end.getMonth() + 1}월 ${end.getDate()}일`,
    grid: `<div class="cal">${weekdayHeader()}<div class="grid wk">${cells}</div></div>`,
  };
}

/** 일 보기: 그날 기록을 캘린더별로 크게 */
function dayList() {
  const items = visibleCals().flatMap(cal => postsOf(cal.id, V.sel).map(post => ({ post, cal })));
  const grid = items.length
    ? `<div class="dayview">${items.map(({ post, cal }) => `<div><span class="label">${esc(cal.name)}</span>${post.media.map(mediaHtml).join('')}${post.text ? `<p>${esc(post.text.text)}</p>` : ''}</div>`).join('')}</div>`
    : '<div class="empty"><p>이날은 아직 기록이 없어요.</p><button class="btn" data-act="open-panel">기록 남기기</button></div>';
  return { heading: longDate(V.sel), grid };
}

/**
 * 달력 한 칸. 겉면은 이 순서로 고릅니다:
 * 전체 캘린더에서 직접 고른 썸네일 → 캘린더들의 겉면 중 사진 → 글 → 아무거나
 * 사진이 여러 장이면 대표 사진 뒤로 다른 사진 두 장까지 겹쳐 보여 줍니다.
 */
function cellHtml(date, inMonth) {
  const cals = visibleCals();
  const covers = cals.map(c => ({ c, cover: coverOf(c.id, date) })).filter(x => x.cover);
  const main = pinnedCover(date, cals) || (covers.find(x => x.cover.type === 'photo') || covers.find(x => x.cover.type === 'text') || covers[0])?.cover;

  const classes = ['cell'];
  if (!inMonth) classes.push('out');
  if (date === today) classes.push('today');
  if (date === V.sel && V.panelOpen) classes.push('sel');

  let body = '';
  if (main?.type === 'photo') {
    const otherPhotos = [...new Set(cals.flatMap(c => momentsOf(c.id, date)).filter(m => m.kind === 'photo').map(urlOf))]
      .filter(url => url !== main.url).slice(0, 2);
    const layers = otherPhotos.slice().reverse().map(url => `<img class="${url === otherPhotos[0] ? 'l1' : 'l2'}" src="${esc(url)}" alt="">`).join('');
    body = `<span class="stack">${layers}<img src="${esc(main.url)}" alt=""></span>`;
  } else if (main?.type === 'text') {
    body = `<span class="cover-text">${esc(main.text)}</span>`;
  } else if (main) {
    body = V.cal === 'all' ? '' : '<i class="mark"></i>'; // 영상만 있는 날
  }

  // 전체 캘린더에서는 그날 기록이 있는 캘린더 색 점을 찍습니다
  const dots = V.cal === 'all' && covers.length ? `<span class="day-dots">${covers.map(x => `<i style="--c:${colorVar(x.c.color)}"></i>`).join('')}</span>` : '';
  const label = esc(longDate(date)) + (covers.length ? `, ${esc(covers.map(x => x.c.name).join(', '))} 기록 있음` : '');

  return `<button class="${classes.join(' ')}" data-act="day" data-date="${date}" aria-label="${label}"><span class="cell-top"><span class="num">${parse(date).getDate()}</span>${dots}</span>${body}</button>`;
}

/** 전체 캘린더에서 이 날짜에 직접 고른 썸네일 (그 기록의 캘린더가 지금 보이는 경우만) */
function pinnedCover(date, cals) {
  if (V.cal !== 'all') return null;
  const moment = S.moments[S.allCovers[date]?.momentId];
  if (!moment || !cals.some(c => c.id === moment.calId)) return null;
  return moment.kind === 'photo' ? { type: 'photo', url: urlOf(moment) } : { type: 'text', text: moment.text };
}

/** 기록의 사진·영상 (영상은 앞 clipEnd초만 반복 재생) */
function mediaHtml(moment) {
  if (moment.kind === 'photo') return `<img src="${esc(urlOf(moment))}" alt="기록 사진" loading="lazy">`;
  if (moment.kind === 'video') return `<video src="${esc(safeUrl(moment.url))}" data-end="${Number(moment.clipEnd) || 5}" muted loop playsinline controls preload="metadata" aria-label="5초 영상"></video>`;
  return '';
}
