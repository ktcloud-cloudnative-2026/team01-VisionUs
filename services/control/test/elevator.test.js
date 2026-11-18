import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { validateElevatorCall } from '../src/elevator.js';
import { app } from '../src/app.js';

// ---- 검사 함수 ----
test('3층 호출은 통과', () => {
  assert.deepEqual(validateElevatorCall({ floor: 3 }), { ok: true });
});

test('방향까지 주면 통과', () => {
  assert.deepEqual(validateElevatorCall({ floor: 3, direction: 'up' }), { ok: true });
});

test('경계값: -10, 200은 통과 / -11, 201, 0은 실패', () => {
  assert.equal(validateElevatorCall({ floor: -10 }).ok, true);
  assert.equal(validateElevatorCall({ floor: 200 }).ok, true);
  assert.equal(validateElevatorCall({ floor: -11 }).ok, false);
  assert.equal(validateElevatorCall({ floor: 201 }).ok, false);
  assert.equal(validateElevatorCall({ floor: 0 }).ok, false);
});

test('floor가 없거나 정수가 아니면 400', () => {
  assert.equal(validateElevatorCall({}).code, 'INVALID_REQUEST');
  assert.equal(validateElevatorCall({ floor: '3' }).code, 'INVALID_REQUEST');
  assert.equal(validateElevatorCall({ floor: 3.5 }).code, 'INVALID_REQUEST');
});

test('direction이 up/down이 아니면 400', () => {
  assert.equal(validateElevatorCall({ floor: 3, direction: 'left' }).code, 'INVALID_REQUEST');
});

// ---- 주소까지 실제로 불러 보기 ----
let server;
let base;
before(() => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const call = (body) =>
  fetch(`${base}/api/v1/elevator/calls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

test('정상 호출은 202 + callId', async () => {
  const res = await call({ floor: 3, direction: 'up' });
  assert.equal(res.status, 202);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.match(json.data.callId, /^call-/);
  assert.equal(json.data.status, 'requested');
  assert.ok(json.data.requestedAt);
});

test('0층 호출은 400', async () => {
  const res = await call({ floor: 0 });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'INVALID_REQUEST');
});
