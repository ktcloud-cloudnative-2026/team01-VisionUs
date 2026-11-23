'use strict';
const express = require('express');
const promClient = require('prom-client');
const { createLogger } = require('./logger');
const { errorHandler, Errors } = require('./errors');
const { envInt } = require('./config');

/**
 * 모든 서비스 공통 골격
 *  - JSON 바디 파싱, 요청 로그, 지표(/metrics), 헬스체크(/healthz, /readyz)
 *  - 공통 에러 응답 형식
 * 사용:
 *   const svc = createService('auth-service');
 *   svc.app.use('/api/v1', router);
 *   svc.start({ port: 3001, readiness: async () => pool.query('select 1') });
 */
function createService(name) {
  const logger = createLogger(name);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  // ---- 지표 (관측 설계: 공통 지표) ----
  const registry = new promClient.Registry();
  registry.setDefaultLabels({ service: name });
  promClient.collectDefaultMetrics({ register: registry });
  const httpRequests = new promClient.Counter({
    name: 'http_requests_total',
    help: 'HTTP 요청 수',
    labelNames: ['method', 'route', 'status'],
    registers: [registry],
  });
  const httpDuration = new promClient.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP 요청 처리 시간',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10],
    registers: [registry],
  });

  app.use(express.json({ limit: '100kb' }));
  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      if (req.path === '/healthz' || req.path === '/readyz' || req.path === '/metrics') return;
      const sec = Number(process.hrtime.bigint() - start) / 1e9;
      const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : 'unmatched';
      const labels = { method: req.method, route, status: String(res.statusCode) };
      httpRequests.inc(labels);
      httpDuration.observe(labels, sec);
      logger.info('http request', {
        method: req.method, path: req.originalUrl, status: res.statusCode,
        durationMs: Math.round(sec * 1000), userId: req.user?.id,
      });
    });
    next();
  });

  let readiness = async () => {};
  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
  app.get('/readyz', async (req, res) => {
    try {
      await readiness();
      res.json({ status: 'ready' });
    } catch (err) {
      res.status(503).json({ status: 'not-ready', reason: err.message });
    }
  });
  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', registry.contentType);
    res.send(await registry.metrics());
  });

  function start({ port, readiness: r, onShutdown } = {}) {
    if (r) readiness = r;
    app.use((req, res, next) => next(Errors.notFound('요청한 경로가 없습니다.')));
    app.use(errorHandler(logger));
    const p = port ?? envInt('PORT', 3000);
    const server = app.listen(p, () => logger.info(`${name} listening`, { port: p }));
    const shutdown = async (sig) => {
      logger.info('shutting down', { sig });
      server.close();
      try { await onShutdown?.(); } catch (err) { logger.error('shutdown error', { err }); }
      setTimeout(() => process.exit(0), 300).unref();
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    return server;
  }

  return { app, logger, registry, promClient, start };
}

module.exports = { createService, express };
