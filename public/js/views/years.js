'use strict';
// "대학 4년 기록" 화면: 학기별 활동, 역량, 자소서 경험 찾기, 성장 이야기

/**
 * AI 요약이 있는 날들을 활동 이름(title)으로 묶습니다 → [{ title, kind, days: [하루 정보...] }]
 * 내가 멤버인 캘린더만, 기록이 남아 있는 날만 셉니다. 최근에 한 활동이 먼저 옵니다.
 */
function activities() {
  const byTitle = {};
  Object.values(S.days).forEach(day => {
    const cal = S.cals[day.calId];
    if (!cal || !isMember(cal) || !day.ai?.title) return;
    if (!momentsOf(day.calId, day.date).length) return;
    const activity = byTitle[day.ai.title] ||= { title: day.ai.title, kind: day.ai.kind, days: [] };
    activity.days.push(day);
  });
  return Object.values(byTitle)
    .map(a => { a.days.sort((x, y) => x.date.localeCompare(y.date)); return a; })
    .sort((a, b) => b.days.at(-1).date.localeCompare(a.days.at(-1).date));
}

/** 활동 기간: 2026.10.08 – 2026.11.04 */
const span = activity => {
  const first = activity.days[0].date, last = activity.days.at(-1).date;
  return first === last ? shortDate(first) : `${shortDate(first)} – ${shortDate(last)}`;
};

/** 한 활동에서 드러난 역량 이름 (중복 없이) */
const skillsOf = activity => [...new Set(activity.days.flatMap(d => (d.ai.skills || []).map(s => s.name)))];

/* ---------- AI 요약 표시 조각 (날짜 패널에서도 씁니다) ---------- */

/** 목적·과정·역할·성과·배운 점·경험 중 값이 있는 것만 */
const facts = ai => [['목적', ai.purpose], ['과정', ai.process], ['역할', ai.role], ['성과', ai.result], ['배운 점', ai.learned], ['경험', ai.experience]]
  .filter(([, value]) => value)
  .map(([label, value]) => `<dt>${label}</dt><dd>${esc(value)}</dd>`)
  .join('');

/** 역량과 근거 (날짜 패널용). 카드에서는 이름만 태그로 보여 줍니다 */
const skillRows = ai => (ai.skills || []).map(s => `<dt>${esc(s.name)}</dt><dd>${esc(s.evidence)}</dd>`).join('');
const skillTags = names => (names.length ? `<span class="skills">${names.map(n => `<span class="tag">${esc(n)}</span>`).join('')}</span>` : '');

/* ---------- 화면 ---------- */

function renderYears() {
  const all = activities();
  const list = V.kind === '전체' ? all : all.filter(a => a.kind === V.kind);
  const unsummarized = countUnsummarizedDays();

  const storyButton = R.ai
    ? `<button class="btn" data-act="story" ${all.length && !storyBusy ? '' : 'disabled'}>${storyBusy ? '쓰는 중' : '나의 성장 이야기 쓰기'}</button>`
    : '';
  const kindFilters = ['전체', ...KINDS]
    .map(k => `<button class="filter ${V.kind === k ? 'on' : ''}" data-act="kind" data-kind="${k}" aria-pressed="${V.kind === k}">${k}</button>`)
    .join('');

  $('main').innerHTML = `<div class="top"><div><h1>대학 4년 기록</h1><p class="sub">정리된 활동 ${all.length}개${unsummarized ? ` · 아직 요약하지 않은 날 ${unsummarized}일` : ''}</p></div>
      ${storyButton}</div>
    ${skillSummary(all)}
    <div class="find"><h2 class="section-title">자기소개서에 쓸 경험 찾기</h2>
      <form data-form="find"><input id="find-q" aria-label="자기소개서 문항이나 지원 분야" value="${esc(V.findQ)}" placeholder="자기소개서 문항이나 지원 분야를 입력하세요"><button class="btn primary" type="submit" ${findBusy ? 'disabled' : ''}>${findBusy ? '찾는 중' : '경험 찾기'}</button></form>
      ${findResults()}</div>
    ${story ? `<h2 class="section-title">나의 성장 이야기</h2><div class="story" id="story">${esc(story)}</div>` : ''}
    <div class="filters" role="group" aria-label="활동 종류">${kindFilters}</div>
    <div class="sem-grid">${semesterGrid(list)}</div>
    <h2 class="section-title">활동 카드</h2>
    ${list.length ? `<div class="cards">${list.map(a => activityCard(a)).join('')}</div>` : '<p class="sub">날짜를 열고 AI 요약을 받으면 활동 카드가 여기에 쌓여요.</p>'}`;
}

/** 기록은 있는데 아직 AI 요약이 없는 날 수 */
function countUnsummarizedDays() {
  const days = Object.values(S.moments)
    .filter(m => { const cal = S.cals[m.calId]; return cal && isMember(cal) && !dayOf(m.calId, m.date).ai; })
    .map(m => m.calId + m.date);
  return new Set(days).size;
}

/** "나의 역량": 각 역량이 드러난 활동 수 (많은 순) */
function skillSummary(all) {
  const counts = {};
  all.forEach(a => skillsOf(a).forEach(s => (counts[s] = (counts[s] || 0) + 1)));
  const list = SKILLS.filter(s => counts[s]).sort((a, b) => counts[b] - counts[a]);
  if (!list.length) return '';
  return '<h2 class="section-title">나의 역량</h2>'
    + `<div class="skill-sum">${list.map(s => `<span class="tag">${esc(s)}<b>${counts[s]}</b></span>`).join('')}</div>`
    + '<p class="sub">숫자는 그 역량이 드러난 활동 수예요. AI 요약에서 근거가 있는 것만 셌어요.</p>';
}

/** 1학년 1학기 ~ 4학년 2학기 칸. 지금 학기는 강조하고, 아직 오지 않은 학기는 흐리게 */
function semesterGrid(list) {
  const now = semesterOf(today);
  let html = '';
  for (let grade = 1; grade <= 4; grade++) {
    for (let half = 1; half <= 2; half++) {
      const items = list.flatMap(a => {
        const day = a.days.find(d => { const s = semesterOf(d.date); return s.grade === grade && s.half === half; });
        return day ? [{ a, day }] : [];
      });
      const isFuture = grade > now.grade || (grade === now.grade && half > now.half);
      const isNow = grade === now.grade && half === now.half;
      const chips = items.map(({ a, day }) => `<button class="chip" data-act="goto" data-cal="${esc(day.calId)}" data-date="${day.date}">${esc(a.title)}</button>`).join('');
      html += `<div class="sem ${isNow ? 'now' : ''} ${isFuture ? 'future' : ''}"><h3>${grade}학년 ${half}학기</h3>${chips}${isFuture ? '<span class="sub">아직 쓰지 않은 학기</span>' : ''}</div>`;
    }
  }
  return html;
}

/** 자소서 경험 찾기 결과 (찾기 전이면 빈칸) */
function findResults() {
  if (!V.find) return '';
  return `<div class="cards">${V.find.map(r => activityCard(r.a, r.reason)).join('')}</div>`
    + (V.find.length ? '' : '<p class="sub">어울리는 활동을 찾지 못했어요. 문항을 조금 바꿔 보세요.</p>');
}

/** 활동 카드: 가장 최근 날의 요약을 보여 주고, 누르면 그날로 갑니다 */
function activityCard(activity, reason) {
  const last = activity.days.at(-1);
  return `<button class="acard" data-act="goto" data-cal="${esc(last.calId)}" data-date="${last.date}">`
    + `<span class="label">${esc(activity.kind)} · ${span(activity)}</span>`
    + `<h3>${esc(activity.title)}</h3>`
    + `<span class="sub">${esc(reason || last.ai.summary)}</span>`
    + skillTags(skillsOf(activity))
    + `<dl class="facts">${facts(last.ai)}</dl>`
    + '</button>';
}
