'use strict';
// 화면 전체에서 쓰는 고정 값과 아이콘

/** 활동 종류 (AI 요약이 고르는 값, "대학 4년 기록"의 필터) */
const KINDS = ['대회', '대외활동', '학생회', '동아리', '수업', '진로', '추억', '기타'];

/** AI가 기록에서 고르는 역량 목록. 목록을 정해 두어야 4년 동안의 역량을 모아 셀 수 있습니다 */
const SKILLS = ['리더십', '협업', '커뮤니케이션', '문제 해결', '기획', '실행력', '분석력', '전문성', '창의성', '책임감'];

/** 단체 캘린더 종류. 하나를 고르면 운영진만 기록·초대할 수 있습니다 */
const ORGS = ['동아리', '학생회', '학과', '교내 단체'];

/** 캘린더 공개 범위 */
const VIS = { private: '개인 공개', members: '멤버 공개', public: '전체 공개' };

/** 캘린더 색 (CSS 변수 --c-blue 등과 짝) */
const COLORS = ['blue', 'teal', 'green', 'amber', 'orange', 'rose', 'violet', 'slate'];
const COLOR_NAMES = { blue: '파랑', teal: '청록', green: '초록', amber: '노랑', orange: '주황', rose: '분홍', violet: '보라', slate: '회색' };
const colorVar = color => `var(--c-${COLORS.includes(color) ? color : 'blue'})`;

/** 화면에 쓰는 SVG 아이콘 */
const ICON = {
  cal:'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2"/><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3"/></svg>',
  years:'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M3 13.5V2.5h7.5L13 5v8.5zM5.5 7h5M5.5 10h5"/></svg>',
  browse:'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>',
  gear:'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/></svg>',
  plus:'<svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M7 2v10M2 7h10"/></svg>',
  x:'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13"/></svg>',
  edit:'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M2.5 13.5l.7-3.2 7.6-7.6 2.5 2.5-7.6 7.6z"/></svg>',
  trash:'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M3 4.5h10M6 4.5V3h4v1.5M4 4.5l.7 9h6.6l.7-9"/></svg>',
  person:'<svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6.5" r="3.2"/><path d="M3 16c.5-3.6 3-5 6-5s5.5 1.4 6 5z"/></svg>',
  lock:'<svg class="lock" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3" role="img" aria-label="나만 보는 캘린더"><rect x="2" y="5.200" width="8" height="5.800" rx="1.300"/><path d="M4 5V3.500a2 2 0 0 1 4 0V5"/></svg>',
  down:'<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 5l4 4 4-4"/></svg>',
};
