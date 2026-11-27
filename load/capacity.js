// 출시 전 용량 테스트 (k6) — dev 클러스터 전용
//
// 질문: 예상보다 사용자가 훨씬 많이 들어와서, 각자 기기를 여러 대 등록해 두고 동시에 누르면 서버가 버티나?
//
// 가정 (실제 사용에 맞춤)
//   - 예상 동시 접속 100명. 그 5배(500명)까지 단계별로 올려 본다 (100 → 200 → 300 → 500명, 단계마다 1분 유지)
//   - 집(계정) ACCOUNTS개(기본 200), 집마다 기기 3대 (조명 · 에어컨 · 공기청정기). 한 집에 가족 1~3명
//   - 사용자는 앱을 켜면 먼저 로그인, 그다음 반복: 기기 목록(항상) → 이벤트 보기(50%) → 기기 켜기/끄기(20%)
//     → 화면 보며 5~10초 쉬기
//   - 실패율이 5%를 넘으면 자동으로 멈춤 (dev · prod가 DB 서버를 같이 쓰므로 prod 보호)
//
// 실행 (t1-ci):
//   read -s K6_PASSWORD; export K6_PASSWORD
//   LABEL=capacity ./k6-v0.54.0-linux-amd64/k6 run capacity.js
//   ACCOUNTS=200 ./k6-v0.54.0-linux-amd64/k6 run capacity-cleanup.js   # 끝나면 테스트 기기 삭제
//   unset K6_PASSWORD
//
// 환경 변수: BASE_URL(기본 dev Gateway) · ACCOUNTS(기본 200) · STEPS(기본 "100,200,300,500") · LABEL
import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import exec from 'k6/execution';

const BASE = __ENV.BASE_URL || 'http://10.10.21.100';
const PASSWORD = __ENV.K6_PASSWORD;
const ACCOUNTS = Number(__ENV.ACCOUNTS || 200);
const STEPS = (__ENV.STEPS || '100,200,300,500').split(',').map(Number);
const LABEL = __ENV.LABEL || 'capacity';
const RAMP = 30; // 초: 다음 단계로 올라가는 시간
const HOLD = 60; // 초: 단계 유지 시간

const KINDS = [
  { type: 'light', name: '거실 조명' },
  { type: 'aircon', name: '에어컨' },
  { type: 'purifier', name: '공기청정기' },
];
const pad = (n) => String(n).padStart(3, '0');
const email = (a) => `k6-u${pad(a)}@visionus.test`;
const deviceId = (a, k) => `k6-u${pad(a)}-${KINDS[k].type}`;

// 단계: 올라가기 30초 + 유지 60초 반복, 마지막에 30초 내리기
const stages = [];
for (const s of STEPS) stages.push({ duration: `${RAMP}s`, target: s }, { duration: `${HOLD}s`, target: s });
stages.push({ duration: `${RAMP}s`, target: 0 });

// 단계별 결과를 따로 보기 위해 '유지' 구간 요청에 step 태그를 붙인다 (올라가는 구간은 ramp)
// 준비(setup) 시간을 빼고, 본 테스트(시나리오)가 시작된 때부터 잰다
function currentStep() {
  const t = (Date.now() - exec.scenario.startTime) / 1000;
  for (let i = 0; i < STEPS.length; i++) {
    const start = i * (RAMP + HOLD) + RAMP;
    if (t >= start && t < start + HOLD) return String(STEPS[i]);
  }
  return 'ramp';
}

const thresholds = {
  http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '30s' }],
  'http_req_duration{api:devices}': ['p(95)<500'],
  'http_req_duration{api:events}': ['p(95)<500'],
  'http_req_duration{api:command}': ['p(95)<1000'],
  'http_req_duration{api:login}': ['p(95)<1000'],
};
for (const s of STEPS) {
  thresholds[`http_req_duration{step:${s}}`] = ['p(95)<500'];
  thresholds[`http_req_failed{step:${s}}`] = ['rate<0.01'];
  thresholds[`http_reqs{step:${s}}`] = ['count>=0'];
}

export const options = { stages, thresholds, setupTimeout: '5m', summaryTrendStats: ['avg', 'p(95)', 'max'] };

const JSON_HDR = { headers: { 'Content-Type': 'application/json' } };

// 준비(측정 안 함): 집(계정) ACCOUNTS개 가입 + 집마다 기기 3대 등록 → 모두 online 될 때까지 대기
export function setup() {
  if (!PASSWORD) fail('K6_PASSWORD 가 없습니다 (read -s 로 넣기)');
  if (/\.200\b|visionus\.jpexstudio\.com/.test(BASE)) fail('prod 주소입니다. dev에만 돌립니다');
  const tokens = [];
  for (let a = 1; a <= ACCOUNTS; a++) {
    const login = () => http.post(`${BASE}/api/v1/auth/login`, JSON.stringify({ email: email(a), password: PASSWORD }),
      { ...JSON_HDR, responseCallback: http.expectedStatuses(200, 401) });
    let res = login();
    if (res.status === 401) {
      http.post(`${BASE}/api/v1/auth/signup`, JSON.stringify({ email: email(a), password: PASSWORD, name: `k6 집 ${a}` }), JSON_HDR);
      res = login();
    }
    if (res.status !== 200) fail(`계정 ${email(a)} 로그인 실패 ${res.status}`);
    const token = res.json('data.accessToken');
    const auth = { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
    KINDS.forEach((k, i) => {
      const r = http.post(`${BASE}/api/v1/devices`, JSON.stringify({ deviceId: deviceId(a, i), name: k.name, type: k.type, location: 'k6' }),
        { ...auth, responseCallback: http.expectedStatuses(201, 409) });
      if (r.status !== 201 && r.status !== 409) fail(`기기 등록 실패 ${r.status} ${r.body}`);
    });
    tokens.push(token);
  }
  // 모든 기기가 online 이 될 때까지 (시뮬레이터가 기기를 만들고 상태를 보내야 제어 가능)
  for (let t = 0; t < 60; t++) {
    let offline = 0;
    for (let a = 1; a <= ACCOUNTS; a += Math.max(1, Math.floor(ACCOUNTS / 10))) { // 10집만 표본 확인
      const r = http.get(`${BASE}/api/v1/devices`, { headers: { Authorization: `Bearer ${tokens[a - 1]}` } });
      offline += r.status === 200 ? r.json('data').filter((d) => d.status !== 'online').length : KINDS.length;
    }
    if (offline === 0) return {};
    sleep(2);
  }
  fail('기기가 2분 안에 online 이 안 됨 (시뮬레이터 확인)');
}

let myToken = null; // 사용자(VU)마다 앱을 켤 때 한 번 로그인

export default function () {
  const a = (exec.vu.idInTest - 1) % ACCOUNTS; // 내 집
  const step = currentStep();
  if (!myToken) {
    const res = http.post(`${BASE}/api/v1/auth/login`, JSON.stringify({ email: email(a + 1), password: PASSWORD }),
      { ...JSON_HDR, tags: { api: 'login', step } });
    check(res, { '로그인 200': (r) => r.status === 200 });
    if (res.status !== 200) { sleep(5); return; }
    myToken = res.json('data.accessToken');
  }
  const auth = { headers: { Authorization: `Bearer ${myToken}`, 'Content-Type': 'application/json' } };
  const tag = (api) => ({ ...auth, tags: { api, step } });
  const dev = deviceId(a + 1, Math.floor(Math.random() * KINDS.length));

  const list = http.get(`${BASE}/api/v1/devices`, tag('devices'));
  check(list, { '기기 목록 200': (r) => r.status === 200 });

  if (Math.random() < 0.5) {
    const ev = http.get(`${BASE}/api/v1/devices/${dev}/events?limit=20`, tag('events'));
    check(ev, { '이벤트 200': (r) => r.status === 200 });
  }
  if (Math.random() < 0.2) {
    const cmd = http.post(`${BASE}/api/v1/devices/${dev}/commands`,
      JSON.stringify({ command: 'SET_POWER', params: { power: Math.random() < 0.5 ? 'on' : 'off' } }), tag('command'));
    check(cmd, { '제어 200': (r) => r.status === 200 });
  }
  sleep(5 + Math.random() * 5); // 화면 보는 시간
}

export function handleSummary(data) {
  const m = data.metrics;
  const v = (name) => m[name] && m[name].values;
  const ms = (x) => (x === undefined ? '-' : `${x.toFixed(1)}ms`);
  const rows = STEPS.map((s) => {
    const d = v(`http_req_duration{step:${s}}`); const f = v(`http_req_failed{step:${s}}`); const n = v(`http_reqs{step:${s}}`);
    return { users: s, rps: n ? n.count / HOLD : 0, failed: f ? f.rate : 0, p95: d && d['p(95)'], avg: d && d.avg, max: d && d.max };
  });
  const api = (n) => { const x = v(`http_req_duration{api:${n}}`); return x ? { avg: x.avg, p95: x['p(95)'], max: x.max } : null; };
  const out = { label: LABEL, accounts: ACCOUNTS, devices: ACCOUNTS * KINDS.length, steps: rows,
    requests: m.http_reqs.values.count, failedRate: m.http_req_failed.values.rate,
    loginApi: api('login'), devicesApi: api('devices'), eventsApi: api('events'), commandApi: api('command') };
  const lines = [
    `\n===== ${LABEL} (집 ${ACCOUNTS}개 · 기기 ${ACCOUNTS * KINDS.length}대) =====`,
    '동시 사용자 | 초당 요청 | 실패    | 전체 p95',
    ...rows.map((r) => `${String(r.users).padStart(7)}명 | ${r.rps.toFixed(1).padStart(7)}건 | ${(r.failed * 100).toFixed(2).padStart(5)}% | ${ms(r.p95)}`),
    `API p95: 로그인 ${ms(out.loginApi && out.loginApi.p95)} · 기기 목록 ${ms(out.devicesApi && out.devicesApi.p95)} · 이벤트 ${ms(out.eventsApi && out.eventsApi.p95)} · 제어 ${ms(out.commandApi && out.commandApi.p95)}`,
    `전체 요청 ${out.requests}건 · 실패 ${(out.failedRate * 100).toFixed(2)}%`,
    '',
  ];
  return { stdout: lines.join('\n'), [`results/${LABEL}.json`]: JSON.stringify(out, null, 2) };
}
