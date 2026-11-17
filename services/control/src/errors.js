// 에러 응답은 모두 여기서 만든다 (api-spec 2.2 실패 응답 모양)
// { "success": false, "error": { "code": "...", "message": "..." } }

export const ERRORS = {
  INVALID_REQUEST: { status: 400, message: '요청 형식이 올바르지 않습니다.' },
  DEVICE_NOT_FOUND: { status: 404, message: '기기를 찾을 수 없습니다.' },
  UNSUPPORTED_COMMAND: { status: 422, message: '이 기기가 지원하지 않는 명령입니다.' },
};

export function sendError(res, code, message) {
  const err = ERRORS[code];
  res.status(err.status).json({
    success: false,
    error: { code, message: message || err.message },
  });
}