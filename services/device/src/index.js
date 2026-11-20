'use strict';
/**
 * device-service : 기기 등록 · 조회 · 삭제 (포트 3002)
 *   GET    /api/v1/devices                    US-04 (type, status 필터, 현재 상태 포함)
 *   POST   /api/v1/devices                    US-03 기기 등록
 *   GET    /api/v1/devices/:deviceId          US-05
 *   GET    /api/v1/devices/:deviceId/state    US-05
 *   DELETE /api/v1/devices/:deviceId          US-06
 *
 * 기기 등록/삭제 시 MQTT meta 토픽(retained)을 발행해서 시뮬레이터가 가상 기기를 만들고 지우게 한다.
 * 상태(device_states)와 연결 상태(devices.status)는 telemetry-service 가 MQTT 를 받아 갱신한다.
 */
const {
  createService, createPool, requireUser, connectMqtt, express, envInt,
  Errors, ok, wrap, tx, topics, DEVICE_TYPES, initialState,
} = require('@homeiot/common');

const svc = createService('device-service');
const { logger } = svc;
const pool = createPool(logger);
const mqtt = connectMqtt('device-service', logger);

const DEVICE_ID_RE = /^[a-z0-9][a-z0-9-]{2,49}$/;

const SELECT_DEVICE = `
  SELECT d.device_id, d.user_id, d.name, d.type, d.location, d.status, d.last_seen_at, d.created_at,
         s.power, s.state, s.updated_at AS state_updated_at
  FROM devices d LEFT JOIN device_states s ON s.device_id = d.device_id`;

const toDevice = (row) => ({
  deviceId: row.device_id,
  userId: Number(row.user_id),
  name: row.name,
  type: row.type,
  location: row.location,
  status: row.status,
  lastSeenAt: row.last_seen_at,
  createdAt: row.created_at,
  power: row.power,
  state: row.state ?? {},
  updatedAt: row.state_updated_at,
});

const publishMeta = (row) =>
  mqtt.publish(topics.meta(row.user_id, row.device_id),
    { deviceId: row.device_id, type: row.type, name: row.name, location: row.location }, { retain: true });

/** 본인 기기만 조회. 없으면 404, 남의 기기면 403 */
async function loadOwned(deviceId, userId) {
  const { rows } = await pool.query(`${SELECT_DEVICE} WHERE d.device_id = $1`, [deviceId]);
  if (!rows[0]) throw Errors.deviceNotFound();
  if (Number(rows[0].user_id) !== userId) throw Errors.forbidden();
  return rows[0];
}

const r = express.Router();
r.use(requireUser); // 사용자 식별: Gateway 가 넣어 준 x-user-id

r.get('/devices', wrap(async (req, res) => {
  const { type, status } = req.query;
  if (type && !DEVICE_TYPES.includes(type)) throw Errors.invalid(`type 은 ${DEVICE_TYPES.join(' | ')} 중 하나여야 합니다.`);
  if (status && !['online', 'offline'].includes(status)) throw Errors.invalid('status 는 online | offline 중 하나여야 합니다.');
  const { rows } = await pool.query(
    `${SELECT_DEVICE}
     WHERE d.user_id = $1 AND ($2::text IS NULL OR d.type = $2) AND ($3::text IS NULL OR d.status = $3)
     ORDER BY d.created_at`,
    [req.user.id, type ?? null, status ?? null],
  );
  ok(res, rows.map(toDevice));
}));

/**
 * 기기 ID 자동 생성: <종류>-<사용자ID>-<순번 2자리>  예) light-5-01, light-5-02, aircon-5-01
 * 사용자·종류별로 지금 있는 가장 큰 순번 + 1 (삭제된 번호는 다시 쓰지 않도록 최댓값 기준)
 */
async function nextDeviceId(db, type, userId) {
  const prefix = `${type}-${userId}-`;
  const { rows } = await db.query('SELECT device_id FROM devices WHERE device_id LIKE $1', [`${prefix}%`]);
  const max = rows.reduce((m, r) => {
    const n = Number.parseInt(r.device_id.slice(prefix.length), 10);
    return Number.isInteger(n) && n > m ? n : m;
  }, 0);
  return `${prefix}${String(max + 1).padStart(2, '0')}`;
}

/**
 * 기기 등록 (US-03)
 *  - deviceId 를 보내지 않으면 서버가 자동 생성 (화면은 항상 자동 생성)
 *  - deviceId 를 보내면 그 값을 사용 (API 직접 호출·테스트용, 중복이면 409)
 */
r.post('/devices', wrap(async (req, res) => {
  const { deviceId: requestedId, name, type, location } = req.body ?? {};
  const details = [];
  const auto = requestedId === undefined || requestedId === null || requestedId === '';
  if (!auto && (typeof requestedId !== 'string' || !DEVICE_ID_RE.test(requestedId))) details.push({ field: 'deviceId', message: '기기 ID는 소문자·숫자·하이픈 3~50자 (예: light-living-01)' });
  if (typeof name !== 'string' || !name.trim() || name.length > 100) details.push({ field: 'name', message: '기기 이름을 입력하세요 (100자 이하).' });
  if (!DEVICE_TYPES.includes(type)) details.push({ field: 'type', message: `기기 종류는 ${DEVICE_TYPES.join(', ')} 중 하나` });
  if (location !== undefined && location !== null && (typeof location !== 'string' || location.length > 50)) details.push({ field: 'location', message: '설치 위치는 50자 이하' });
  if (details.length) throw Errors.invalid('입력값을 확인하세요.', details);

  const init = initialState(type);
  let row;
  // 자동 생성은 동시에 등록하면 같은 번호가 나올 수 있어 중복이면 다시 시도
  for (let attempt = 1; !row; attempt++) {
    try {
      row = await tx(pool, async (db) => {
        const deviceId = auto ? await nextDeviceId(db, type, req.user.id) : requestedId;
        await db.query(
          'INSERT INTO devices (device_id, user_id, name, type, location) VALUES ($1, $2, $3, $4, $5)',
          [deviceId, req.user.id, name.trim(), type, location?.trim() || null],
        );
        await db.query('INSERT INTO device_states (device_id, power, state) VALUES ($1, $2, $3)',
          [deviceId, init.power, init.state]);
        const { rows } = await db.query(`${SELECT_DEVICE} WHERE d.device_id = $1`, [deviceId]);
        return rows[0];
      });
    } catch (e) {
      if (e.code !== '23505') throw e;
      if (!auto || attempt >= 5) throw Errors.deviceDuplicated();
    }
  }
  await publishMeta(row).catch((err) => logger.warn('meta publish failed', { err: err.message, deviceId: row.device_id }));
  logger.info('device registered', { deviceId: row.device_id, type, userId: req.user.id, autoId: auto });
  ok(res, toDevice(row), 201);
}));

r.get('/devices/:deviceId', wrap(async (req, res) => {
  ok(res, toDevice(await loadOwned(req.params.deviceId, req.user.id)));
}));

r.get('/devices/:deviceId/state', wrap(async (req, res) => {
  const d = await loadOwned(req.params.deviceId, req.user.id);
  ok(res, { deviceId: d.device_id, type: d.type, status: d.status, power: d.power, state: d.state ?? {}, updatedAt: d.state_updated_at });
}));

r.delete('/devices/:deviceId', wrap(async (req, res) => {
  const d = await loadOwned(req.params.deviceId, req.user.id);
  await pool.query('DELETE FROM devices WHERE device_id = $1', [d.device_id]);
  // retained 메시지 지우기 = 빈 페이로드를 retain 으로 발행
  await mqtt.publish(topics.meta(d.user_id, d.device_id), null, { retain: true })
    .catch((err) => logger.warn('meta clear failed', { err: err.message }));
  logger.info('device deleted', { deviceId: d.device_id, userId: req.user.id });
  ok(res, { deviceId: d.device_id, deleted: true });
}));

svc.app.use('/api/v1', r);

// 브로커가 초기화돼도 시뮬레이터가 기기를 알 수 있도록, 연결될 때마다 등록 기기 meta 를 다시 발행
mqtt.client.on('connect', async () => {
  try {
    const { rows } = await pool.query('SELECT device_id, user_id, type, name, location FROM devices');
    await Promise.all(rows.map(publishMeta));
    logger.info('device meta republished', { count: rows.length });
  } catch (err) {
    logger.warn('meta republish failed', { err: err.message });
  }
});

svc.start({
  port: envInt('PORT', 3002),
  readiness: async () => {
    await pool.query('SELECT 1');
    if (!mqtt.isConnected()) throw new Error('mqtt not connected');
  },
  onShutdown: async () => { mqtt.client.end(); await pool.end(); },
});
