'use strict';
// 테스트 데이터 넣기: 서버를 켠 상태에서 `npm run seed`
// 실제 API를 그대로 호출하므로 앱에서 만든 데이터와 형식이 같습니다. 여러 번 실행해도 중복되지 않습니다.
const BASE = process.env.SEED_URL || `http://localhost:${process.env.PORT || 3000}`;
const PASSWORD = 'test1234';

const USERS = {
  owner: { name: '김모도', email: 'owner@test.com', entry: 2025 },
  admin: { name: '이운영', email: 'admin@test.com', entry: 2024 },
  member: { name: '박멤버', email: 'member@test.com', entry: 2025 },
  newbie: { name: '최신입', email: 'newbie@test.com', entry: 2026 },
};

async function call(cookie, method, path, body) {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'moa', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, setCookie: res.headers.get('set-cookie') };
}
async function must(cookie, method, path, body) {
  const r = await call(cookie, method, path, body);
  if (r.status >= 400) throw new Error(`${method} ${path} → ${r.status} ${r.data.error || ''}`);
  return r.data;
}
async function login(u) {
  const s = await call(null, 'POST', '/api/auth/signup', { ...u, password: PASSWORD });
  if (s.status >= 400 && s.status !== 409) throw new Error(`가입 실패 ${u.email}: ${s.data.error}`);
  const r = await call(null, 'POST', '/api/auth/login', { email: u.email, password: PASSWORD });
  if (r.status !== 200) throw new Error(`로그인 실패 ${u.email}: ${r.data.error} (이미 있는 계정의 비밀번호가 다를 수 있어요)`);
  const cookie = /sid=[a-f0-9]+/.exec(r.setCookie)[0];
  const me = await must(cookie, 'GET', '/api/me');
  return { cookie, id: me.user.id };
}

// 기록 하나 = 글 한 개 (사진·영상은 파일 업로드가 필요해서 넣지 않습니다)
const note = (calId, date, time, text) => ({ calId, date, time, text });
const NOTES = [
  note('seed-mine', '2026-09-02', '10:20', '2학기 개강! 시간표 확정했다. 자료구조, 운영체제, 데이터베이스 듣는다.'),
  note('seed-mine', '2026-09-18', '21:40', '토익 스터디 첫 모임. 매주 목요일 저녁에 모의고사 풀기로 함.'),
  note('seed-mine', '2026-10-21', '18:05', '중간고사 끝. 운영체제가 제일 어려웠다. 스케줄링 파트 다시 정리해야 함.'),
  note('seed-mine', '2026-11-03', '15:30', '교내 해커톤 신청서 제출. 캡스톤 팀원들이랑 같이 나가기로 했다.'),

  note('seed-club', '2026-09-05', '19:00', '2학기 동아리 OT. 신입 부원 12명 들어왔고 스터디 조를 4개로 나눴다.'),
  note('seed-club', '2026-09-26', '14:00', 'Git 협업 세션 진행. 브랜치 전략이랑 PR 리뷰하는 법 실습함.'),
  note('seed-club', '2026-10-17', '13:00', '동아리 MT 다녀옴. 레크리에이션 진행 맡았는데 다들 재밌어해서 뿌듯했다.'),
  note('seed-club', '2026-11-06', '19:30', '정기 세미나: 백엔드 API 설계 발표. 질문이 많이 나와서 다음 주에 후속 세션 하기로.'),

  note('seed-team', '2026-09-12', '16:00', '캡스톤 주제 회의. 대학생활 기록 서비스로 확정. 나는 백엔드 담당.'),
  note('seed-team', '2026-10-08', '20:00', '중간 발표 준비. ERD랑 API 명세서 정리해서 교수님께 피드백 받음.'),
  note('seed-team', '2026-11-04', '17:30', '로그인, 캘린더 권한 기능 구현 완료. 다음 주부터 AI 요약 붙이기.'),
];
// AI 요약은 넣지 않습니다. 요약은 앱에서 "AI로 활동 요약"을 눌러 실제 AI로 만듭니다

async function main() {
  try { await fetch(BASE + '/api/me'); } catch { throw new Error(`서버에 연결하지 못했어요 (${BASE}). 먼저 npm start로 서버를 켜 주세요.`); }
  const u = {};
  for (const [k, info] of Object.entries(USERS)) u[k] = await login(info);

  // 캘린더: 개인 / 동아리(단체, 운영진 있음) / 캡스톤 팀(멤버 모두 기록 가능)
  await must(u.owner.cookie, 'PUT', '/api/cals/seed-mine', { name: '내 대학생활', color: 'blue', vis: 'private', members: [] });
  const club = await must(u.owner.cookie, 'PUT', '/api/cals/seed-club', { name: '코딩 동아리 MODO', color: 'violet', vis: 'public', org: '동아리',
    about: '함께 공부하고 만드는 코딩 동아리', recruit: { on: true, until: '2026-11-30', note: '2학기 추가 부원 모집 중! 초보도 환영해요.' },
    members: [u.admin.id, u.member.id], admins: [u.admin.id] });
  await must(u.owner.cookie, 'PUT', '/api/cals/seed-team', { name: '캡스톤 팀', color: 'teal', vis: 'members', members: [u.admin.id, u.member.id] });

  // 기록: 동아리는 운영진(이운영)이, 캡스톤은 팀원들이 번갈아 올립니다
  const writers = { 'seed-mine': [u.owner], 'seed-club': [u.owner, u.admin], 'seed-team': [u.owner, u.admin, u.member] };
  const count = {};
  for (const n of NOTES) {
    const i = count[n.calId] = (count[n.calId] || 0) + 1, who = writers[n.calId][(i - 1) % writers[n.calId].length];
    const id = `seed-${n.calId.slice(5)}-${n.date}`;
    await must(who.cookie, 'PUT', `/api/moments/${id}`, { calId: n.calId, date: n.date, kind: 'text', text: n.text, post: id, at: `${n.date}T${n.time}` });
  }

  // 최신입은 초대 코드로 동아리에 참여 요청만 보낸 상태 (김모도가 수락해야 함)
  await must(u.newbie.cookie, 'POST', '/api/join', { code: club.invite });

  console.log(`테스트 데이터를 넣었어요 (${BASE})
비밀번호는 모두 ${PASSWORD}
  ${USERS.owner.email}   김모도  세 캘린더의 주인, 동아리 참여 요청 1건 대기
  ${USERS.admin.email}   이운영  동아리 운영진 (기록·초대 가능)
  ${USERS.member.email}  박멤버  동아리 일반 멤버 (보기만), 캡스톤 팀원 (기록 가능)
  ${USERS.newbie.email}  최신입  동아리 참여 요청 보냄 (수락 대기)
동아리 초대 코드: ${club.invite}`);
}
main().catch(e => { console.error('실패:', e.message); process.exit(1); });
