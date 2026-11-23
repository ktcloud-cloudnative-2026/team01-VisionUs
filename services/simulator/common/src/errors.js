'use strict';
/**
 * API 명세서 2.2 / 2.3 공통 응답 형식과 에러 코드
 */
class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const Errors = {
  invalid: (msg = '요청 형식이 올바르지 않습니다.', details) => new AppError(400, 'INVALID_REQUEST', msg, details),
  unauthorized: (msg = '인증이 필요합니다.') => new AppError(401, 'UNAUTHORIZED', msg),
  tokenExpired: () => new AppError(401, 'TOKEN_EXPIRED', '토큰이 만료되었습니다.'),
  forbidden: (msg = '해당 리소스에 대한 권한이 없습니다.') => new AppError(403, 'FORBIDDEN', msg),
  deviceNotFound: () => new AppError(404, 'DEVICE_NOT_FOUND', '기기를 찾을 수 없습니다.'),
  notFound: (msg = '리소스를 찾을 수 없습니다.') => new AppError(404, 'NOT_FOUND', msg),
  deviceOffline: () => new AppError(409, 'DEVICE_OFFLINE', '기기가 오프라인 상태입니다.'),
  emailDuplicated: () => new AppError(409, 'EMAIL_DUPLICATED', '이미 가입된 이메일입니다.'),
  deviceDuplicated: () => new AppError(409, 'DEVICE_DUPLICATED', '이미 등록된 기기 ID입니다.'),
  elevatorBusy: () => new AppError(409, 'ELEVATOR_ALREADY_CALLED', '이미 진행 중인 호출이 있습니다.'),
  unsupportedCommand: (msg = '해당 기기에서 지원하지 않는 제어 명령입니다.') => new AppError(422, 'UNSUPPORTED_COMMAND', msg),
  commandFailed: (msg = '기기가 명령을 처리하지 못했습니다.') => new AppError(422, 'COMMAND_FAILED', msg),
  internal: () => new AppError(500, 'INTERNAL_ERROR', '서버 내부 오류가 발생했습니다.'),
  upstream: (msg = '내부 서비스 호출에 실패했습니다.') => new AppError(502, 'UPSTREAM_ERROR', msg),
  deviceTimeout: () => new AppError(504, 'DEVICE_TIMEOUT', '기기로부터 응답이 없습니다.'),
};

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

function errorHandler(logger) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    if (err?.type === 'entity.parse.failed') err = Errors.invalid('JSON 형식이 올바르지 않습니다.');
    if (!(err instanceof AppError)) {
      logger.error('unhandled error', { err, path: req.path, method: req.method });
      err = Errors.internal();
    }
    const body = { success: false, error: { code: err.code, message: err.message } };
    if (err.details) body.error.details = err.details;
    res.status(err.status).json(body);
  };
}

/** async 라우트 핸들러의 에러를 errorHandler 로 넘긴다 */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { AppError, Errors, ok, errorHandler, wrap };
