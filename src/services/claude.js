'use strict';
// Claude API 호출 (SDK 없이 fetch로 Messages API를 부릅니다)
const config = require('../config');
const { HttpError } = require('../http/errors');

const TIMEOUT_MS = 120e3;
const MAX_TOKENS = 16000; // 모델이 답하기 전에 생각하는 토큰도 여기에 포함되므로 넉넉하게

const isEnabled = () => !!config.ai.apiKey;

/**
 * 프롬프트(글)를 보내고 답의 글만 돌려줍니다. 사진은 보내지 않습니다.
 * 실패하면 사용자에게 보여 줄 HttpError를 던집니다.
 */
async function ask(prompt) {
  let response;
  try {
    response = await fetch(`${config.ai.baseUrl}/v1/messages`, {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'content-type': 'application/json', 'x-api-key': config.ai.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: config.ai.model, max_tokens: MAX_TOKENS, messages: [{ role: 'user', content: prompt }] }),
    });
  } catch (e) {
    // 네트워크 오류나 시간 초과
    console.error('AI 연결 오류', e.name, e.cause?.code || e.message);
    if (e.name === 'TimeoutError') throw new HttpError(504, 'AI가 너무 오래 응답하지 않아요. 잠시 뒤 다시 시도해 주세요.');
    throw new HttpError(504, 'AI 서버에 연결하지 못했어요. 다시 시도해 주세요.');
  }

  if (!response.ok) {
    console.error('Claude 오류', response.status, await response.text());
    if (response.status === 429) throw new HttpError(429, 'AI 요청이 많아요. 잠시 뒤 다시 시도해 주세요.');
    throw new HttpError(502, 'AI 응답을 받지 못했어요. 다시 시도해 주세요.');
  }

  const data = await response.json();
  if (data.stop_reason === 'refusal') throw new HttpError(422, 'AI가 이 내용은 정리할 수 없다고 했어요.');
  if (data.stop_reason === 'max_tokens') throw new HttpError(502, 'AI 응답이 너무 길어 잘렸어요. 다시 시도해 주세요.');
  return (data.content || []).filter(block => block.type === 'text').map(block => block.text).join('');
}

module.exports = { isEnabled, ask };
