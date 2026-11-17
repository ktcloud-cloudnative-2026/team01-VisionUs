import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCommand } from '../src/validate.js';

test('조명 켜기는 통과', () => {
  assert.deepEqual(validateCommand('light', { command: 'SET_POWER', params: { power: 'on' } }), { ok: true });
});

test('커튼 열기는 params 없이 통과', () => {
  assert.deepEqual(validateCommand('curtain', { command: 'OPEN' }), { ok: true });
});

test('command가 없으면 400', () => {
  assert.equal(validateCommand('light', { params: {} }).code, 'INVALID_REQUEST');
});

test('필요한 값이 빠지면 400', () => {
  assert.equal(validateCommand('light', { command: 'SET_BRIGHTNESS', params: {} }).code, 'INVALID_REQUEST');
});

test('조명에 온도 명령은 422', () => {
  assert.equal(validateCommand('light', { command: 'SET_TEMPERATURE', params: { temperature: 20 } }).code, 'UNSUPPORTED_COMMAND');
});

test('밝기 101은 422', () => {
  assert.equal(validateCommand('light', { command: 'SET_BRIGHTNESS', params: { brightness: 101 } }).code, 'UNSUPPORTED_COMMAND');
});

test('에어컨 온도 범위는 16~30, 난방은 15~30', () => {
  assert.equal(validateCommand('aircon', { command: 'SET_TEMPERATURE', params: { temperature: 15 } }).ok, false);
  assert.equal(validateCommand('heater', { command: 'SET_TEMPERATURE', params: { temperature: 15 } }).ok, true);
});