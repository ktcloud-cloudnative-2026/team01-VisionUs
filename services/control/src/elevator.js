// 엘리베이터 호출 요청 검사 (API 명세 4.6)
// 결과: { ok: true } 또는 { ok: false, code, message }
// 층 범위는 명세에 없어 수영님 견본과 맞춤: -10 ~ 200, 0층 없음

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

export function validateElevatorCall(body) {
  // 1) 본문이 객체인지
  if (!isPlainObject(body)) {
    return { ok: false, code: 'INVALID_REQUEST', message: '요청 본문은 JSON 객체여야 합니다.' };
  }

  const { floor, direction } = body;

  // 2) floor: 정수 + -10~200 + 0 아님
  if (!Number.isInteger(floor) || floor < -10 || floor > 200 || floor === 0) {
    return { ok: false, code: 'INVALID_REQUEST', message: 'floor는 -10~200 사이 정수(0 제외)여야 합니다.' };
  }

  // 3) direction: 없어도 됨. 있으면 'up' 또는 'down'
  if (direction !== undefined && !['up', 'down'].includes(direction)) {
    return { ok: false, code: 'INVALID_REQUEST', message: "direction은 'up' 또는 'down'이어야 합니다." };
  }

  return { ok: true };
}
