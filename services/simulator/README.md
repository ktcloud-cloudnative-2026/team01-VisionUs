# simulator

가전 6종 가상 기기와 대시보드 화면(`/simulator`)을 제공하는 개발·시연용 서비스입니다.

- MQTT 클라이언트로만 동작하고 **DB 에 접근하지 않습니다.**
- `meta`(retained) 를 받아 가상 기기 생성 → `command` 구독 → `state` 발행
- `SIM_INTERVAL_SEC` 마다 모든 기기 state 재발행 (heartbeat, 오프라인 판정 기준)
- 엘리베이터: `call` 수신 → arriving → 층 이동(`SIM_FLOOR_MOVE_MS` 마다 한 층, 0층 없음) → arrived
- 화면: 기기 상태, 상태 직접 변경(손으로 조작한 경우 재현), 도착 처리, 연결 끊기(오프라인 · 504 재현), 이벤트 로그(SSE)

| 항목 | 값 |
| --- | --- |
| 포트 | 3005 |
| 의존 | MQTT 만 (DB 없음) |
| 공통 엔드포인트 | `/healthz`, `/readyz`, `/metrics` (`packages/common` 의 `createService`) |

## API

화면용 API (인증 없음, Gateway 의 `/simulator` 경로)

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/simulator/` | 대시보드 화면 (`src/public/index.html`) |
| GET | `/simulator/api/devices` | 가상 기기 목록 · MQTT 연결 상태 · 최근 로그 |
| POST | `/simulator/api/devices/:homeId/:deviceId/state` | 상태 직접 변경 |
| POST | `/simulator/api/devices/:homeId/:deviceId/arrive` | 엘리베이터 도착 처리 |
| POST | `/simulator/api/devices/:homeId/:deviceId/connection` | 연결 끊기 / 다시 연결 |
| GET | `/simulator/api/stream` | 이벤트 스트림 (SSE) |

## 환경 변수

로컬에서는 저장소 루트의 `.env` (`.env.example` 참고), 클러스터에서는 `deploy/k8s/base/configmap.yaml` 과 Secret 으로 주입합니다.

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `PORT` | 3005 | |
| `MQTT_URL` `MQTT_USERNAME` `MQTT_PASSWORD` | | MQTT 브로커 접속 |
| `SIM_INTERVAL_SEC` | 5 | heartbeat(state 재발행) 주기 |
| `SIM_FLOOR_MOVE_MS` | 1500 | 엘리베이터 한 층 이동 시간 |

## 실행 방법

먼저 저장소 루트에서 한 번만 준비합니다 (`.env`, JWT 키, `npm install`).

```bash
make setup      # 처음 한 번
make infra      # postgres + mosquitto (docker compose)
```

**이 서비스만 실행 (watch 모드)**

```bash
npm run dev -w services/simulator        # 저장소 루트에서
```

**백엔드 전체 + 개발용 게이트웨이(:8080) 한 번에**

```bash
make dev
```

**컨테이너로 실행**

```bash
docker compose --profile app up -d --build simulator
```

## 테스트

```bash
npm test -w services/simulator           # 이 서비스만
npm test                              # 저장소 전체 (루트)
```

## 이미지 빌드

빌드 컨텍스트는 **저장소 루트**입니다 (`packages/common` 을 함께 넣어야 하므로).

```bash
docker build -f services/simulator/Dockerfile -t homeiot/simulator .
```

`test/` 와 `README.md` 는 `.dockerignore` 로 이미지에서 빠집니다.

## 폴더 구조

```
services/simulator/
  src/
    index.js      가상 기기 · MQTT 처리 · 화면용 API
    elevator.js   엘리베이터 층 이동 규칙 (순수 함수)
    public/       대시보드 화면 (/simulator)
  test/
    elevator.test.js
  Dockerfile
  README.md
```

## 담당

| 역할 | 이름 | 연락처 |
| --- | --- | --- |
| 담당자 | (작성 필요) | |
| 부담당 | (작성 필요) | |
