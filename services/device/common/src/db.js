'use strict';
const { Pool } = require('pg');
const { env, envInt } = require('./config');

/**
 * PostgreSQL 연결 풀. 모든 테이블은 DB_SCHEMA(기본 dev) 스키마 하나에 둔다.
 * search_path 를 연결 옵션으로 지정하므로 SQL 에서는 스키마 이름 없이 테이블명만 쓴다.
 */
function createPool(logger) {
  const schema = env('DB_SCHEMA', 'dev');
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('DB_SCHEMA 형식 오류');
  const pool = new Pool({
    host: env('DB_HOST', 'localhost'),
    port: envInt('DB_PORT', 5432),
    database: env('DB_NAME', 'homeiot'),
    user: env('DB_USER', 'homeiot'),
    password: env('DB_PASSWORD'),
    max: envInt('DB_POOL_MAX', 5),
    options: `-c search_path=${schema}`,
    connectionTimeoutMillis: 5000,
  });
  pool.on('error', (err) => logger.error('pg pool error', { err }));
  return pool;
}

/** 트랜잭션 헬퍼 */
async function tx(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await fn(client);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { createPool, tx };
