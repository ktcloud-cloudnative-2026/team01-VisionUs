'use strict';
/**
 * control-service : 명령 발행 · 응답 처리 (포트 3003)
 *   POST /api/v1/devices/:deviceId/commands   US-07 ~ US-11
 *   POST /api/v1/elevator/calls               US-12
 *   GET  /api/v1/elevator/calls/:callId       US-12
 *
 * 명령 흐름 (아키텍처 3-1 조명 켜기 시퀀스)
 *   1) device-service 에 기기 조회(REST, x-user-id 전달) → 소유권·온라인 확인
 *   2) commands 에 requested 저장 → MQTT command 발행 (commandId 포함)
 *   3) 기기가 같은 commandId 로 state 를 발행하면 completed 로 바꾸고 결과 응답
 *   4) COMMAND_TIMEOUT_MS 안에 응답이 없으면 timeout 저장 후 504
 */
const crypto = require('node:crypto');
const {
  createService, createPool, requireUser, connectMqtt, callService, express, env, envInt,
  Errors, ok, wrap, topics, ALL_TOPICS, parseTopic, sharedTopic, validateCommand,
} = require('@homeiot/common');

const svc = createService('control-service');
const { logger } = svc;
const pool = createPool(logger);
const DEVICE_SERVICE_URL = env('DEVICE_SERVICE_URL', 'http://localhost:3002');
const COMMAND_TIMEOUT_MS = envInt('COMMAND_TIMEOUT_MS', 5000);

// ---- 업무 지표 (관측 설계) ----
const commandCounter = new svc.promClient.Counter({
  name: 'homeiot_commands_total', help: '기기 제어 명령 수', labelNames: ['type', 'command', 'result'], registers: [svc.registry],
});
const commandLatency = new svc.promClient.Histogram({
  name: 'homeiot_command_roundtrip_seconds', help: '명령 발행 → 기기 응답 시간', labelNames: ['type'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5], registers: [svc.registry],
});

/** commandId → { resolve, timer } : 이 인스턴스가 발행하고 기다리는 명령 */
const pending = new Map();

const mqtt = connectMqtt('control-service', logger, {
  subscriptions: [
    ALL_TOPICS.state, // 명령 결과는 명령을 보낸 인스턴스가 받아야 하므로 공유 구독 아님
    sharedTopic('control', ALL_TOPICS.elevatorStatus),
  ],
  onMessage: async (topic, payload) => {
    const t = parseTopic(topic);
    if (!t || !payload) return;
    if (t.channel === 'state' && payload.commandId && pending.has(payload.commandId)) {
      const p = pending.get(payload.commandId);
      pending.delete(payload.commandId);
      clearTimeout(p.timer);
      p.resolve(payload);
    } else if (t.channel === 'elevator/status' && payload.callId) {
      const allowed = ['requested', 'arriving', 'arrived', 'failed'];
      if (!allowed.includes(payload.status)) return;
      await pool.query(
        `UPDATE elevator_calls SET status = $1
         WHERE call_id = $2 AND user_id = $3 AND status NOT IN ('arrived','failed')`,
        [payload.status, payload.callId, t.homeId],
      );
      logger.info('elevator status', { callId: payload.callId, status: payload.status });
    }
  },
});

function waitForResult(commandId) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(commandId);
      resolve(null);
    }, COMMAND_TIMEOUT_MS);
    pending.set(commandId, { resolve, timer });
  });
}

const newId = (prefix) => {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${prefix}-${d}-${crypto.randomBytes(4).toString('hex')}`;
};

const r = express.Router();
r.use(requireUser); // 사용자 식별: Gateway 가 넣어 준 x-user-id

// 기기 제어
r.post('/devices/:deviceId/commands', wrap(async (req, res) => {
  const { command, params = {} } = req.body ?? {};
  const device = await callService(DEVICE_SERVICE_URL, `/api/v1/devices/${encodeURIComponent(req.params.deviceId)}`, { user: req.user });
  if (device.type === 'elevator') throw Errors.unsupportedCommand('엘리베이터는 /elevator/calls 로 호출하세요.');
  const cleanParams = validateCommand(device.type, command, params);
  if (device.status !== 'online') throw Errors.deviceOffline();

  const commandId = newId('cmd');
  await pool.query(
    'INSERT INTO commands (command_id, device_id, user_id, command, params) VALUES ($1, $2, $3, $4, $5)',
    [commandId, device.deviceId, req.user.id, command, cleanParams],
  );

  const started = process.hrtime.bigint();
  const resultPromise = waitForResult(commandId); // 발행 전에 대기 등록 (응답이 아주 빨라도 놓치지 않게)
  await mqtt.publish(topics.command(device.userId, device.deviceId), { commandId, command, params: cleanParams, issuedAt: new Date().toISOString() });
  logger.info('command published', { commandId, deviceId: device.deviceId, command });

  const result = await resultPromise;
  if (!result) {
    await pool.query("UPDATE commands SET status = 'timeout', completed_at = now() WHERE command_id = $1", [commandId]);
    commandCounter.inc({ type: device.type, command, result: 'timeout' });
    logger.warn('command timeout', { commandId, deviceId: device.deviceId });
    throw Errors.deviceTimeout();
  }
  commandLatency.observe({ type: device.type }, Number(process.hrtime.bigint() - started) / 1e9);

  if (result.error) {
    await pool.query("UPDATE commands SET status = 'failed', completed_at = now() WHERE command_id = $1", [commandId]);
    commandCounter.inc({ type: device.type, command, result: 'failed' });
    throw Errors.commandFailed(result.error.message);
  }

  await pool.query("UPDATE commands SET status = 'completed', completed_at = now() WHERE command_id = $1", [commandId]);
  commandCounter.inc({ type: device.type, command, result: 'completed' });
  ok(res, {
    commandId,
    deviceId: device.deviceId,
    status: 'completed',
    state: { power: result.power ?? null, ...(result.state ?? {}) },
  });
}));

// 엘리베이터 호출
r.post('/elevator/calls', wrap(async (req, res) => {
  const { deviceId, floor, direction } = req.body ?? {};
  if (!Number.isInteger(floor) || floor < -10 || floor > 200 || floor === 0) throw Errors.invalid('floor 는 -10~200 사이 정수(0 제외)여야 합니다.');
  if (direction !== undefined && direction !== null && !['up', 'down'].includes(direction)) throw Errors.invalid('direction 은 up | down 중 하나여야 합니다.');

  let device;
  if (deviceId) {
    device = await callService(DEVICE_SERVICE_URL, `/api/v1/devices/${encodeURIComponent(deviceId)}`, { user: req.user });
    if (device.type !== 'elevator') throw Errors.unsupportedCommand('엘리베이터 기기가 아닙니다.');
  } else {
    const list = await callService(DEVICE_SERVICE_URL, '/api/v1/devices?type=elevator', { user: req.user });
    if (!list.length) throw Errors.deviceNotFound();
    device = list[0];
  }
  if (device.status !== 'online') throw Errors.deviceOffline();

  const { rows: active } = await pool.query(
    "SELECT 1 FROM elevator_calls WHERE device_id = $1 AND status IN ('requested','arriving') LIMIT 1", [device.deviceId]);
  if (active.length) throw Errors.elevatorBusy();

  const callId = newId('call');
  const { rows } = await pool.query(
    `INSERT INTO elevator_calls (call_id, device_id, user_id, floor, direction)
     VALUES ($1, $2, $3, $4, $5) RETURNING requested_at`,
    [callId, device.deviceId, req.user.id, floor, direction ?? null],
  );
  await mqtt.publish(topics.elevatorCall(device.userId), { callId, deviceId: device.deviceId, floor, direction: direction ?? null });
  logger.info('elevator called', { callId, deviceId: device.deviceId, floor });
  ok(res, { callId, deviceId: device.deviceId, status: 'requested', requestedAt: rows[0].requested_at }, 202);
}));

r.get('/elevator/calls/:callId', wrap(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT call_id, device_id, user_id, floor, direction, status, requested_at FROM elevator_calls WHERE call_id = $1',
    [req.params.callId]);
  const c = rows[0];
  if (!c) throw Errors.notFound('호출을 찾을 수 없습니다.');
  if (Number(c.user_id) !== req.user.id) throw Errors.forbidden();
  ok(res, { callId: c.call_id, deviceId: c.device_id, floor: c.floor, direction: c.direction, status: c.status, requestedAt: c.requested_at });
}));

svc.app.use('/api/v1', r);
svc.start({
  port: envInt('PORT', 3003),
  readiness: async () => {
    await pool.query('SELECT 1');
    if (!mqtt.isConnected()) throw new Error('mqtt not connected');
  },
  onShutdown: async () => { mqtt.client.end(); await pool.end(); },
});
