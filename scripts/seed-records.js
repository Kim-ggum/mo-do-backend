'use strict';
// 한 사용자에게 테스트 기록 50개 넣기: `node scripts/seed-records.js test@test.com`
// 비밀번호 없이 DB에 직접 씁니다. 서버가 켜져 있어도 됩니다. 여러 번 실행해도 중복되지 않습니다.
// AI 요약은 넣지 않습니다. 지우려면 id가 seedrec- 로 시작하는 캘린더를 삭제하면 됩니다.
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const email = (process.argv[2] || '').trim().toLowerCase();
if (!email) { console.error('사용법: node scripts/seed-records.js <이메일>'); process.exit(1); }
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const dbFile = path.join(dataDir, 'moa.db');
if (!fs.existsSync(dbFile)) { console.error(`DB가 없어요 (${dbFile}). 서버를 한 번 켠 뒤 다시 실행해 주세요.`); process.exit(1); }
const db = new DatabaseSync(dbFile);
db.exec('PRAGMA foreign_keys = ON');

const user = db.prepare('SELECT id, name FROM users WHERE email = ?').get(email);
if (!user) { console.error(`${email} 사용자가 없어요. 앱에서 먼저 회원가입해 주세요.`); process.exit(1); }

const CALS = [
  { id: 'seedrec-life', name: '1학년 대학생활', color: 'blue' },
  { id: 'seedrec-class', name: '수업', color: 'green' },
  { id: 'seedrec-club', name: '동아리 활동', color: 'violet' },
];
// [캘린더, 날짜, 시각, 글]
const L = 'seedrec-life', C = 'seedrec-class', B = 'seedrec-club';
const RECORDS = [
  [L, '2026-03-02', '09:10', '입학식. 강당이 생각보다 커서 놀랐다. 같은 과 동기들이랑 처음 인사함.'],
  [C, '2026-03-03', '11:00', '첫 수업은 프로그래밍 기초. 교수님이 과제가 매주 있다고 하셨다.'],
  [L, '2026-03-05', '18:30', '과 OT 다녀옴. 선배들이 수강신청 팁이랑 학교 맛집을 알려줬다.'],
  [B, '2026-03-10', '19:00', '동아리 박람회에서 코딩 동아리 지원서 냈다. 면접은 다음 주.'],
  [C, '2026-03-12', '15:20', '대학 글쓰기 첫 과제: 자기소개 에세이 2장. 생각보다 쓰기 어렵다.'],
  [B, '2026-03-17', '20:10', '동아리 면접 봤다. 만들어 보고 싶은 서비스를 물어봐서 일정 관리 앱 얘기함.'],
  [B, '2026-03-20', '12:30', '동아리 합격 문자 받음! 이번 학기 신입 부원은 15명이라고 한다.'],
  [C, '2026-03-24', '22:40', '프로그래밍 기초 과제 1 제출. 반복문으로 구구단 출력하기. 첫 과제라 꼼꼼히 했다.'],
  [L, '2026-03-28', '14:00', '동기들이랑 학교 근처 카페 투어. 시험 기간에 공부할 곳 미리 찾아둠.'],
  [B, '2026-04-02', '19:00', '동아리 첫 스터디. 파이썬 기초 조에 들어갔고 조장을 맡게 됐다.'],
  [C, '2026-04-07', '10:30', '미적분 퀴즈. 극한 문제에서 실수해서 아쉬웠다. 다음엔 검산하기.'],
  [B, '2026-04-09', '19:30', '스터디 조원들이랑 매주 목요일 저녁에 모이기로 정함. 진도표를 내가 만들었다.'],
  [L, '2026-04-12', '16:00', '교내 봉사 동아리 연합 행사에 친구 따라 참여. 캠퍼스 환경 정리 봉사 3시간.'],
  [C, '2026-04-15', '21:00', '대학 글쓰기 조별 발표 준비. 자료 조사 맡았고 논문 3편 요약해서 공유함.'],
  [C, '2026-04-21', '13:00', '중간고사 대비 프로그래밍 기초 문제 풀이 모임을 동기 4명이랑 만들었다.'],
  [C, '2026-04-24', '17:40', '중간고사 시작. 미적분은 생각보다 괜찮았다.'],
  [C, '2026-04-28', '12:10', '프로그래밍 기초 중간고사 끝. 재귀 문제 하나를 못 풀었다. 다시 공부하기.'],
  [L, '2026-05-01', '19:00', '중간고사 끝나고 동기들이랑 첫 회식. 과 대표가 다음 MT 일정을 공지했다.'],
  [B, '2026-05-06', '20:00', '스터디에서 미니 프로젝트 시작. 우리 조는 학식 메뉴 알림 봇을 만들기로 함.'],
  [L, '2026-05-09', '10:00', '과 MT. 레크리에이션 준비를 도왔는데 다들 즐거워해서 뿌듯했다.'],
  [B, '2026-05-13', '22:15', '학식 봇 크롤링 부분 구현. 사이트 구조가 바뀌어서 한참 헤맸다가 해결함.'],
  [L, '2026-05-16', '13:30', '대학 축제 첫날. 동아리 부스에서 간단한 코딩 체험 행사를 운영했다.'],
  [B, '2026-05-20', '19:00', '미니 프로젝트 중간 점검. 조원 한 명이 바빠서 역할을 다시 나눴다.'],
  [C, '2026-05-26', '23:30', '대학 글쓰기 최종 에세이 제출. 첨삭 받은 부분 반영해서 세 번 고쳐 씀.'],
  [B, '2026-05-29', '18:00', '학식 봇 완성해서 동아리 단톡방에 배포! 첫날 30명이 구독했다.'],
  [C, '2026-06-09', '16:00', '기말 대비 미적분 오답 노트 정리. 틀린 유형이 적분 치환에 몰려 있었다.'],
  [C, '2026-06-16', '12:00', '프로그래밍 기초 기말 프로젝트: 도서 대출 관리 프로그램. 파일 저장 기능까지 구현.'],
  [C, '2026-06-19', '18:20', '기말고사 끝. 1학기 마무리!'],
  [B, '2026-06-24', '19:00', '1학기 동아리 결산 모임. 미니 프로젝트 발표했고 우리 조가 우수 프로젝트로 뽑혔다.'],
  [L, '2026-07-03', '10:00', '여름방학 시작. 방학 목표: 웹 개발 기초, 토익 공부, 운동.'],
  [L, '2026-07-10', '20:30', 'HTML/CSS 온라인 강의 수강 시작. 매일 1시간씩 듣기로 함.'],
  [L, '2026-07-22', '09:00', '교내 여름 계절 IT 캠프 참가. 3일 동안 팀으로 간단한 웹페이지를 만들었다.'],
  [L, '2026-07-24', '17:00', 'IT 캠프 마지막 날 팀 발표. 발표를 맡았는데 떨렸지만 질문에도 잘 답했다.'],
  [L, '2026-08-05', '21:00', '토익 첫 모의고사 650점. 리스닝 파트 3, 4가 약하다.'],
  [L, '2026-08-19', '15:00', '개인 프로젝트로 내 포트폴리오 웹페이지를 만들어서 배포했다.'],
  [L, '2026-08-28', '19:30', '토익 모의고사 720점. 2주 만에 70점 올랐다.'],
  [C, '2026-09-01', '09:30', '2학기 개강. 자료구조, 이산수학, 웹프로그래밍을 듣는다.'],
  [B, '2026-09-04', '19:00', '2학기 동아리 OT. 이번에는 신입 부원 스터디 멘토를 맡았다.'],
  [C, '2026-09-09', '14:00', '웹프로그래밍 첫 과제: 반응형 자기소개 페이지. 방학 때 공부한 게 도움이 됐다.'],
  [B, '2026-09-15', '20:00', '멘토로 첫 스터디 진행. 설명하다 보니 내가 헷갈렸던 개념이 정리됐다.'],
  [C, '2026-09-22', '22:00', '자료구조 과제: 연결 리스트 구현. 포인터 개념 때문에 밤늦게까지 디버깅했다.'],
  [L, '2026-09-26', '11:00', '교내 진로 박람회. 백엔드 개발자 선배 강연이 인상 깊었다.'],
  [B, '2026-10-01', '19:00', '동아리에서 교내 해커톤 팀을 꾸렸다. 4명, 주제는 대학생 기록 서비스.'],
  [C, '2026-10-14', '18:00', '이산수학 중간고사. 증명 문제 연습한 게 효과가 있었다.'],
  [C, '2026-10-20', '23:10', '자료구조 중간고사 끝. 트리 순회 문제는 완벽하게 풀었다.'],
  [B, '2026-10-24', '09:00', '교내 해커톤 1일차. 백엔드 API 담당. 로그인이랑 기록 저장 기능 구현.'],
  [B, '2026-10-25', '16:00', '해커톤 2일차 발표. 시간 부족으로 기능 하나를 뺐지만 시연은 성공. 장려상 받았다!'],
  [L, '2026-10-30', '20:00', '해커톤 회고를 블로그에 정리했다. 다음엔 일정 관리를 더 잘해야겠다.'],
  [C, '2026-11-03', '15:30', '웹프로그래밍 팀 프로젝트 시작. 팀장을 맡아서 역할 분담표를 만들었다.'],
  [B, '2026-11-05', '19:30', '동아리 정기 세미나에서 해커톤 경험을 발표했다. 후배들이 질문을 많이 해 줬다.'],
];

const upsertCal = db.prepare(`INSERT INTO cals (id, owner, vis, invite, data) VALUES (?, ?, 'private', NULL, ?)
  ON CONFLICT(id) DO UPDATE SET data = excluded.data`);
const addMember = db.prepare('INSERT OR IGNORE INTO members (cal_id, user_id) VALUES (?, ?)');
const upsertMoment = db.prepare(`INSERT INTO moments (id, cal_id, date, by_user, secret, asset, data) VALUES (?, ?, ?, ?, 0, NULL, ?)
  ON CONFLICT(id) DO UPDATE SET cal_id = excluded.cal_id, date = excluded.date, data = excluded.data`);

db.exec('BEGIN');
try {
  for (const c of CALS) {
    const owner = db.prepare('SELECT owner FROM cals WHERE id = ?').get(c.id)?.owner;
    if (owner && owner !== user.id) throw new Error(`캘린더 ${c.id}는 다른 사용자의 것이에요.`);
    // 서버가 저장하는 캘린더 데이터와 같은 모양
    upsertCal.run(c.id, user.id, JSON.stringify({ name: c.name, color: c.color, org: '', about: '', recruit: { on: false } }));
    addMember.run(c.id, user.id);
  }
  RECORDS.forEach(([calId, date, time, text], i) => {
    const id = `seedrec-${String(i + 1).padStart(2, '0')}`;
    // 서버가 저장하는 글 기록과 같은 모양 (post가 같으면 한 게시물로 묶입니다)
    upsertMoment.run(id, calId, date, user.id, JSON.stringify({ post: id, kind: 'text', text, clipEnd: 5, at: `${date}T${time}` }));
  });
  db.exec('COMMIT');
} catch (e) { db.exec('ROLLBACK'); console.error('실패:', e.message); process.exit(1); }

const count = id => RECORDS.filter(r => r[0] === id).length;
console.log(`${user.name}(${email})에게 기록 ${RECORDS.length}개를 넣었어요.
${CALS.map(c => `  ${c.name}: ${count(c.id)}개`).join('\n')}
기간: ${RECORDS[0][1]} ~ ${RECORDS.at(-1)[1]} (AI 요약은 넣지 않았어요)`);
