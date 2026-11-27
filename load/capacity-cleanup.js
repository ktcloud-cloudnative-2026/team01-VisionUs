// 용량 테스트 뒷정리 (k6) — 집(계정)마다 테스트 기기 3대 삭제
// 기기를 지우면 그 기기의 이벤트 · 상태도 DB에서 같이 지워진다. 테스트 계정(k6-uNNN@visionus.test)은 다시 쓰려고 남긴다
//
// 실행 (t1-ci): ACCOUNTS=200 ./k6-v0.54.0-linux-amd64/k6 run capacity-cleanup.js
import http from 'k6/http';
import { fail } from 'k6';

const BASE = __ENV.BASE_URL || 'http://10.10.21.100';
const ACCOUNTS = Number(__ENV.ACCOUNTS || 200);
const TYPES = ['light', 'aircon', 'purifier'];
const pad = (n) => String(n).padStart(3, '0');

export const options = { vus: 1, iterations: 1, duration: '10m' };

export default function () {
  if (!__ENV.K6_PASSWORD) fail('K6_PASSWORD 가 없습니다');
  if (/\.200\b|visionus\.jpexstudio\.com/.test(BASE)) fail('prod 주소입니다. dev에만 씁니다');
  let deleted = 0;
  for (let a = 1; a <= ACCOUNTS; a++) {
    const res = http.post(`${BASE}/api/v1/auth/login`, JSON.stringify({ email: `k6-u${pad(a)}@visionus.test`, password: __ENV.K6_PASSWORD }),
      { headers: { 'Content-Type': 'application/json' }, responseCallback: http.expectedStatuses(200, 401) });
    if (res.status !== 200) continue; // 없는 계정은 건너뜀
    const auth = { headers: { Authorization: `Bearer ${res.json('data.accessToken')}` }, responseCallback: http.expectedStatuses(200, 204, 404) };
    for (const t of TYPES) {
      const r = http.del(`${BASE}/api/v1/devices/k6-u${pad(a)}-${t}`, null, auth);
      if (r.status === 200 || r.status === 204) deleted++;
    }
  }
  console.log(`삭제한 테스트 기기: ${deleted}대`);
}
