'use strict';
// 시작: 로그인 확인 → 상태 불러오기 → 첫 화면 → 8초마다 새로 읽기

const REFRESH_MS = 8000;

async function start() {
  const { user, ai } = await api('GET', '/api/me');
  R.ai = ai;

  // 주소 모양: /c/캘린더id (공개 캘린더 링크), /join/초대코드 (초대 링크)
  const publicCal = /^\/c\/([A-Za-z0-9_-]+)$/.exec(location.pathname)?.[1];
  const inviteCode = /^\/join\/([A-Za-z0-9_-]+)$/.exec(location.pathname)?.[1];
  const goToLogin = () => location.replace(`/login.html?next=${encodeURIComponent(location.pathname)}`);

  // 방문자는 공개 캘린더 링크로만 볼 수 있습니다
  if (!user && !publicCal) return goToLogin();
  if (user) {
    R.me = user.id; R.myName = user.name; R.myEmail = user.email;
    prefs.entry = user.entry;
  }

  await loadState(publicCal);
  if (publicCal) {
    if (!S.cals[publicCal]) {
      if (!user) return goToLogin();
      toast('볼 수 없는 캘린더예요.');
    } else {
      // 공개 캘린더는 마지막 기록이 있는 달을 먼저 보여 줍니다
      V.cal = publicCal;
      const last = Object.values(S.moments).filter(m => m.calId === V.cal).map(m => m.date).sort().at(-1);
      if (last) { const d = parse(last); V.y = d.getFullYear(); V.m = d.getMonth(); V.sel = last; }
    }
  }
  render();

  if (inviteCode) {
    await joinByCode(inviteCode);
    history.replaceState(null, '', '/');
  }

  // 다른 멤버의 기록이 보이도록 주기적으로 새로 읽습니다 (탭이 안 보이거나 저장 중이면 건너뜀)
  setInterval(() => {
    if (document.hidden || R.pending || !R.me) return;
    api('GET', '/api/state')
      .then(data => { if (!R.pending) { applyState(data); softRender(); } })
      .catch(() => {});
  }, REFRESH_MS);
}

start().catch(() => toast('서버에 연결하지 못했어요. 새로고침해 주세요.'));
