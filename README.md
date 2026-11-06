# MoA (Memory of All)

대학생활 기록 웹. 외부 패키지 없이 Node.js 내장 모듈(`node:sqlite` 등)만 사용합니다.

## 요구사항
- Node.js 22.13 이상

## 실행
```bash
npm start
# → http://localhost:3000
```

환경변수를 파일로 관리하려면 `.env.example`을 `.env`로 복사한 뒤 아래처럼 실행합니다.
```bash
cp .env.example .env
node --env-file=.env server.js
```

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `3000` | 서버 포트 |
| `DATA_DIR` | `./data` | SQLite DB와 업로드 파일 저장 위치 |
| `ANTHROPIC_API_KEY` | (없음) | AI 요약용 Claude 키 (platform.claude.com에서 발급) |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | Claude 모델 |

AI 키가 없으면 AI 요약 기능만 꺼지고 나머지는 그대로 동작합니다. AI에는 기록의 글만 보내고 사진은 보내지 않습니다.

## 구조
```
├── server.js        # HTTP 서버 + REST API + SQLite
├── public/          # 프론트엔드 정적 파일
│   ├── index.html
│   └── login.html
├── data/            # 실행 시 자동 생성 (git 제외)
└── package.json
```
