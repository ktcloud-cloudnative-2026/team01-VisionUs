// 부하 테스트 뒷정리 (k6) — 테스트 기기 k6-light-01 ~ N 삭제
// 기기를 지우면 그 기기의 이벤트 · 상태도 DB에서 같이 지워진다 (ON DELETE CASCADE)
//
// 실행 (t1-ci):
//   read -s K6_PASSWORD; export K6_PASSWORD
//   DEVICES=30 ./k6 run cleanup.js
import http from 'k6/http';
import { fail } from 'k6';

const BASE = __ENV.BASE_URL || 'http://10.10.21.100';
const EMAIL = __ENV.K6_EMAIL || 'k6@visionus.test';
const DEVICES = Number(__ENV.DEVICES || 30);

export const options = { vus: 1, iterations: 1 };

export default function () {
  if (!__ENV.K6_PASSWORD) fail('K6_PASSWORD 가 없습니다');
  if (/\.200\b|visionus\.jpexstudio\.com/.test(BASE)) fail('prod 주소입니다. dev에만 씁니다');
  const res = http.post(`${BASE}/api/v1/auth/login`, JSON.stringify({ email: EMAIL, password: __ENV.K6_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } });
  if (res.status !== 200) fail(`로그인 실패 ${res.status}`);
  const auth = { headers: { Authorization: `Bearer ${res.json('data.accessToken')}` },
    responseCallback: http.expectedStatuses(200, 204, 404) };
  let deleted = 0;
  for (let i = 1; i <= DEVICES; i++) {
    const id = `k6-light-${String(i).padStart(2, '0')}`;
    const r = http.del(`${BASE}/api/v1/devices/${id}`, null, auth);
    if (r.status === 200 || r.status === 204) deleted++;
  }
  console.log(`삭제한 테스트 기기: ${deleted}대`);
}
