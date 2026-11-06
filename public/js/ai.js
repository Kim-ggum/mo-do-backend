'use strict';
// AI 기능: 하루 요약(경험·역량 포함), 성장 이야기, 자소서 경험 찾기
// 프롬프트는 여기서 만들고, 서버(/api/ai)는 Claude에 전달만 합니다. AI에는 글만 보냅니다.

const aiText = async prompt => (await api('POST', '/api/ai', { prompt })).text;

/** AI 답에서 JSON 부분만 꺼냅니다 (앞뒤에 설명이 붙어 와도 되게) */
async function aiJson(prompt) {
  const found = /\{[\s\S]*\}/.exec(await aiText(prompt));
  if (!found) throw new Error('AI 응답을 읽지 못했어요. 다시 눌러 주세요.');
  return JSON.parse(found[0]);
}

/* ---------- 하루 요약 ---------- */

/**
 * 그날 글을 활동 기록으로 정리합니다: 이름·종류·요약·목적·과정·역할·성과·배운 점·경험·역량
 * - 비밀 기록은 넣지 않습니다 (공유 캘린더의 요약은 멤버 모두에게 보이므로)
 * - 사진·영상은 보내지 않고, 있다는 사실도 알리지 않습니다
 */
async function summarize() {
  const cal = panelCal(), date = V.sel, day = dayOf(cal.id, date);
  const texts = momentsOf(cal.id, date).filter(m => !m.secret && m.kind === 'text' && m.text?.trim());
  if (!texts.length) { toast('요약할 수 있는 글이 없어요. 글 기록을 먼저 남겨 주세요.'); return; }

  summarizing = day.id;
  renderPanel();
  try {
    const result = await aiJson(summaryPrompt(cal, date, texts));
    put('days', { ...dayOf(cal.id, date), ai: cleanSummary(result) });
  } catch (e) { toast(e.message); }
  summarizing = null;
  render();
}

function summaryPrompt(cal, date, texts) {
  const knownTitles = activities().map(a => a.title).slice(0, 40); // 같은 활동은 같은 이름으로 묶이도록
  return `대학생의 하루 기록을 활동 기록으로 정리해 주세요. 기록에 없는 일을 지어내거나 과장하지 마세요. 기록에서 알 수 없는 항목은 빈 문자열로 두세요.
캘린더: ${cal.name} (${cal.org || '개인'}, ${VIS[cal.vis]})
날짜: ${date}
기록:
${texts.map(m => `글: ${m.text}`).join('\n')}
이미 있는 활동 이름: ${knownTitles.join(', ') || '없음'}. 같은 활동이면 그 이름을 그대로 쓰세요.
경험: 자기소개서에 그대로 옮길 수 있게, 기록에 나온 상황·한 일·결과를 한두 문장으로 쓰세요.
역량: [${SKILLS.join(', ')}] 중에서 기록에 근거가 분명한 것만 0~3개 고르고, 그렇게 본 근거를 기록 내용으로 한 문장 쓰세요. 근거가 약하면 고르지 마세요.
JSON만 답하세요: {"title":"활동 이름 15자 이내","kind":"${KINDS.join('|')} 중 하나","summary":"한 문장 요약","purpose":"활동의 목적","process":"과정","role":"내 역할","result":"성과","learned":"배운 점","experience":"경험","skills":[{"name":"역량 이름","evidence":"근거"}]}`;
}

/** AI 답을 저장할 모양으로 다듬습니다. 목록에 없는 종류·역량, 근거 없는 역량, 중복 역량은 버립니다 */
function cleanSummary(result) {
  const str = v => String(v || '');
  const seen = new Set();
  const skills = (Array.isArray(result.skills) ? result.skills : [])
    .filter(s => SKILLS.includes(s?.name) && str(s.evidence).trim() && !seen.has(s.name) && seen.add(s.name))
    .slice(0, 3)
    .map(s => ({ name: s.name, evidence: str(s.evidence).slice(0, 200) }));
  return {
    title: str(result.title).slice(0, 40),
    kind: KINDS.includes(result.kind) ? result.kind : '기타',
    summary: str(result.summary),
    purpose: str(result.purpose),
    process: str(result.process),
    role: str(result.role),
    result: str(result.result),
    learned: str(result.learned),
    experience: str(result.experience).slice(0, 500),
    skills,
    at: Date.now(),
  };
}

/* ---------- 성장 이야기와 경험 찾기 ---------- */

/** AI에 넘길 활동 한 줄 (가장 최근 날의 요약 기준) */
const activityLine = activity => {
  const ai = activity.days.at(-1).ai, skills = skillsOf(activity);
  const details = [ai.purpose, ai.process, ai.role, ai.result, ai.learned, ai.experience].filter(Boolean).join(' / ');
  return `${activity.title} (${activity.kind}, ${span(activity)}): ${ai.summary} ${details}${skills.length ? ` [역량: ${skills.join(', ')}]` : ''}`;
};

/** 모든 활동을 바탕으로 1인칭 성장 이야기를 씁니다. 이 브라우저에 저장해 둡니다 */
async function writeStory() {
  storyBusy = true; story = '';
  render();
  const lines = activities().slice().reverse().map(a => '- ' + activityLine(a)).join('\n'); // 오래된 활동부터
  const prompt = `대학생의 활동 기록입니다. 이 기록에서만 근거를 찾아, 이 학생이 어떻게 성장해 왔는지 다섯 문장 안쪽의 한국어 이야기로 써 주세요. 1인칭으로 쓰고, 반복되는 강점과 달라진 점을 구체적인 활동 이름과 함께 짚어 주세요. 없는 일을 만들지 마세요.\n${lines}`;
  try {
    story = await aiText(prompt);
    lsSet('moa-story', story);
  } catch (e) { toast(e.message); }
  storyBusy = false;
  render();
}

/**
 * 자소서 문항에 어울리는 활동을 최대 3개 찾습니다.
 * AI 키가 없으면 문항의 낱말이 많이 겹치는 활동을 고릅니다.
 */
async function findExperience(question) {
  V.findQ = question;
  const all = activities();
  if (!question) return;

  if (!R.ai) {
    const words = question.split(/\s+/).filter(w => w.length >= 2);
    V.find = all
      .map(a => ({ a, hits: words.filter(w => activityLine(a).includes(w)).length }))
      .filter(x => x.hits)
      .sort((x, y) => y.hits - x.hits)
      .slice(0, 3)
      .map(x => ({ a: x.a, reason: '문항의 낱말과 겹치는 활동이에요.' }));
    return renderYears();
  }

  findBusy = true;
  renderYears();
  const prompt = `자기소개서 문항 또는 지원 분야: ${question}\n\n아래 활동 중 여기에 쓰기 좋은 것을 연관성이 높은 순서로 최대 3개 고르고, 왜 어울리는지 한 문장으로 설명해 주세요. 활동 이름은 목록 그대로 쓰세요. 연관된 활동이 없으면 빈 배열을 주세요.\n${all.map(a => '- ' + activityLine(a)).join('\n')}\n\nJSON만 답하세요: {"picks":[{"title":"활동 이름","reason":"이유"}]}`;
  try {
    const result = await aiJson(prompt);
    V.find = (result.picks || [])
      .map(p => ({ a: all.find(a => a.title === p.title), reason: String(p.reason || '') }))
      .filter(x => x.a)
      .slice(0, 3);
  } catch (e) { toast(e.message); }
  findBusy = false;
  renderYears();
}
