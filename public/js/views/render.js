'use strict';
// 화면 전체 다시 그리기
// 이 앱은 상태(S, V, R, draft)가 바뀌면 해당 영역의 HTML을 통째로 다시 만듭니다.

/** 방문자(로그인 안 함)는 사이드바 없이 보여 줍니다 */
function showRoot() {
  $('app').classList.toggle('visitor', isVisitor());
}

/** 가운데 영역: 지금 보기(V.view)에 맞는 화면 */
function renderMain() {
  if (V.view === 'years') renderYears();
  else if (V.view === 'browse') renderBrowse();
  else renderCalendar();
}

function render() {
  showRoot();
  renderSide();
  renderMain();
  renderPanel();
}

/** 주기적 새로고침용: 사용자가 입력 중인 칸이 있는 영역은 다시 그리지 않습니다 */
function softRender() {
  showRoot();
  renderSide();
  if (document.activeElement?.id !== 'find-q') renderMain();
  if (document.activeElement?.id !== 'cmp-text') renderPanel();
}
