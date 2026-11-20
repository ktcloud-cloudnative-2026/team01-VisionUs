'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCommand, applyCommand, initialState, DEVICE_TYPES } = require('../common/src/devices');
const { parseTopic, topics } = require('../common/src/topics');

test('모든 기기 종류에 초기 상태가 있다', () => {
  for (const t of DEVICE_TYPES) assert.ok(initialState(t).state);
});

test('조명 밝기 범위 검증', () => {
  assert.deepEqual(validateCommand('light', 'SET_BRIGHTNESS', { brightness: 70 }), { brightness: 70 });
  assert.throws(() => validateCommand('light', 'SET_BRIGHTNESS', { brightness: 101 }), { status: 400 });
  assert.throws(() => validateCommand('light', 'SET_BRIGHTNESS', { brightness: '70' }), { status: 400 });
});

test('지원하지 않는 명령은 422', () => {
  assert.throws(() => validateCommand('light', 'SET_TEMPERATURE', { temperature: 20 }), { status: 422, code: 'UNSUPPORTED_COMMAND' });
  assert.throws(() => validateCommand('elevator', 'SET_POWER', { power: 'on' }), { status: 422 });
});

test('에어컨/난방 온도 범위가 다르다', () => {
  assert.ok(validateCommand('heater', 'SET_TEMPERATURE', { temperature: 15 }));
  assert.throws(() => validateCommand('aircon', 'SET_TEMPERATURE', { temperature: 15 }), { status: 400 });
});

test('명령 적용', () => {
  let s = initialState('light');
  s = applyCommand('light', s, 'SET_POWER', { power: 'on' });
  s = applyCommand('light', s, 'SET_BRIGHTNESS', { brightness: 40 });
  assert.deepEqual(s, { power: 'on', state: { brightness: 40 } });
  const c = applyCommand('curtain', initialState('curtain'), 'OPEN', {});
  assert.equal(c.state.position, 100);
});

test('토픽 해석', () => {
  assert.deepEqual(parseTopic(topics.state(7, 'light-01')), { homeId: '7', deviceId: 'light-01', channel: 'state' });
  assert.deepEqual(parseTopic(topics.elevatorStatus(7)), { homeId: '7', deviceId: null, channel: 'elevator/status' });
  assert.equal(parseTopic('other/x'), null);
});
