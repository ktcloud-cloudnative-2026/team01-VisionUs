'use strict';
const { AppError, Errors } = require('./errors');
const { userHeaders } = require('./auth');

/**
 * 서비스 간 REST 호출 (동기, 클러스터 내부 · Gateway 를 거치지 않음)
 * 요청한 사용자 정보(x-user-id, x-user-email)를 그대로 전달해서
 * 상대 서비스가 소유권(본인 기기 여부)을 판단하게 한다.
 * 상대가 공통 에러 형식으로 응답하면 같은 상태/코드로 다시 던진다.
 */
async function callService(baseUrl, path, { user, method = 'GET', body, timeoutMs = 3000 } = {}) {
  let res;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(user ? userHeaders(user) : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw Errors.upstream();
  }
  const json = await res.json().catch(() => null);
  if (res.ok && json?.success) return json.data;
  if (json?.error?.code) throw new AppError(res.status, json.error.code, json.error.message);
  throw Errors.upstream();
}

module.exports = { callService };
