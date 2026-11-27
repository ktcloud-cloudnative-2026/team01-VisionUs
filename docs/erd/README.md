# ERD

[← README](../../README.md)

- 서비스마다 자기 DB를 가집니다. 다른 서비스의 DB는 직접 읽지 않고 API를 호출합니다
- 전체 그림: [Home_IoT_ERD.svg](Home_IoT_ERD.svg)

![Home IoT ERD](Home_IoT_ERD.svg)

## 전체 테이블

```mermaid
erDiagram
  users ||--o{ refresh_tokens : ""
  users ||--o{ devices : ""
  users ||--o{ commands : ""
  devices ||--o{ commands : ""
  devices ||--o{ device_states : ""
  devices ||--o{ device_events : ""
  devices ||--o{ simulators : ""
  devices ||--o{ elevator_calls : ""

  users {
    bigint user_id PK
    varchar email
    varchar password_hash
    varchar name
    timestamptz created_at
  }
  refresh_tokens {
    bigint token_id PK
    bigint user_id FK
    varchar token_hash
    varchar password_hash
    timestamptz expires_at
    timestamptz revoked_at
  }
  devices {
    varchar device_id PK
    bigint user_id FK
    varchar device_name
    varchar device_type
    varchar status
    timestamptz last_seen_at
    timestamptz created_at
  }
  commands {
    bigint command_id PK
    bigint user_id FK
    varchar device_id FK
    varchar command
    jsonb params
    varchar status
    timestamptz requested_at
    timestamptz completed_at
  }
  device_states {
    varchar device_id PK, FK
    bigint power
    jsonb state
    timestamptz updated_at
  }
  device_events {
    bigint event_id PK
    varchar device_id FK
    varchar event_type
    jsonb payload
    timestamptz occurred_at
  }
  simulators {
    bigint simulator_id PK
    varchar device_id FK
    varchar type
    varchar status
    integer interval_sec
  }
  elevator_calls {
    varchar call_id PK
    varchar device_id FK
    bigint user_id
    integer floor
    varchar direction
    varchar status
    timestamptz requested_at
  }
```

## DB 테이블 변경 · 시드 데이터
| 항목 | 방법 |
|---|---|
| 테이블 구조 | [`db/schema.sql`](../../db/schema.sql) (2026-11-27 실제 DB에서 뽑음). 구조를 바꾸면 이 파일도 같은 PR에서 고침 |
| 시드 데이터 | [`db/seed.sql`](../../db/seed.sql), 실행 방법: [DB 구조 · 샘플 데이터](../db-seed.md) |

> 위 그림의 일부 컬럼은 실제 DB와 다릅니다 (예: `devices.name` · `type`, `commands.command_id` 는 문자열, `device_states.power` 는 `on`/`off`). 실제 구조는 `db/schema.sql` 을 기준으로 봅니다.