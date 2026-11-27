-- Home IoT 샘플 데이터 (시연 · 로컬 개발용)
-- db/schema.sql 을 먼저 실행한 스키마에 넣습니다. 공용 dev · prod에는 팀에 말하지 않고 넣지 않습니다.
--
-- 사용: psql -v schema=<스키마> -v pw_hash='<bcrypt 해시>' -f db/seed.sql
--   - 비밀번호 원문 · 해시를 Git에 두지 않으려고 해시를 변수로 받습니다 (만드는 법: docs/db-seed.md)
--   - 여러 번 실행해도 같은 데이터가 두 번 들어가지 않습니다 (ON CONFLICT DO NOTHING · 존재 확인)
--
-- 들어가는 것
--   집 2개: demo1@visionus.test (기기 6종 전부), demo2@visionus.test (조명 · 에어컨)
--   기기 현재 상태(초기값), 최근 제어 명령 · 엘리베이터 호출 · 이벤트 기록 몇 줄
\set ON_ERROR_STOP on
\if :{?schema}
\else
  \echo 'schema 변수가 필요합니다. 예: psql -v schema=local -v pw_hash=... -f db/seed.sql'
  \quit
\endif
\if :{?pw_hash}
\else
  \echo 'pw_hash 변수가 필요합니다 (bcrypt 해시). 만드는 법: docs/db-seed.md'
  \quit
\endif
SELECT :'pw_hash' ~ '^\$2[aby]\$[0-9]{2}\$.{53}$' AS pw_hash_ok \gset
\if :pw_hash_ok
\else
  \echo 'pw_hash 가 bcrypt 해시 모양이 아닙니다 ($2a$10$… 60자). 만드는 법: docs/db-seed.md'
  \quit
\endif

SET client_min_messages = warning;
SET search_path TO :"schema";
BEGIN;

-- 1. 사용자 (auth)
INSERT INTO users (email, password_hash, name) VALUES
    ('demo1@visionus.test', :'pw_hash', '데모 1번 집'),
    ('demo2@visionus.test', :'pw_hash', '데모 2번 집')
ON CONFLICT (email) DO NOTHING;

-- 2. 기기 (device). 처음엔 offline, 시뮬레이터가 붙으면 telemetry가 online으로 바꿈
INSERT INTO devices (device_id, user_id, name, type, location)
SELECT d.device_id, u.user_id, d.name, d.type, d.location
FROM (VALUES
    ('demo1-light-living',   'demo1@visionus.test', '거실 조명',     'light',    '거실'),
    ('demo1-aircon-living',  'demo1@visionus.test', '거실 에어컨',   'aircon',   '거실'),
    ('demo1-heater-room',    'demo1@visionus.test', '안방 난방기',   'heater',   '안방'),
    ('demo1-purifier-room',  'demo1@visionus.test', '안방 공기청정기', 'purifier', '안방'),
    ('demo1-curtain-living', 'demo1@visionus.test', '거실 커튼',     'curtain',  '거실'),
    ('demo1-elevator',       'demo1@visionus.test', '엘리베이터',    'elevator', '공용'),
    ('demo2-light-room',     'demo2@visionus.test', '방 조명',       'light',    '방'),
    ('demo2-aircon-room',    'demo2@visionus.test', '방 에어컨',     'aircon',   '방')
) AS d(device_id, email, name, type, location)
JOIN users u ON u.email = d.email
ON CONFLICT (device_id) DO NOTHING;

-- 3. 기기 현재 상태 (device). 서비스의 기기별 초기 상태(common/src/devices.js initialState)와 같게 둠
--    시뮬레이터는 기기를 만들 때 이 초기 상태로 시작해 보고하므로, 다르게 넣으면 바로 덮어써지고 이벤트가 하나 더 생김
INSERT INTO device_states (device_id, power, state) VALUES
    ('demo1-light-living',   'off', '{"brightness": 70}'),
    ('demo1-aircon-living',  'off', '{"temperature": 24, "mode": "cool"}'),
    ('demo1-heater-room',    'off', '{"temperature": 22}'),
    ('demo1-purifier-room',  'off', '{"fanSpeed": "mid"}'),
    ('demo1-curtain-living', NULL,  '{"position": 0}'),
    ('demo1-elevator',       NULL,  '{"currentFloor": 1, "callStatus": "idle", "targetFloor": null}'),
    ('demo2-light-room',     'off', '{"brightness": 70}'),
    ('demo2-aircon-room',    'off', '{"temperature": 24, "mode": "cool"}')
ON CONFLICT (device_id) DO NOTHING;

-- 4. 제어 명령 (control). 실제 id는 cmd-날짜-8자리, 시드는 알아보기 쉽게 cmd-seed-번호
--    거실 조명을 켰다가(30분 전) 껐고(25분 전), 에어컨 온도 변경은 기기가 응답하지 않아 시간 초과(10분 전)
INSERT INTO commands (command_id, device_id, user_id, command, params, status, requested_at, completed_at)
SELECT c.command_id, c.device_id, u.user_id, c.command, c.params::jsonb, c.status,
       now() - c.ago, CASE WHEN c.status = 'completed' THEN now() - c.ago + interval '1 second' END
FROM (VALUES
    ('cmd-seed-0001', 'demo1-light-living',  'demo1@visionus.test', 'SET_POWER',       '{"power": "on"}',     'completed', interval '30 minutes'),
    ('cmd-seed-0002', 'demo1-light-living',  'demo1@visionus.test', 'SET_POWER',       '{"power": "off"}',    'completed', interval '25 minutes'),
    ('cmd-seed-0003', 'demo1-aircon-living', 'demo1@visionus.test', 'SET_TEMPERATURE', '{"temperature": 26}', 'timeout',   interval '10 minutes')
) AS c(command_id, device_id, email, command, params, status, ago)
JOIN users u ON u.email = c.email
ON CONFLICT (command_id) DO NOTHING;

-- 5. 엘리베이터 호출 (control)
INSERT INTO elevator_calls (call_id, device_id, user_id, floor, direction, status, requested_at)
SELECT 'call-seed-0001', 'demo1-elevator', u.user_id, 1, 'down', 'arrived', now() - interval '15 minutes'
FROM users u WHERE u.email = 'demo1@visionus.test'
ON CONFLICT (call_id) DO NOTHING;

-- 6. 이벤트 기록 (telemetry). 이미 시드 이벤트가 있으면 넣지 않음
INSERT INTO device_events (device_id, event_type, payload, occurred_at)
SELECT e.device_id, e.event_type, e.payload::jsonb, now() - e.ago
FROM (VALUES
    ('demo1-light-living',  'ONLINE',        '{"seed": true}', interval '40 minutes'),
    ('demo1-light-living',  'COMMAND_SENT',  '{"seed": true, "commandId": "cmd-seed-0001", "command": "SET_POWER", "params": {"power": "on"}}', interval '30 minutes'),
    ('demo1-light-living',  'STATE_CHANGED', '{"seed": true, "commandId": "cmd-seed-0001", "before": {"power": "off", "state": {"brightness": 70}}, "after": {"power": "on", "state": {"brightness": 70}}}', interval '30 minutes'),
    ('demo1-light-living',  'COMMAND_SENT',  '{"seed": true, "commandId": "cmd-seed-0002", "command": "SET_POWER", "params": {"power": "off"}}', interval '25 minutes'),
    ('demo1-light-living',  'STATE_CHANGED', '{"seed": true, "commandId": "cmd-seed-0002", "before": {"power": "on", "state": {"brightness": 70}}, "after": {"power": "off", "state": {"brightness": 70}}}', interval '25 minutes'),
    ('demo1-aircon-living', 'COMMAND_SENT',  '{"seed": true, "commandId": "cmd-seed-0003", "command": "SET_TEMPERATURE", "params": {"temperature": 26}}', interval '10 minutes')
) AS e(device_id, event_type, payload, ago)
WHERE NOT EXISTS (SELECT 1 FROM device_events WHERE payload @> '{"seed": true}');

COMMIT;

-- 결과 확인
SELECT u.email, count(d.*) AS devices
FROM users u LEFT JOIN devices d ON d.user_id = u.user_id
WHERE u.email LIKE 'demo_@visionus.test'
GROUP BY u.email ORDER BY u.email;
