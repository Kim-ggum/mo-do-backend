'use strict';
// 작은 도구: DOM, 글자 이스케이프, 날짜, 브라우저 저장소, 알림(toast)

/* ---------- DOM과 안전한 HTML ---------- */

const $ = id => document.getElementById(id);

/** HTML 안에 넣을 글자는 반드시 이걸로 감쌉니다 (사용자가 쓴 글이 태그로 해석되지 않게) */
const esc = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

/** 미디어 주소는 우리 서버 파일(/files/...)이나 미리보기(blob:)만 허용합니다 */
const safeUrl = url => (/^(\/files\/|blob:)/.test(url || '') ? url : '');

/** 화면에서 새로 만드는 캘린더·기록·게시물 id (예: c..., m..., p...) */
const uid = prefix => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- 날짜 ---------- */
// 날짜는 'YYYY-MM-DD' 문자열로 주고받고, 계산할 때만 Date로 바꿉니다.

const pad = n => String(n).padStart(2, '0');
const ymd = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parse = text => { const [y, m, d] = text.split('-').map(Number); return new Date(y, m - 1, d); };

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
/** 11월 6일 금요일 */
const longDate = text => { const d = parse(text); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`; };
/** 2026.11.06 */
const shortDate = text => { const d = parse(text); return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`; };
/** '2026-11-06T14:05' → '오후 2:05' */
const ampm = at => {
  const found = /T(\d\d):(\d\d)/.exec(at || '');
  if (!found) return '';
  const hour = +found[1];
  return `${hour < 12 ? '오전' : '오후'} ${hour % 12 || 12}:${found[2]}`;
};

/* ---------- 브라우저 저장소 ---------- */
// 사생활 보호 모드 등에서는 저장소가 막힐 수 있어 항상 try로 감쌉니다.

const lsGet = (key, fallback) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const lsSet = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };

/* ---------- 알림 ---------- */

let toastTimer;
/** 화면 아래에 잠깐 메시지를 띄웁니다 */
function toast(message) {
  const box = $('toast');
  box.textContent = message;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (box.hidden = true), 4200);
}
