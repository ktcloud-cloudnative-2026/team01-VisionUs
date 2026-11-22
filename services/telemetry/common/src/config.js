'use strict';
const fs = require('node:fs');
const path = require('node:path');

/** 환경 변수 읽기. 기본값이 없고 값도 없으면 시작 시 바로 실패시킨다. */
function env(name, defaultValue) {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (defaultValue === undefined) throw new Error(`환경 변수 ${name} 가 필요합니다`);
    return defaultValue;
  }
  return v;
}

function envInt(name, defaultValue) {
  const v = Number.parseInt(env(name, String(defaultValue)), 10);
  if (Number.isNaN(v)) throw new Error(`환경 변수 ${name} 는 정수여야 합니다`);
  return v;
}

/**
 * PEM 같은 비밀값 읽기: NAME 에 값이 직접 있거나, NAME_FILE 에 파일 경로가 있으면 읽는다.
 * (쿠버네티스 Secret 마운트 / 로컬 secrets/ 폴더 둘 다 지원)
 */
function envSecret(name, { required = true } = {}) {
  if (process.env[name]) return process.env[name].replace(/\\n/g, '\n');
  const file = process.env[`${name}_FILE`];
  if (file) return fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');
  if (required) throw new Error(`${name} 또는 ${name}_FILE 환경 변수가 필요합니다`);
  return undefined;
}

module.exports = { env, envInt, envSecret };
