# MoA (Memory of All)

대학생활 기록 웹. 외부 패키지 없이 Node.js 내장 모듈(`node:http`, `node:sqlite` 등)만 사용합니다.

## 요구사항
- Node.js 22.13 이상

## 실행
```bash
npm start          # → http://localhost:3000
npm run dev        # 코드가 바뀌면 자동 재시작 + .env 읽기
npm test           # API 테스트 (임시 DB를 써서 data/는 건드리지 않습니다)
```

환경변수는 `.env.example`을 `.env`로 복사해 채웁니다. (`npm run dev`가 읽습니다. `.env`를 고친 뒤에는 서버를 다시 켜야 합니다.)

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `3000` | 서버 포트 |
| `DATA_DIR` | `./data` | SQLite DB와 업로드 파일 저장 위치 |
| `ANTHROPIC_API_KEY` | (없음) | AI 요약용 Claude 키 (platform.claude.com에서 발급) |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | Claude 모델 |

AI 키가 없으면 AI 요약 기능만 꺼지고 나머지는 그대로 동작합니다. AI에는 기록의 글만 보내고 사진은 보내지 않습니다.

### 테스트 데이터
```bash
npm run seed                          # 서버를 켠 상태에서: 테스트 계정 4개(@test.com, 비밀번호 test1234)와 캘린더
npm run seed:records -- test@test.com # 이 계정에 기록 50개 (DB에 직접 씀)
```
운영 서버에서는 실행하지 마세요. 모두가 아는 비밀번호의 계정이 생깁니다.

## 구조

```
server.js                  시작점: 서버를 켜기만 합니다
src/
├── config.js              환경변수·폴더 경로
├── db.js                  DB 열기, 테이블 정의, 예전 DB 옮기기
├── app.js                 요청 하나의 처리 흐름 (보안 헤더 → 화면 파일 → API → 오류 응답)
├── http/                  HTTP 공통 도구
│   ├── errors.js            HttpError: 사용자에게 보여 줄 오류
│   ├── request.js           본문(JSON) 읽기, 클라이언트 IP
│   ├── response.js          JSON 응답
│   ├── rateLimit.js         요청 횟수 제한
│   ├── router.js            경로 등록과 찾기 (/api/cals/:id)
│   └── static.js            HTML·CSS·JS·로고 내보내기
├── lib/
│   ├── validate.js          입력 검사와 허용 목록
│   └── crypto.js            id·토큰·초대 코드, 비밀번호 해시
├── auth/session.js        로그인 세션 쿠키
├── domain/                규칙과 데이터 모양
│   ├── permissions.js       캘린더 권한 (만든 사람·운영진·멤버)
│   ├── views.js             DB 한 줄 → 화면에 보낼 JSON
│   ├── state.js             화면 전체 상태 (/api/state)
│   └── files.js             업로드 파일 저장·읽기 권한·정리
├── services/claude.js     Claude API 호출
└── routes/                기능별 API
    ├── auth.js              회원가입·로그인·로그아웃
    ├── account.js           내 정보, 사용자 검색, 전체 상태
    ├── calendars.js         캘린더 설정·삭제, 초대, 참여 요청
    ├── records.js           기록, 하루 정보(겉면·AI 요약), 전체 썸네일
    ├── files.js             업로드·내려받기
    └── ai.js                AI 요약 요청

public/
├── index.html             앱 화면 틀 (내용은 JS가 그림)
├── login.html             로그인·회원가입
├── css/                   app.css, login.css
├── assets/                로고 등 이미지
└── js/                    (index.html이 아래 순서로 읽음, 모두 같은 전역 범위)
    ├── utils.js             DOM·날짜·저장소·알림 도구
    ├── constants.js         활동 종류, 역량, 색, 아이콘
    ├── store.js             상태(S·V·R·draft)와 서버 저장
    ├── queries.js           상태에서 값 꺼내기 (권한, 게시물, 겉면, 학기)
    ├── views/               화면 그리기: 사이드바, 달력, 4년 기록, 둘러보기, 날짜 패널
    ├── media.js             사진·영상 첨부와 업로드
    ├── actions.js           기록 저장, 참여·초대, 설정·캘린더 저장
    ├── ai.js                AI 요약·성장 이야기·경험 찾기 (프롬프트)
    ├── dialogs.js           대화상자
    ├── events.js            클릭 동작 표(data-act → 처리 함수)와 이벤트 연결
    ├── main.js              시작
    └── login.js             로그인 화면

scripts/                   테스트 데이터 넣기
test/api.test.js           API 테스트
data/                      DB와 업로드 파일 (실행 시 생성, git 제외)
```

### API 한눈에 보기

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/auth/signup` · `/login` · `/logout` | 계정 |
| GET / PATCH | `/api/me` | 내 정보 보기 / 이름·이메일·비밀번호·입학 연도 수정 |
| GET | `/api/state` | 화면 전체 상태 (방문자는 `?cal=공개캘린더id`) |
| GET | `/api/users/search?q=` | 멤버로 추가할 사람 찾기 |
| PUT / DELETE | `/api/cals/:id` | 캘린더 만들기·설정 / 삭제 (만든 사람만) |
| POST | `/api/cals/:id/members` | 멤버 직접 초대 (운영진 이상) |
| POST | `/api/cals/:id/invite` | 초대 코드 재발급 |
| POST | `/api/join` | 초대 코드로 참여 요청 |
| POST | `/api/cals/:id/requests/:userId` | 참여 요청 수락·거절 (만든 사람만) |
| PUT / DELETE | `/api/moments/:id` | 기록 쓰기·고치기 / 지우기 |
| PUT | `/api/days/:calId_date` | 달력 겉면, AI 요약 저장 |
| PUT / DELETE | `/api/all-covers/:date` | 전체 캘린더 썸네일 |
| POST | `/api/upload` · GET `/files/:id` | 사진·영상 올리기 / 보기 |
| POST | `/api/ai` | AI에 프롬프트 전달 |

GET이 아닌 요청에는 `X-Requested-With: moa` 헤더가 있어야 합니다 (다른 사이트에서 보낸 요청 차단).
