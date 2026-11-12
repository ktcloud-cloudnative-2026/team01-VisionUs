import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/app.js';

test('GET /health 는 200', async () => {
  const server = app.listen(0);
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(res.status, 200);
  server.close();
});
