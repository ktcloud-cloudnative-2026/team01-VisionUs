'use strict';
/**
 * auth-service : 회원가입 · 로그인 · JWT 발급 (포트 3001)
 *   POST /api/v1/auth/signup        US-01
 *   POST /api/v1/auth/login         US-02
 *   POST /api/v1/auth/refresh
 *   POST /api/v1/auth/logout        (인증 필요)
 *   GET  /api/v1/users/me           (인증 필요)
 *   GET  /api/v1/auth/.well-known/jwks.json   공개키 (JWKS)
 *
 * 토큰 발급만 한다. API 요청의 Access 토큰 검증은 Gateway(Envoy / dev-gateway)에서만 하고,
 * 이 서비스도 다른 서비스처럼 Gateway 가 넣어 준 x-user-id 로 사용자를 식별한다.
 *  - Access 토큰  : aud=homeiot          → Gateway 가 받아들이는 토큰
 *  - Refresh 토큰 : aud=homeiot-refresh  → Gateway 가 거부함. /auth/refresh 에서만 이 서비스가 확인
 */
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const {
  createService, createPool, requireUser, express, env, envInt, envSecret,
  Errors, ok, wrap, tx,
} = require('@homeiot/common');

const svc = createService('auth-service');
const { logger } = svc;
const pool = createPool(logger);

const privateKey = envSecret('JWT_PRIVATE_KEY');
const publicKey = crypto.createPublicKey(privateKey); // 개인키에서 공개키를 꺼냄 (JWKS 제공 · Refresh 토큰 확인용)
const ISSUER = env('JWT_ISSUER', 'homeiot-auth');
const AUDIENCE = env('JWT_AUDIENCE', 'homeiot');
const REFRESH_AUDIENCE = `${AUDIENCE}-refresh`;
const ACCESS_TTL = envInt('ACCESS_TOKEN_TTL_SEC', 3600);
const REFRESH_TTL = envInt('REFRESH_TOKEN_TTL_SEC', 14 * 24 * 3600);
const KID = env('JWT_KID', 'homeiot-1');

const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function signTokens(user) {
  const base = { issuer: ISSUER, algorithm: 'RS256', keyid: KID, subject: String(user.user_id) };
  const accessToken = jwt.sign({ typ: 'access', email: user.email, name: user.name }, privateKey,
    { ...base, audience: AUDIENCE, expiresIn: ACCESS_TTL });
  const refreshToken = jwt.sign({ typ: 'refresh' }, privateKey,
    { ...base, audience: REFRESH_AUDIENCE, expiresIn: REFRESH_TTL, jwtid: crypto.randomUUID() });
  return { accessToken, refreshToken, expiresIn: ACCESS_TTL };
}

async function saveRefresh(db, userId, refreshToken) {
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + make_interval(secs => $3))`,
    [userId, sha256(refreshToken), REFRESH_TTL],
  );
}

const r = express.Router();

// US-01 회원가입
r.post('/auth/signup', wrap(async (req, res) => {
  const { email, password, name } = req.body ?? {};
  const details = [];
  if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 255) details.push({ field: 'email', message: '이메일 형식이 올바르지 않습니다.' });
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) details.push({ field: 'password', message: '비밀번호는 8자 이상(72자 이하)이어야 합니다.' });
  if (typeof name !== 'string' || !name.trim() || name.length > 50) details.push({ field: 'name', message: '이름을 입력하세요 (50자 이하).' });
  if (details.length) throw Errors.invalid('입력값을 확인하세요.', details);

  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING user_id, email, name',
      [email.toLowerCase(), hash, name.trim()],
    );
    logger.info('user signed up', { userId: rows[0].user_id });
    ok(res, { userId: Number(rows[0].user_id), email: rows[0].email, name: rows[0].name }, 201);
  } catch (e) {
    if (e.code === '23505') throw Errors.emailDuplicated();
    throw e;
  }
}));

// US-02 로그인
r.post('/auth/login', wrap(async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') throw Errors.invalid('이메일과 비밀번호를 입력하세요.');
  const { rows } = await pool.query('SELECT user_id, email, name, password_hash FROM users WHERE email = $1', [email.toLowerCase()]);
  const user = rows[0];
  // 계정 존재 여부를 드러내지 않도록 같은 메시지로 응답
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw Errors.unauthorized('이메일 또는 비밀번호를 확인하세요.');
  }
  const tokens = signTokens(user);
  await saveRefresh(pool, user.user_id, tokens.refreshToken);
  ok(res, tokens);
}));

// Access 토큰 재발급 (Refresh 토큰 회전)
r.post('/auth/refresh', wrap(async (req, res) => {
  const { refreshToken } = req.body ?? {};
  if (typeof refreshToken !== 'string') throw Errors.invalid('refreshToken 이 필요합니다.');
  // Refresh 토큰은 Gateway 를 거치지 않는 공개 경로로 오므로 여기서 서명·만료를 확인 (재발급 절차의 일부)
  let payload;
  try {
    payload = jwt.verify(refreshToken, publicKey, { algorithms: ['RS256'], issuer: ISSUER, audience: REFRESH_AUDIENCE });
  } catch (e) {
    throw e.name === 'TokenExpiredError' ? Errors.tokenExpired() : Errors.unauthorized('유효하지 않은 토큰입니다.');
  }
  const result = await tx(pool, async (db) => {
    const { rowCount } = await db.query(
      `UPDATE refresh_tokens SET revoked_at = now()
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [sha256(refreshToken)],
    );
    if (rowCount === 0) throw Errors.unauthorized('폐기되었거나 만료된 토큰입니다.');
    const { rows } = await db.query('SELECT user_id, email, name FROM users WHERE user_id = $1', [payload.sub]);
    if (!rows[0]) throw Errors.unauthorized();
    const tokens = signTokens(rows[0]);
    await saveRefresh(db, rows[0].user_id, tokens.refreshToken);
    return tokens;
  });
  ok(res, result);
}));

// 로그아웃: refreshToken 을 주면 그 토큰만, 없으면 사용자의 모든 토큰 폐기
r.post('/auth/logout', requireUser, wrap(async (req, res) => {
  const { refreshToken } = req.body ?? {};
  if (typeof refreshToken === 'string') {
    await pool.query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND user_id = $2 AND revoked_at IS NULL',
      [sha256(refreshToken), req.user.id]);
  } else {
    await pool.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [req.user.id]);
  }
  ok(res, { loggedOut: true });
}));

r.get('/users/me', requireUser, wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT user_id, email, name, created_at FROM users WHERE user_id = $1', [req.user.id]);
  if (!rows[0]) throw Errors.notFound('사용자를 찾을 수 없습니다.');
  const u = rows[0];
  ok(res, { userId: Number(u.user_id), email: u.email, name: u.name, createdAt: u.created_at });
}));

r.get('/auth/.well-known/jwks.json', (req, res) => res.json({ keys: [jwk] }));

svc.app.use('/api/v1', r);
svc.start({
  port: envInt('PORT', 3001),
  readiness: () => pool.query('SELECT 1'),
  onShutdown: () => pool.end(),
});
