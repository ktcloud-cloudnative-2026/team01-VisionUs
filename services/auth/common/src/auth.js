'use strict';
const { Errors } = require('./errors');

/**
 * 사용자 식별 (JWT 검증은 Gateway 에서만 한다)
 *
 *  - 클러스터: Envoy Gateway SecurityPolicy 가 Access 토큰을 검증하고,
 *              토큰의 claim 을 헤더로 넣어 서비스에 전달한다 (claimToHeaders)
 *                sub   → x-user-id
 *                email → x-user-email
 *  - 로컬 개발: tools/dev-gateway 가 같은 일을 한다
 *
 * 서비스는 토큰을 검사하지 않고 이 헤더만 믿는다. 그래서
 *  - Gateway 는 바깥에서 들어온 x-user-* 헤더를 먼저 지운다 (위조 방지)
 *  - 서비스 파드는 NetworkPolicy 로 Gateway·내부 서비스에서 오는 요청만 받는다
 * 헤더가 없으면 Gateway 를 거치지 않은 요청으로 보고 401.
 */
const USER_HEADERS = { id: 'x-user-id', email: 'x-user-email' };

function requireUser(req, res, next) {
  const raw = req.headers[USER_HEADERS.id];
  const id = Number(raw);
  if (!raw || !Number.isSafeInteger(id) || id <= 0) return next(Errors.unauthorized());
  req.user = { id, email: req.headers[USER_HEADERS.email] || null };
  next();
}

/** 서비스 간 호출 때 사용자 정보를 그대로 넘길 헤더 */
const userHeaders = (user) => ({
  [USER_HEADERS.id]: String(user.id),
  ...(user.email ? { [USER_HEADERS.email]: user.email } : {}),
});

module.exports = { requireUser, userHeaders, USER_HEADERS };
