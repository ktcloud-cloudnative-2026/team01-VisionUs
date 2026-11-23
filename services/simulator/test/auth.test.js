'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { requireUser, userHeaders } = require('../common/src/auth');

const run = (headers) => {
  const req = { headers };
  let err;
  requireUser(req, {}, (e) => { err = e; });
  return { req, err };
};

test('Gateway 가 넣어 준 x-user-id 로 사용자 식별', () => {
  const { req, err } = run({ 'x-user-id': '7', 'x-user-email': 'a@b.c' });
  assert.equal(err, undefined);
  assert.deepEqual(req.user, { id: 7, email: 'a@b.c' });
});

test('헤더가 없거나 이상하면 401 (Gateway 를 거치지 않은 요청)', () => {
  for (const h of [{}, { 'x-user-id': '' }, { 'x-user-id': 'abc' }, { 'x-user-id': '-1' }, { 'x-user-id': '1.5' }]) {
    assert.equal(run(h).err.status, 401);
  }
});

test('서비스 간 호출 헤더', () => {
  assert.deepEqual(userHeaders({ id: 7, email: null }), { 'x-user-id': '7' });
  assert.deepEqual(userHeaders({ id: 7, email: 'a@b.c' }), { 'x-user-id': '7', 'x-user-email': 'a@b.c' });
});
