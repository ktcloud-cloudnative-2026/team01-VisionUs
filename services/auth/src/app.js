import express from 'express';
import client from 'prom-client';
import { randomUUID } from 'node:crypto';

export const SERVICE = 'auth';

// JSON 로그 한 줄 (관측 설계 3번 형식)
export function log(level, message, extra = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), level, service: SERVICE, message, ...extra }));
}

// 지표 (관측 설계 1번 공통 지표)
client.collectDefaultMetrics();
const httpRequests = new client.Counter({
  name: 'http_requests_total',
  help: 'HTTP 요청 수',
  labelNames: ['service', 'method', 'route', 'status'],
});
const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP 응답 시간(초)',
  labelNames: ['service', 'method', 'route', 'status'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});

export const app = express();

// 모든 요청: request_id 붙이고, 지표 세고, 로그 남기기
app.use((req, res, next) => {
  const requestId = req.get('x-request-id') || randomUUID();
  res.set('x-request-id', requestId);
  const stop = httpDuration.startTimer();
  res.on('finish', () => {
    const route = req.route ? req.baseUrl + req.route.path : 'unmatched';
    const labels = { service: SERVICE, method: req.method, route, status: String(res.statusCode) };
    httpRequests.inc(labels);
    stop(labels);
    if (req.path !== '/health' && req.path !== '/metrics') {
      log('info', 'request', { request_id: requestId, method: req.method, path: req.path, status: res.statusCode });
    }
  });
  next();
});

// 쿠버네티스가 살아 있는지 확인하는 곳
app.get('/health', (req, res) => res.json({ status: 'ok', service: SERVICE }));

// Prometheus가 지표를 가져가는 곳
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

// 이 서비스의 API (복사해서 쓸 때 이 아래를 자기 기능으로 바꾸기)
app.get('/api/auth', (req, res) => res.json({ message: 'hello from auth v3' }));
