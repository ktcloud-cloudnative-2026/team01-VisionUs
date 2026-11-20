'use strict';
/**
 * 가전 기기 시뮬레이터 (포트 3005, 화면: /simulator)
 *  - 별도 Node.js 서비스, MQTT 클라이언트로만 동작 (서버 DB 에 접근하지 않음)
 *  - meta(retained) 를 받아 가상 기기 생성 → command 구독 → state 발행
 *  - SIM_INTERVAL_SEC 마다 모든 기기 state 재발행 (heartbeat, 오프라인 판정 기준)
 *  - 엘리베이터: call 수신 → arriving → 층 이동 → arrived
 *  - 화면: 기기 상태, 상태 직접 변경(손으로 조작한 경우 재현), 도착 처리, 연결 끊기, 이벤트 로그(SSE)
 */
const path = require('node:path');
const {
  createService, connectMqtt, express, envInt,
  Errors, ok, wrap, topics, ALL_TOPICS, parseTopic, initialState, applyCommand, TYPE_LABELS,
} = require('@homeiot/common');

const svc = createService('simulator');
const { logger, app } = svc;
const INTERVAL_SEC = envInt('SIM_INTERVAL_SEC', 5);
const FLOOR_MOVE_MS = envInt('SIM_FLOOR_MOVE_MS', 1500);
const BASE = '/simulator';

/** key = `${homeId}/${deviceId}` */
const devices = new Map();
const eventLog = [];
const sseClients = new Set();

function broadcast(kind, data) {
  const line = `event: ${kind}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) res.write(line);
}

function log(direction, topic, payload) {
  const e = { at: new Date().toISOString(), direction, topic, payload };
  eventLog.unshift(e);
  if (eventLog.length > 200) eventLog.pop();
  broadcast('log', e);
}

const view = (d) => ({
  key: `${d.homeId}/${d.deviceId}`, homeId: d.homeId, deviceId: d.deviceId, type: d.type, typeLabel: TYPE_LABELS[d.type],
  name: d.name, location: d.location, power: d.power, state: d.state, connected: d.connected,
  lastCommandAt: d.lastCommandAt, call: d.call ?? null,
});

async function publish(topic, payload, opts) {
  await mqtt.publish(topic, payload, opts);
  log('out', topic, payload);
}

async function publishState(d, extra = {}) {
  if (!d.connected) return;
  await publish(topics.state(d.homeId, d.deviceId), {
    ...extra, power: d.power, state: d.state, reportedAt: new Date().toISOString(),
  });
  broadcast('device', view(d));
}

// ---------------- MQTT 메시지 처리 ----------------
async function onMeta(t, payload) {
  const key = `${t.homeId}/${t.deviceId}`;
  if (!payload) { // retained 삭제 = 기기 삭제
    if (devices.delete(key)) broadcast('removed', { key });
    return;
  }
  let d = devices.get(key);
  if (!d) {
    const init = initialState(payload.type);
    d = { homeId: t.homeId, deviceId: t.deviceId, type: payload.type, power: init.power, state: init.state, connected: true, lastCommandAt: null };
    devices.set(key, d);
    logger.info('virtual device created', { key, type: payload.type });
  }
  d.name = payload.name;
  d.location = payload.location;
  await publish(topics.status(d.homeId, d.deviceId), { status: 'online' });
  await publishState(d);
}

async function onCommand(t, msg) {
  const d = devices.get(`${t.homeId}/${t.deviceId}`);
  if (!d || !d.connected || !msg) return; // 연결 끊긴 기기는 응답하지 않음 → 504 재현
  d.lastCommandAt = new Date().toISOString();
  try {
    const next = applyCommand(d.type, { power: d.power, state: d.state }, msg.command, msg.params ?? {});
    d.power = next.power;
    d.state = next.state;
    await publishState(d, { commandId: msg.commandId });
  } catch (e) {
    await publish(topics.state(d.homeId, d.deviceId), { commandId: msg.commandId, error: { code: e.code ?? 'COMMAND_FAILED', message: e.message } });
  }
}

async function elevatorStatus(d, status) {
  await publish(topics.elevatorStatus(d.homeId), { callId: d.call.callId, deviceId: d.deviceId, status, currentFloor: d.state.currentFloor });
}

async function arrive(d) {
  if (!d.call) return;
  clearInterval(d.call.timer);
  d.state = { ...d.state, currentFloor: d.call.floor, callStatus: 'arrived', targetFloor: null };
  await elevatorStatus(d, 'arrived');
  await publishState(d);
  d.call = null;
  setTimeout(() => {
    if (!d.call) { d.state = { ...d.state, callStatus: 'idle' }; publishState(d).catch(() => {}); }
  }, 3000);
}

async function onElevatorCall(t, msg) {
  const d = devices.get(`${t.homeId}/${msg?.deviceId}`);
  if (!d || d.type !== 'elevator' || !d.connected) return;
  d.lastCommandAt = new Date().toISOString();
  if (d.call) { // 이미 이동 중이면 실패 보고
    await publish(topics.elevatorStatus(d.homeId), { callId: msg.callId, deviceId: d.deviceId, status: 'failed', reason: 'busy' });
    return;
  }
  d.call = { callId: msg.callId, floor: msg.floor };
  d.state = { ...d.state, callStatus: 'arriving', targetFloor: msg.floor };
  await elevatorStatus(d, 'arriving');
  await publishState(d);
  d.call.timer = setInterval(() => {
    if (!d.call) return;
    const cur = d.state.currentFloor;
    if (cur === d.call.floor) { arrive(d).catch(() => {}); return; }
    let next = cur + (d.call.floor > cur ? 1 : -1);
    if (next === 0) next += d.call.floor > cur ? 1 : -1; // 0층은 없음
    d.state = { ...d.state, currentFloor: next };
    publishState(d).catch(() => {});
  }, FLOOR_MOVE_MS);
}

const mqtt = connectMqtt('simulator', logger, {
  subscriptions: [ALL_TOPICS.meta, ALL_TOPICS.command, ALL_TOPICS.elevatorCall],
  onMessage: async (topic, payload) => {
    const t = parseTopic(topic);
    if (!t) return;
    if (t.channel !== 'meta') log('in', topic, payload);
    if (t.channel === 'meta') await onMeta(t, payload);
    else if (t.channel === 'command') await onCommand(t, payload);
    else if (t.channel === 'elevator/call') await onElevatorCall(t, payload);
  },
});
mqtt.client.on('connect', () => broadcast('mqtt', { connected: true }));
mqtt.client.on('close', () => broadcast('mqtt', { connected: false }));

// heartbeat
setInterval(() => {
  for (const d of devices.values()) publishState(d).catch(() => {});
}, INTERVAL_SEC * 1000);

// ---------------- 화면 + 화면용 API ----------------
const r = express.Router();
r.use(express.static(path.join(__dirname, '..', 'public')));

r.get('/api/devices', (req, res) => ok(res, { mqttConnected: mqtt.isConnected(), devices: [...devices.values()].map(view), log: eventLog.slice(0, 100) }));

const find = (req) => {
  const d = devices.get(`${req.params.homeId}/${req.params.deviceId}`);
  if (!d) throw Errors.deviceNotFound();
  return d;
};

// 상태 직접 변경 (사용자가 기기를 손으로 조작한 경우)
r.post('/api/devices/:homeId/:deviceId/state', wrap(async (req, res) => {
  const d = find(req);
  const { power, state } = req.body ?? {};
  if (power !== undefined && d.power !== null) {
    if (!['on', 'off'].includes(power)) throw Errors.invalid('power 는 on | off');
    d.power = power;
  }
  if (state && typeof state === 'object') d.state = { ...d.state, ...state };
  await publishState(d);
  ok(res, view(d));
}));

// 엘리베이터 도착 처리
r.post('/api/devices/:homeId/:deviceId/arrive', wrap(async (req, res) => {
  const d = find(req);
  if (!d.call) throw Errors.invalid('진행 중인 호출이 없습니다.');
  await arrive(d);
  ok(res, view(d));
}));

// 연결 끊기/다시 연결 (오프라인·타임아웃 테스트)
r.post('/api/devices/:homeId/:deviceId/connection', wrap(async (req, res) => {
  const d = find(req);
  d.connected = Boolean(req.body?.connected);
  await publish(topics.status(d.homeId, d.deviceId), { status: d.connected ? 'online' : 'offline' });
  if (d.connected) await publishState(d);
  broadcast('device', view(d));
  ok(res, view(d));
}));

r.get('/api/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write(`event: mqtt\ndata: ${JSON.stringify({ connected: mqtt.isConnected() })}\n\n`);
  sseClients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => { clearInterval(ping); sseClients.delete(res); });
});

app.use(BASE, r);
app.get('/', (req, res) => res.redirect(BASE + '/'));

svc.start({
  port: envInt('PORT', 3005),
  readiness: async () => { if (!mqtt.isConnected()) throw new Error('mqtt not connected'); },
  onShutdown: async () => mqtt.client.end(),
});
