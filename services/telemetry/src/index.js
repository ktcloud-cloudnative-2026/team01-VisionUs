'use strict';
/**
 * telemetry-service : 상태 구독 · 이력 저장 (포트 3004)  ※ DB 명세서의 monitoring-service
 *   GET /api/v1/devices/:deviceId/events      US-14 (from, to, type, limit)
 *
 * MQTT 구독 (공유 구독 $share/telemetry → 레플리카가 늘어도 한 번만 처리)
 *   .../state    → device_states 갱신, devices.status=online·last_seen_at 갱신,
 *                  값이 바뀌었으면 STATE_CHANGED, 오프라인이었으면 ONLINE 이벤트
 *   .../status   → 기기가 직접 보고한 online/offline 반영
 *   .../command  → COMMAND_SENT 이벤트
 * 주기 작업: OFFLINE_AFTER_SEC 동안 보고가 없으면 offline 전환 + OFFLINE 이벤트
 */
const {
  createService, createPool, requireUser, connectMqtt, callService, express, env, envInt,
  Errors, ok, wrap, tx, ALL_TOPICS, parseTopic, sharedTopic,
} = require('@homeiot/common');

const svc = createService('telemetry-service');
const { logger } = svc;
const pool = createPool(logger);
const DEVICE_SERVICE_URL = env('DEVICE_SERVICE_URL', 'http://localhost:3002');
const OFFLINE_AFTER_SEC = envInt('OFFLINE_AFTER_SEC', 20);

const msgCounter = new svc.promClient.Counter({
  name: 'homeiot_mqtt_messages_total', help: '수신한 MQTT 메시지 수', labelNames: ['channel'], registers: [svc.registry],
});
const onlineGauge = new svc.promClient.Gauge({
  name: 'homeiot_devices_online', help: '온라인 기기 수', registers: [svc.registry],
  async collect() {
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM devices WHERE status = 'online'").catch(() => ({ rows: [{ n: 0 }] }));
    this.set(rows[0].n);
  },
});
void onlineGauge;

const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** 기기 상태 보고 처리. homeId(=user_id)와 기기 소유자가 다르면 무시 */
async function handleState(homeId, deviceId, msg) {
  if (msg.error) return; // 명령 실패 응답은 상태 변경 없음
  const power = msg.power === 'on' || msg.power === 'off' ? msg.power : null;
  const state = msg.state && typeof msg.state === 'object' ? msg.state : {};
  await tx(pool, async (db) => {
    const { rows } = await db.query(
      `SELECT d.status, s.power, s.state FROM devices d
       LEFT JOIN device_states s ON s.device_id = d.device_id
       WHERE d.device_id = $1 AND d.user_id = $2 FOR UPDATE OF d`,
      [deviceId, homeId]);
    if (!rows[0]) return;
    const prev = rows[0];
    await db.query("UPDATE devices SET status = 'online', last_seen_at = now() WHERE device_id = $1", [deviceId]);
    if (prev.status === 'offline') {
      await db.query("INSERT INTO device_events (device_id, event_type, payload) VALUES ($1, 'ONLINE', '{}')", [deviceId]);
      logger.info('device online', { deviceId });
    }
    if (prev.power !== power || !sameJson(prev.state, state)) {
      await db.query(
        `INSERT INTO device_states (device_id, power, state, updated_at) VALUES ($1, $2, $3, now())
         ON CONFLICT (device_id) DO UPDATE SET power = EXCLUDED.power, state = EXCLUDED.state, updated_at = now()`,
        [deviceId, power, state]);
      await db.query(
        "INSERT INTO device_events (device_id, event_type, payload) VALUES ($1, 'STATE_CHANGED', $2)",
        [deviceId, { before: { power: prev.power, state: prev.state }, after: { power, state }, commandId: msg.commandId ?? null }]);
    }
  });
}

async function handleStatus(homeId, deviceId, msg) {
  if (msg.status !== 'online' && msg.status !== 'offline') return;
  const { rows } = await pool.query(
    `UPDATE devices SET status = $3::varchar, last_seen_at = CASE WHEN $3::varchar = 'online' THEN now() ELSE last_seen_at END
     WHERE device_id = $1 AND user_id = $2 AND status <> $3::varchar RETURNING device_id`,
    [deviceId, homeId, msg.status]);
  if (rows[0]) {
    await pool.query('INSERT INTO device_events (device_id, event_type, payload) VALUES ($1, $2, $3)',
      [deviceId, msg.status.toUpperCase(), { reason: 'reported' }]);
  }
}

async function handleCommand(homeId, deviceId, msg) {
  await pool.query(
    `INSERT INTO device_events (device_id, event_type, payload)
     SELECT $1::varchar, 'COMMAND_SENT', $3::jsonb
     WHERE EXISTS (SELECT 1 FROM devices WHERE device_id = $1::varchar AND user_id = $2::bigint)`,
    [deviceId, homeId, { commandId: msg.commandId, command: msg.command, params: msg.params ?? {} }]);
}

const mqtt = connectMqtt('telemetry-service', logger, {
  subscriptions: [
    sharedTopic('telemetry', ALL_TOPICS.state),
    sharedTopic('telemetry', ALL_TOPICS.status),
    sharedTopic('telemetry', ALL_TOPICS.command),
  ],
  onMessage: async (topic, payload) => {
    const t = parseTopic(topic);
    if (!t || !payload || !t.deviceId || !/^\d+$/.test(t.homeId)) return;
    msgCounter.inc({ channel: t.channel });
    if (t.channel === 'state') await handleState(t.homeId, t.deviceId, payload);
    else if (t.channel === 'status') await handleStatus(t.homeId, t.deviceId, payload);
    else if (t.channel === 'command') await handleCommand(t.homeId, t.deviceId, payload);
  },
});

// 오프라인 판정 (heartbeat 끊김)
async function sweepOffline() {
  const { rows } = await pool.query(
    `UPDATE devices SET status = 'offline'
     WHERE status = 'online' AND (last_seen_at IS NULL OR last_seen_at < now() - make_interval(secs => $1))
     RETURNING device_id`, [OFFLINE_AFTER_SEC]);
  for (const { device_id } of rows) {
    await pool.query("INSERT INTO device_events (device_id, event_type, payload) VALUES ($1, 'OFFLINE', $2)",
      [device_id, { reason: 'no-report', afterSec: OFFLINE_AFTER_SEC }]);
    logger.warn('device offline', { deviceId: device_id });
  }
}
const sweeper = setInterval(() => sweepOffline().catch((err) => logger.error('offline sweep failed', { err })), 5000);

// ---- REST ----
const r = express.Router();
r.use(requireUser); // 사용자 식별: Gateway 가 넣어 준 x-user-id

r.get('/devices/:deviceId/events', wrap(async (req, res) => {
  // 소유권 확인은 device-service 에 맡긴다 (404/403 그대로 전달)
  const device = await callService(DEVICE_SERVICE_URL, `/api/v1/devices/${encodeURIComponent(req.params.deviceId)}`, { user: req.user });
  const { from, to, type } = req.query;
  const limit = Math.min(Number.parseInt(req.query.limit ?? '50', 10) || 50, 500);
  const fromD = from ? new Date(from) : null;
  const toD = to ? new Date(to) : null;
  if ((fromD && Number.isNaN(fromD.getTime())) || (toD && Number.isNaN(toD.getTime()))) throw Errors.invalid('from/to 는 ISO 8601 형식이어야 합니다.');
  if (type && !['STATE_CHANGED', 'COMMAND_SENT', 'ONLINE', 'OFFLINE'].includes(type)) throw Errors.invalid('type 값이 올바르지 않습니다.');
  const { rows } = await pool.query(
    `SELECT event_id, event_type, payload, occurred_at FROM device_events
     WHERE device_id = $1 AND ($2::timestamptz IS NULL OR occurred_at >= $2)
       AND ($3::timestamptz IS NULL OR occurred_at <= $3) AND ($4::text IS NULL OR event_type = $4)
     ORDER BY occurred_at DESC LIMIT $5`,
    [device.deviceId, fromD, toD, type ?? null, limit]);
  ok(res, rows.map((e) => ({ eventId: Number(e.event_id), type: e.event_type, payload: e.payload, occurredAt: e.occurred_at })));
}));

svc.app.use('/api/v1', r);
svc.start({
  port: envInt('PORT', 3004),
  readiness: async () => {
    await pool.query('SELECT 1');
    if (!mqtt.isConnected()) throw new Error('mqtt not connected');
  },
  onShutdown: async () => { clearInterval(sweeper); mqtt.client.end(); await pool.end(); },
});
