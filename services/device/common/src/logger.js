'use strict';
/**
 * JSON 한 줄 로그 (Loki 수집 전제). 필드: time, level, service, msg, ...extra
 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function createLogger(service) {
  const min = LEVELS[process.env.LOG_LEVEL || 'info'] ?? 20;
  const write = (level, msg, extra) => {
    if (LEVELS[level] < min) return;
    const line = { time: new Date().toISOString(), level, service, msg };
    if (extra) {
      for (const [k, v] of Object.entries(extra)) {
        line[k] = v instanceof Error ? { message: v.message, stack: v.stack } : v;
      }
    }
    (level === 'error' ? process.stderr : process.stdout).write(JSON.stringify(line) + '\n');
  };
  return {
    debug: (m, e) => write('debug', m, e),
    info: (m, e) => write('info', m, e),
    warn: (m, e) => write('warn', m, e),
    error: (m, e) => write('error', m, e),
  };
}

module.exports = { createLogger };
