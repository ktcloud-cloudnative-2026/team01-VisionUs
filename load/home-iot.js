// Home IoT 부하 테스트 (k6) — dev 클러스터 전용
//
// 사용자가 앱을 쓰는 흐름을 여러 명이 동시에 반복한다:
//   기기 목록 보기(device) → 기기 이벤트 보기(telemetry) → 조명 밝기 바꾸기(control → MQTT → simulator)
//
// 실행 (t1-ci):
//   read -s K6_PASSWORD; export K6_PASSWORD
//   docker run --rm -i --network host -v "$PWD/load:/load" -w /load \
//     -e K6_PASSWORD -e LABEL=before grafana/k6:0.54.0 run home-iot.js
//   unset K6_PASSWORD
//
// 환경 변수
//   BASE_URL     기본 http://10.10.21.100 (dev Gateway). prod에는 돌리지 않는다
//   K6_EMAIL     기본 k6@visionus.test (부하 테스트 전용 계정, 없으면 만든다)
//   K6_PASSWORD  필수. Git에 쓰지 않는다
//   LABEL        결과 파일 이름 (before / after). results/<LABEL>.json 으로 저장
//   PEAK         최대 동시 사용자 수 (기본 30)
//   DEVICES      테스트 기기 수 (기본 1). 1이면 모든 사용자가 같은 기기 1대를 조작,
//                N이면 k6-light-01 ~ N을 만들어 사용자를 나눠 붙인다 (실제 집마다 기기가 따로인 상황)
import http from 'k6/http';
import { check, sleep, fail } from 'k6';

const BASE = __ENV.BASE_URL || 'http://10.10.21.100';
const EMAIL = __ENV.K6_EMAIL || 'k6@visionus.test';
const PASSWORD = __ENV.K6_PASSWORD;
const LABEL = __ENV.LABEL || 'run';
const PEAK = Number(__ENV.PEAK || 30);
const DEVICES = Number(__ENV.DEVICES || 1);
const deviceId = (i) => `k6-light-${String(i + 1).padStart(2, '0')}`;

export const options = {
  stages: [
    { duration: '30s', target: Math.ceil(PEAK / 3) }, // 천천히 올리기
    { duration: '1m', target: Math.ceil(PEAK / 3) },  // 평소
    { duration: '30s', target: PEAK },                // 몰릴 때
    { duration: '1m30s', target: PEAK },
    { duration: '30s', target: 0 },                   // 내리기
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],                         // 실패 1% 미만
    'http_req_duration{api:devices}': ['p(95)<500'],
    'http_req_duration{api:events}': ['p(95)<500'],
    'http_req_duration{api:command}': ['p(95)<1000'],       // 기기 응답까지 기다리는 API
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'max'],
};

const JSON_HDR = { headers: { 'Content-Type': 'application/json' } };

// 한 번만: 로그인(없으면 가입) → 테스트 기기 등록 → 시뮬레이터가 온라인으로 만들 때까지 대기
export function setup() {
  if (!PASSWORD) fail('K6_PASSWORD 가 없습니다 (read -s 로 넣기)');
  if (/\.200\b|visionus\.jpexstudio\.com/.test(BASE)) fail('prod 주소입니다. dev에만 돌립니다');

  // 준비 단계의 401(계정 없음) · 409(기기 이미 있음)는 정상이라 실패율에서 뺀다
  const login = () => http.post(`${BASE}/api/v1/auth/login`, JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { ...JSON_HDR, responseCallback: http.expectedStatuses(200, 401) });
  let res = login();
  if (res.status === 401) {
    http.post(`${BASE}/api/v1/auth/signup`, JSON.stringify({ email: EMAIL, password: PASSWORD, name: 'k6 부하 테스트' }), JSON_HDR);
    res = login();
  }
  if (res.status !== 200) fail(`로그인 실패 ${res.status}`);
  const token = res.json('data.accessToken');
  const auth = { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };

  for (let i = 0; i < DEVICES; i++) {
    const reg = http.post(`${BASE}/api/v1/devices`,
      JSON.stringify({ deviceId: deviceId(i), name: `k6 조명 ${i + 1}`, type: 'light', location: '부하 테스트' }),
      { ...auth, responseCallback: http.expectedStatuses(201, 409) });
    if (reg.status !== 201 && reg.status !== 409) fail(`기기 등록 실패 ${reg.status} ${reg.body}`);
  }

  for (let t = 0; t < 30; t++) {
    const d = http.get(`${BASE}/api/v1/devices`, auth);
    const online = d.status === 200
      ? d.json('data').filter((x) => x.deviceId.startsWith('k6-light-') && x.status === 'online').length : 0;
    if (online >= DEVICES) return { token };
    sleep(1);
  }
  fail(`기기 ${DEVICES}대가 30초 안에 모두 online 이 안 됨 (시뮬레이터 확인)`);
}

export default function ({ token }) {
  const DEVICE_ID = deviceId((__VU - 1) % DEVICES);
  const auth = { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };

  const list = http.get(`${BASE}/api/v1/devices`, { ...auth, tags: { api: 'devices' } });
  check(list, { '기기 목록 200': (r) => r.status === 200 });

  const ev = http.get(`${BASE}/api/v1/devices/${DEVICE_ID}/events?limit=20`, { ...auth, tags: { api: 'events' } });
  check(ev, { '이벤트 200': (r) => r.status === 200 });

  const cmd = http.post(`${BASE}/api/v1/devices/${DEVICE_ID}/commands`,
    JSON.stringify({ command: 'SET_BRIGHTNESS', params: { brightness: Math.floor(Math.random() * 101) } }),
    { ...auth, tags: { api: 'command' } });
  check(cmd, { '제어 200': (r) => r.status === 200 });

  sleep(1); // 사람이 화면을 보는 시간
}

export function handleSummary(data) {
  const m = data.metrics;
  const pick = (name) => {
    const v = m[name] && m[name].values;
    return v ? { avg: v.avg, p95: v['p(95)'], max: v.max } : null;
  };
  const short = {
    label: LABEL,
    peakVus: PEAK,
    devices: DEVICES,
    requests: m.http_reqs.values.count,
    rps: m.http_reqs.values.rate,
    failedRate: m.http_req_failed.values.rate,
    all: pick('http_req_duration'),
    devices: pick('http_req_duration{api:devices}'),
    events: pick('http_req_duration{api:events}'),
    command: pick('http_req_duration{api:command}'),
  };
  const f = (x) => (x ? `avg ${x.avg.toFixed(1)}ms · p95 ${x.p95.toFixed(1)}ms · max ${x.max.toFixed(0)}ms` : '-');
  const text = [
    `\n===== ${LABEL} (최대 ${PEAK}명 · 기기 ${DEVICES}대) =====`,
    `요청 ${short.requests}건 · 초당 ${short.rps.toFixed(1)}건 · 실패 ${(short.failedRate * 100).toFixed(2)}%`,
    `전체      ${f(short.all)}`,
    `기기 목록 ${f(short.devices)}`,
    `이벤트    ${f(short.events)}`,
    `제어      ${f(short.command)}`,
    '',
  ].join('\n');
  return {
    stdout: text,
    [`results/${LABEL}.json`]: JSON.stringify(short, null, 2),
  };
}
