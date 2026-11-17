import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/app.js';

let server;
let base;
before(() => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const send = (deviceId, body, raw) =>
  fetch(`${base}/api/v1/devices/${deviceId}/commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  });

test('맞는 명령은 202 접수', async () => {
  const res = await send('light-living-01', { command: 'SET_POWER', params: { power: 'on' } });
  assert.equal(res.status, 202);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.equal(json.data.deviceId, 'light-living-01');
  assert.match(json.data.commandId, /^cmd-/);
});

test('없는 기기는 404', async () => {
  const res = await send('no-such-device', { command: 'SET_POWER', params: { power: 'on' } });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error.code, 'DEVICE_NOT_FOUND');
});

test('command가 없으면 400', async () => {
  const res = await send('light-living-01', { params: {} });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'INVALID_REQUEST');
});

test('깨진 JSON은 400', async () => {
  const res = await send('light-living-01', null, '{"command":');
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'INVALID_REQUEST');
});

test('조명에 온도 명령은 422', async () => {
  const res = await send('light-living-01', { command: 'SET_TEMPERATURE', params: { temperature: 20 } });
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error.code, 'UNSUPPORTED_COMMAND');
});