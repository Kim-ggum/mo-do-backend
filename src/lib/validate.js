'use strict';
// 입력값 검사와 허용 목록

/** 캘린더·기록 등의 id: 영문, 숫자, _, - 로 64자까지 */
const isId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);

/** 날짜: YYYY-MM-DD */
const isDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** 아무 값이나 문자열로 바꾸고 max 글자에서 자릅니다 (null/undefined는 빈 문자열) */
const clip = (value, max) => String(value ?? '').slice(0, max);

/** 이메일은 앞뒤 공백을 지우고 소문자로 맞춰 저장·비교합니다 */
const normalizeEmail = value => clip(value, 200).trim().toLowerCase();
const isEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/** 비밀번호: 8~200자, 영문과 숫자를 모두 포함 */
const isStrongPassword = pw => pw.length >= 8 && pw.length <= 200 && /[A-Za-z]/.test(pw) && /\d/.test(pw);
const WEAK_PASSWORD_MESSAGE = '비밀번호는 8자 이상, 영문과 숫자를 포함해 주세요.';

/** 캘린더 공개 범위: 개인 공개 / 멤버 공개 / 전체 공개 */
const VISIBILITIES = ['private', 'members', 'public'];
const CALENDAR_COLORS = ['blue', 'teal', 'green', 'amber', 'orange', 'rose', 'violet', 'slate'];

/** 기록 종류 */
const MOMENT_KINDS = ['photo', 'video', 'text'];

/** 올릴 수 있는 파일 종류 */
const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'];

module.exports = {
  isId, isDate, clip, normalizeEmail, isEmail, isStrongPassword, WEAK_PASSWORD_MESSAGE,
  VISIBILITIES, CALENDAR_COLORS, MOMENT_KINDS, UPLOAD_TYPES,
};
