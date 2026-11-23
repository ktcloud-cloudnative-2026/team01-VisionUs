'use strict';
/**
 * 기기 종류·명령 정의 (API 명세서 4.5 / DB 명세서 코드 정의 기준)
 * - control-service: validateCommand 로 요청 검증
 * - simulator: applyCommand 로 가상 기기 상태 변경
 * 순수 함수만 둔다 (외부 의존성 없음 → 단위 테스트 쉬움)
 */
const { Errors } = require('./errors');

const DEVICE_TYPES = ['light', 'aircon', 'heater', 'purifier', 'curtain', 'elevator'];

const TYPE_LABELS = {
  light: '조명',
  aircon: '에어컨',
  heater: '난방기기',
  purifier: '공기청정기',
  curtain: '커튼',
  elevator: '엘리베이터 호출',
};

const power = { power: { enum: ['on', 'off'] } };

/** 기기 종류별 지원 명령과 params 규칙 */
const COMMANDS = {
  light: {
    SET_POWER: power,
    SET_BRIGHTNESS: { brightness: { int: [0, 100] } },
  },
  aircon: {
    SET_POWER: power,
    SET_TEMPERATURE: { temperature: { int: [16, 30] } },
    SET_MODE: { mode: { enum: ['cool', 'dry', 'fan'] } },
  },
  heater: {
    SET_POWER: power,
    SET_TEMPERATURE: { temperature: { int: [15, 30] } },
  },
  purifier: {
    SET_POWER: power,
    SET_FAN_SPEED: { fanSpeed: { enum: ['low', 'mid', 'high', 'auto'] } },
  },
  curtain: {
    OPEN: {},
    CLOSE: {},
    SET_POSITION: { position: { int: [0, 100] } },
  },
  // 엘리베이터는 /elevator/calls API 로만 제어
  elevator: {},
};

function initialState(type) {
  switch (type) {
    case 'light': return { power: 'off', state: { brightness: 70 } };
    case 'aircon': return { power: 'off', state: { temperature: 24, mode: 'cool' } };
    case 'heater': return { power: 'off', state: { temperature: 22 } };
    case 'purifier': return { power: 'off', state: { fanSpeed: 'mid' } };
    case 'curtain': return { power: null, state: { position: 0 } };
    case 'elevator': return { power: null, state: { currentFloor: 1, callStatus: 'idle', targetFloor: null } };
    default: throw Errors.invalid(`알 수 없는 기기 종류: ${type}`);
  }
}

/**
 * 명령 검증. 잘못된 명령은 422, 잘못된 params 는 400.
 * @returns 정규화된 params (규칙에 없는 키는 버린다)
 */
function validateCommand(type, command, params = {}) {
  const table = COMMANDS[type];
  if (!table) throw Errors.invalid(`알 수 없는 기기 종류: ${type}`);
  if (typeof command !== 'string' || !Object.hasOwn(table, command)) {
    throw Errors.unsupportedCommand(`${TYPE_LABELS[type]}에서 지원하지 않는 명령입니다: ${command}`);
  }
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    throw Errors.invalid('params 는 객체여야 합니다.');
  }
  const rules = table[command];
  const out = {};
  for (const [key, rule] of Object.entries(rules)) {
    const v = params[key];
    if (v === undefined) throw Errors.invalid(`params.${key} 값이 필요합니다.`);
    if (rule.enum && !rule.enum.includes(v)) {
      throw Errors.invalid(`params.${key} 는 ${rule.enum.join(' | ')} 중 하나여야 합니다.`);
    }
    if (rule.int) {
      const [min, max] = rule.int;
      if (!Number.isInteger(v) || v < min || v > max) {
        throw Errors.invalid(`params.${key} 는 ${min}~${max} 사이 정수여야 합니다.`);
      }
    }
    out[key] = v;
  }
  return out;
}

/** 현재 상태 + 명령 → 새 상태 (시뮬레이터용). current = { power, state } */
function applyCommand(type, current, command, params) {
  const p = validateCommand(type, command, params);
  const next = { power: current.power, state: { ...current.state } };
  switch (command) {
    case 'SET_POWER': next.power = p.power; break;
    case 'SET_BRIGHTNESS': next.state.brightness = p.brightness; break;
    case 'SET_TEMPERATURE': next.state.temperature = p.temperature; break;
    case 'SET_MODE': next.state.mode = p.mode; break;
    case 'SET_FAN_SPEED': next.state.fanSpeed = p.fanSpeed; break;
    case 'OPEN': next.state.position = 100; break;
    case 'CLOSE': next.state.position = 0; break;
    case 'SET_POSITION': next.state.position = p.position; break;
    default: throw Errors.unsupportedCommand();
  }
  return next;
}

module.exports = { DEVICE_TYPES, TYPE_LABELS, COMMANDS, initialState, validateCommand, applyCommand };
