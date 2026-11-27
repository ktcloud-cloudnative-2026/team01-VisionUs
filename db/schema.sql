-- Home IoT DB 구조 (PostgreSQL 16)
-- 2026-11-27 t1-db의 dev 스키마를 pg_dump --schema-only 로 뽑아 정리한 것. 실제 DB와 같습니다.
--
-- 사용: psql -v schema=<스키마 이름> -f db/schema.sql
--   - 모든 서비스는 DB_SCHEMA(dev / prod)로 정한 스키마 하나에 테이블을 둡니다 (search_path)
--   - 이미 있는 테이블은 건너뜁니다 (IF NOT EXISTS) → 여러 번 실행해도 안전
--   - 테이블 담당: users · refresh_tokens = auth, devices · device_states = device,
--     commands · elevator_calls = control, device_events = telemetry
\set ON_ERROR_STOP on
\if :{?schema}
\else
  \echo 'schema 변수가 필요합니다. 예: psql -v schema=local -f db/schema.sql'
  \quit
\endif

SET client_min_messages = warning;
CREATE SCHEMA IF NOT EXISTS :"schema";
SET search_path TO :"schema";

-- 사용자 (auth)
CREATE TABLE IF NOT EXISTS users (
    user_id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         varchar(255) NOT NULL CONSTRAINT uq_users_email UNIQUE,
    password_hash varchar(255) NOT NULL,
    name          varchar(50)  NOT NULL,
    created_at    timestamptz  NOT NULL DEFAULT now()
);

-- 로그인 유지 토큰 (auth). 토큰 원문이 아니라 해시만 저장
CREATE TABLE IF NOT EXISTS refresh_tokens (
    token_id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    bigint       NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    token_hash varchar(255) NOT NULL CONSTRAINT uq_refresh_tokens_hash UNIQUE,
    expires_at timestamptz  NOT NULL,
    revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id);

-- 기기 (device)
CREATE TABLE IF NOT EXISTS devices (
    device_id    varchar(50)  PRIMARY KEY,
    user_id      bigint       NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    name         varchar(100) NOT NULL,
    type         varchar(20)  NOT NULL
                 CONSTRAINT devices_type_check CHECK (type IN ('light', 'aircon', 'heater', 'purifier', 'curtain', 'elevator')),
    location     varchar(50),
    status       varchar(10)  NOT NULL DEFAULT 'offline'
                 CONSTRAINT devices_status_check CHECK (status IN ('online', 'offline')),
    last_seen_at timestamptz,
    created_at   timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_devices_user_type ON devices (user_id, type);

-- 기기 현재 상태 (device가 만들고 telemetry가 갱신). 기기당 한 줄
CREATE TABLE IF NOT EXISTS device_states (
    device_id  varchar(50) PRIMARY KEY REFERENCES devices(device_id) ON DELETE CASCADE,
    power      varchar(3)  CONSTRAINT device_states_power_check CHECK (power IN ('on', 'off')),  -- 커튼 · 엘리베이터는 NULL
    state      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 제어 명령 (control)
CREATE TABLE IF NOT EXISTS commands (
    command_id   varchar(50) PRIMARY KEY,                      -- 예: cmd-20261127-1a2b3c4d
    device_id    varchar(50) NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    user_id      bigint      NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    command      varchar(30) NOT NULL,
    params       jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status       varchar(15) NOT NULL DEFAULT 'requested'
                 CONSTRAINT commands_status_check CHECK (status IN ('requested', 'completed', 'failed', 'timeout')),
    requested_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_commands_device_time ON commands (device_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_commands_user ON commands (user_id);

-- 엘리베이터 호출 (control)
CREATE TABLE IF NOT EXISTS elevator_calls (
    call_id      varchar(50) PRIMARY KEY,                      -- 예: call-20261127-1a2b3c4d
    device_id    varchar(50) NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    user_id      bigint      NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    floor        integer     NOT NULL,
    direction    varchar(4)  CONSTRAINT elevator_calls_direction_check CHECK (direction IN ('up', 'down')),
    status       varchar(15) NOT NULL DEFAULT 'requested'
                 CONSTRAINT elevator_calls_status_check CHECK (status IN ('requested', 'arriving', 'arrived', 'failed')),
    requested_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_elevator_calls_device_status ON elevator_calls (device_id, status);

-- 기기 이벤트 기록 (telemetry)
CREATE TABLE IF NOT EXISTS device_events (
    event_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    device_id   varchar(50) NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    event_type  varchar(30) NOT NULL
                CONSTRAINT device_events_event_type_check CHECK (event_type IN ('STATE_CHANGED', 'COMMAND_SENT', 'ONLINE', 'OFFLINE')),
    payload     jsonb       NOT NULL DEFAULT '{}'::jsonb,
    occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_device_events_device_time ON device_events (device_id, occurred_at DESC);

-- 시뮬레이터 설정 (설계 때 만든 테이블. 지금 서비스 코드는 쓰지 않음, 시뮬레이터는 상태를 메모리에 둠)
CREATE TABLE IF NOT EXISTS simulators (
    simulator_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    device_id    varchar(50) NOT NULL CONSTRAINT uq_simulators_device UNIQUE REFERENCES devices(device_id) ON DELETE CASCADE,
    type         varchar(20) NOT NULL,
    status       varchar(10) NOT NULL DEFAULT 'stopped'
                 CONSTRAINT simulators_status_check CHECK (status IN ('running', 'stopped')),
    interval_sec integer     NOT NULL DEFAULT 5
);
