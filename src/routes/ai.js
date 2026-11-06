'use strict';
// AI 요약: 화면이 만든 프롬프트(글)를 Claude에 전달하고 답을 돌려줍니다.
// 프롬프트를 화면에서 만드는 이유: 요약·성장 이야기·경험 찾기마다 필요한 기록이 화면에 이미 있기 때문입니다.
const claude = require('../services/claude');
const { HttpError } = require('../http/errors');
const { readJson } = require('../http/request');
const { sendJson } = require('../http/response');
const { rateLimit, MINUTE } = require('../http/rateLimit');
const { requireUser } = require('../auth/session');
const { clip } = require('../lib/validate');

const MAX_PROMPT_LENGTH = 30000;

module.exports = router => {
  // 사용자당 10분에 30번까지. 사진은 받지 않고 글(prompt)만 받습니다
  router.post('/api/ai', async ({ req, res, user }) => {
    requireUser(user);
    if (!claude.isEnabled()) throw new HttpError(503, 'AI 키가 설정되어 있지 않아요. README를 확인해 주세요.');
    rateLimit(`ai:${user.id}`, 30, 10 * MINUTE);

    const prompt = clip((await readJson(req)).prompt, MAX_PROMPT_LENGTH);
    if (!prompt.trim()) throw new HttpError(400, '요약할 내용이 없어요.');
    sendJson(res, 200, { text: await claude.ask(prompt) });
  });
};
