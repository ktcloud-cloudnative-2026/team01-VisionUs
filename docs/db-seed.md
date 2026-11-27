# DB 구조 · 샘플 데이터 (시드)

[← README](../README.md) · [ERD](erd/README.md) · [아키텍처](architecture.md)

새 환경(로컬 PostgreSQL, 새 스키마)에서 DB를 바로 쓸 수 있게 테이블을 만들고 시연용 데이터를 넣는 스크립트입니다.

| 파일 | 하는 일 |
|---|---|
| [`db/schema.sql`](../db/schema.sql) | 테이블 8개 · 제약조건 · 인덱스 만들기. 2026-11-27 t1-db의 dev 스키마에서 뽑은 것이라 실제 DB와 같음 |
| [`db/seed.sql`](../db/seed.sql) | 집 2개 · 기기 8대 · 명령 · 엘리베이터 호출 · 이벤트 샘플 넣기 |

- 둘 다 **여러 번 실행해도 안전**합니다 (이미 있으면 건너뜀)
- 서비스는 환경 변수 `DB_SCHEMA`(dev / prod)로 정한 스키마 하나를 씁니다. 스크립트도 `-v schema=` 로 스키마를 받습니다
- **공용 dev · prod 스키마에는 팀에 말하지 않고 넣지 않습니다.** 다른 사람 데이터와 섞입니다

## 1. 테이블

| 테이블 | 담당 서비스 | 내용 |
|---|---|---|
| `users` | auth | 사용자 (이메일 유일, 비밀번호는 bcrypt 해시) |
| `refresh_tokens` | auth | 로그인 유지 토큰 해시 |
| `devices` | device | 기기 (종류: light · aircon · heater · purifier · curtain · elevator, 상태: online · offline) |
| `device_states` | device · telemetry | 기기 현재 상태 (기기당 한 줄, `power` + `state` JSON) |
| `commands` | control | 제어 명령 (requested · completed · failed · timeout) |
| `elevator_calls` | control | 엘리베이터 호출 (requested · arriving · arrived · failed) |
| `device_events` | telemetry | 이벤트 기록 (STATE_CHANGED · COMMAND_SENT · ONLINE · OFFLINE) |
| `simulators` | - | 설계 때 만든 테이블. 지금 코드는 쓰지 않음 (시뮬레이터는 상태를 메모리에 둠) |

기기를 지우면 그 기기의 상태 · 명령 · 호출 · 이벤트가 같이 지워집니다 (`ON DELETE CASCADE`). 사용자를 지우려면 그 사용자의 명령 · 호출이 먼저 없어야 합니다 (`ON DELETE RESTRICT`).

## 2. 샘플 데이터

| 계정 | 기기 |
|---|---|
| `demo1@visionus.test` (데모 1번 집) | 거실 조명 · 거실 에어컨 · 안방 난방기 · 안방 공기청정기 · 거실 커튼 · 엘리베이터 |
| `demo2@visionus.test` (데모 2번 집) | 방 조명 · 방 에어컨 |

- 명령 3건(거실 조명 켬 → 끔, 에어컨 온도 변경 시간 초과), 엘리베이터 호출 1건, 이벤트 6건 (`payload` 에 `"seed": true`)
- 기기 현재 상태는 서비스의 초기 상태(조명 · 에어컨 등 꺼짐)와 같습니다. 시뮬레이터가 기기를 만들 때 초기 상태로 시작해 보고하므로, 다르게 넣으면 바로 덮어써지기 때문입니다
- 기기는 처음에 `offline` 입니다. device 서비스가 MQTT에 연결될 때 등록된 기기 정보를 다시 보내므로, device 파드가 새로 뜨면 시뮬레이터가 기기를 만들고 telemetry가 `online` 으로 바꿉니다
- 두 계정의 비밀번호는 실행할 때 정합니다. 비밀번호 원문과 해시는 Git에 두지 않습니다

## 3. 실행

```bash
# 1) 데모 계정 비밀번호 정하기 (화면에 안 보임)
read -s DEMO_PW; export DEMO_PW

#    비밀번호 → bcrypt 해시 (둘 중 하나)
#  A. auth 서비스와 같은 라이브러리(bcryptjs)로 — 기본 (저장소 루트에서, Node.js 필요)
(cd services/auth && npm ci --silent)
PW_HASH=$(cd services/auth && node -e "console.log(require('bcryptjs').hashSync(process.env.DEMO_PW, 10))")
#  B. Node.js가 없으면 PostgreSQL로 — 내 로컬 DB에서만 (pgcrypto 확장을 설치하므로 공용 t1-db에서는 하지 않음)
#     PW_HASH=$(printf '%s\n' "SET client_min_messages = warning;" "CREATE EXTENSION IF NOT EXISTS pgcrypto;" "SELECT crypt(:'pw', gen_salt('bf', 10));" | psql -d homeiot -tAq -v pw="$DEMO_PW")
unset DEMO_PW

# 2) 테이블 → 샘플 데이터
psql -d homeiot -v schema=local -f db/schema.sql
psql -d homeiot -v schema=local -v pw_hash="$PW_HASH" -f db/seed.sql
unset PW_HASH
```

- 마지막에 계정별 기기 수(`demo1` 6대, `demo2` 2대)가 나오면 끝입니다
- `pw_hash` 가 없거나 bcrypt 해시 모양(`$2a$10$…`, 60자)이 아니면 아무것도 넣지 않고 멈춥니다
- 서비스를 이 스키마에 붙이려면 서비스 설정의 `DB_SCHEMA` 를 같은 이름(위 예시는 `local`)으로 둡니다

## 4. 샘플 데이터 지우기

명령 · 호출이 사용자를 붙잡고 있어서 **기기 먼저, 사용자 나중** 순서로 지웁니다.

```sql
SET search_path TO local;   -- 넣은 스키마
BEGIN;
DELETE FROM devices WHERE device_id LIKE 'demo_-%';        -- 상태 · 명령 · 호출 · 이벤트도 같이 지워짐
DELETE FROM users   WHERE email LIKE 'demo_@visionus.test';
COMMIT;
```

## 5. 확인한 것

PostgreSQL 16.15(t1-db와 같은 버전)에서 시험했습니다.

- `schema.sql` 로 만든 구조를 다시 `pg_dump` 해서 t1-db dev 스키마와 비교: 테이블 · 컬럼 · 기본값 · 키 · 인덱스 · 이름이 같음 (CHECK 조건을 글로 적는 방식만 다르고 뜻은 같음)
- 두 스크립트를 두 번씩 실행해도 데이터가 두 배가 되지 않음
- 빈 해시 · 잘못된 해시는 거부됨, 넣은 해시로 비밀번호 확인됨
- 4절 지우기로 샘플 데이터가 모두 지워짐
