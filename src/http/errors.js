'use strict';

/**
 * 사용자에게 그대로 보여 줄 수 있는 오류.
 * 이 오류를 던지면 app.js가 { error: message }를 해당 상태 코드로 응답합니다.
 * 그 밖의 예상하지 못한 오류는 로그에 남기고 "서버 오류"로만 응답합니다.
 */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = { HttpError };
