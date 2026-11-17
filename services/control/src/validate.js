// 기기 종류별로 받을 수 있는 명령과 값 (api-spec 4.5 표)
// 주소가 어떻게 바뀌든 이 규칙은 그대로 쓴다.

const onOff = (v) => v === 'on' || v === 'off';
const intBetween = (min, max) => (v) => Number.isInteger(v) && v >= min && v <= max;
const numBetween = (min, max) => (v) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const oneOf = (...list) => (v) => list.includes(v);

// 명령마다: 꼭 있어야 하는 값과 그 값을 검사하는 함수
const SET_POWER = { power: onOff };

export const RULES = {
  light: {
    SET_POWER,
    SET_BRIGHTNESS: { brightness: intBetween(0, 100) },
  },
  aircon: {
    SET_POWER,
    SET_TEMPERATURE: { temperature: numBetween(16, 30) },
    SET_MODE: { mode: oneOf('cool', 'dry', 'fan') },
  },
  heater: {
    SET_POWER,
    SET_TEMPERATURE: { temperature: numBetween(15, 30) },
  },
  purifier: {
    SET_POWER,
    SET_FAN_SPEED: { fanSpeed: oneOf('low', 'mid', 'high', 'auto') },
  },
  curtain: {
    OPEN: {},
    CLOSE: {},
    SET_POSITION: { position: intBetween(0, 100) },
  },
};

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

// 결과: { ok: true } 또는 { ok: false, code, message }
export function validateCommand(deviceType, body) {
  // 1) 모양 검사 → 400
  if (!isPlainObject(body)) {
    return { ok: false, code: 'INVALID_REQUEST', message: '요청 본문은 JSON 객체여야 합니다.' };
  }
  const { command, params = {} } = body;
  if (typeof command !== 'string' || command === '') {
    return { ok: false, code: 'INVALID_REQUEST', message: 'command가 필요합니다.' };
  }
  if (!isPlainObject(params)) {
    return { ok: false, code: 'INVALID_REQUEST', message: 'params는 객체여야 합니다.' };
  }

  // 2) 이 기기가 할 수 있는 명령·값인지 → 422
  const rule = RULES[deviceType]?.[command];
  if (!rule) {
    return { ok: false, code: 'UNSUPPORTED_COMMAND', message: `${deviceType}은(는) ${command}를 지원하지 않습니다.` };
  }
  for (const [name, check] of Object.entries(rule)) {
    if (!(name in params)) {
      return { ok: false, code: 'INVALID_REQUEST', message: `params.${name}이(가) 필요합니다.` };
    }
    if (!check(params[name])) {
      return { ok: false, code: 'UNSUPPORTED_COMMAND', message: `params.${name} 값이 허용 범위가 아닙니다.` };
    }
  }
  return { ok: true };
}