# 지표 가이드

[← README](../README.md)

> [모니터링 설치 가이드](./monitoring-guide.md)로 수집한 지표를 **Grafana에서 어떻게 보고 읽는지** 정리한 문서입니다.
> 지표 설계(무엇을 왜 보는지)는 [관측 설계](./observability.md)를 따릅니다.


## 목차

- [0. 무엇을 보나](#0-무엇을-보나)
- [1. 대시보드 불러오기](#1-대시보드-불러오기)
- [2. 대시보드 읽는 법](#2-대시보드-읽는-법)
  - [2-1. 서비스](#2-1-서비스)
  - [2-2. Envoy Gateway (외부 요청 입구, web 포함)](#2-2-envoy-gateway-외부-요청-입구-web-포함)
  - [2-3. MQTT 브로커 (mosquitto)](#2-3-mqtt-브로커-mosquitto)
  - [2-4. 배포 (Argo CD → home-iot)](#2-4-배포-argo-cd--home-iot)
- [3. 장애가 났을 때 보는 순서](#3-장애가-났을-때-보는-순서)
- [4. 쿼리 모음 (Grafana Explore → Prometheus)](#4-쿼리-모음-grafana-explore--prometheus)
  - [서비스](#서비스)
  - [업무 지표 (코드에 이미 있는 것)](#업무-지표-코드에-이미-있는-것)
  - [Envoy Gateway](#envoy-gateway)
  - [MQTT 브로커](#mqtt-브로커)
  - [노드 · 파드](#노드--파드)
- [5. 로그 쿼리 (Grafana Explore → Loki)](#5-로그-쿼리-grafana-explore--loki)
- [6. 패널 직접 만들기](#6-패널-직접-만들기)
- [7. 관측 설계와의 대응](#7-관측-설계와의-대응)
- [8. 데이터가 안 보일 때](#8-데이터가-안-보일-때)

## 0. 무엇을 보나

| 영역 | 어디서 오나 | 답하는 질문 |
|------|-------------|-------------|
| 서비스 | 서비스 5개의 `/metrics` (`common/src/service.js`) | 각 서비스 **안에서** 무슨 일이 있었나 |
| Envoy Gateway | Envoy 프록시 기본 지표 | 사용자 요청이 **입구에서** 어떻게 처리됐나 (거부 · 실패 · 느림 포함) |
| MQTT 브로커 | mosquitto exporter 사이드카 | 브로커가 살아 있고, 메시지가 흐르고 있나 |
| 노드 · 파드 | kube-prometheus-stack 기본 | CPU · 메모리가 모자라거나 파드가 재시작되나 |
| 로그 | Alloy → Loki | 특정 요청에서 **왜** 그런 일이 생겼나 |

- 서비스 지표만 보면 빈 곳이 생깁니다. JWT 검사는 Gateway에서 하므로 **토큰 거부(401)는 서비스 지표에 안 잡히고**, web(Next.js) · web-nginx는 `/metrics` 가 없어서 **Envoy 지표로만** 보입니다
- 지표가 보이려면 Prometheus(`localhost:19090`) → **Status → Target health** 에서 아래 3개가 모두 **UP** 이어야 합니다
  - `serviceMonitor/monitoring/home-iot` (서비스 5개)
  - `serviceMonitor/monitoring/home-iot-mqtt` (MQTT 브로커)
  - `podMonitor/monitoring/envoy-gateway-proxy` (Envoy Gateway)

## 1. 대시보드 불러오기

저장소의 `deploy/monitoring/dashboards/home-iot-overview.json` 을 Grafana에 불러오면 아래 2절의 패널 18개(배포 표 포함)와 배포 표시(세로선)가 한 번에 생깁니다.

**1) Grafana 접속**

```powershell
ssh -N t1-grafana        # 내 PC PowerShell, 창을 열어 둔 채로
```

브라우저에서 `http://localhost:13000` → `admin` / 팀 비밀번호 (prod는 `localhost:13001`, 밝은 화면 — [설치 가이드](./monitoring-guide.md)의 포트 규칙)

**2) 불러오기**

- 왼쪽 메뉴 **Dashboards** → 오른쪽 위 **New** → **Import**
- **Upload dashboard JSON file** → `home-iot-overview.json` 선택
- 아래 **Import** 버튼
- 맨 위 **데이터 소스** 선택 상자가 `Prometheus` 인지 확인

**3) 주의**

- 화면에서 불러온 대시보드는 **Grafana의 PVC에만 저장**됩니다. Grafana를 다시 설치하면 사라지고, prod에는 따로 불러와야 합니다
- 화면에서 패널을 고쳤다면 오른쪽 위 **Export → Export as JSON** 으로 받아서 저장소의 JSON 파일도 같이 바꿔 PR로 올립니다

## 2. 대시보드 읽는 법

### 2-1. 서비스

| 패널 | 보는 것 | 빨간선 · 기준 |
|------|---------|---------------|
| 서비스별 요청 수 | 서비스마다 초당 요청 | |
| 서비스별 에러율 (5xx) | 서비스가 낸 에러 비율 | 5% (관측 설계 알림 기준) |
| 서비스별 p95 응답 시간 | 느린 쪽 5% 요청의 응답 시간 | 1초 (관측 설계 알림 기준) |

### 2-2. Envoy Gateway (외부 요청 입구, web 포함)

| 패널 | 종류 | 보는 것 | 색 기준 |
|------|------|---------|---------|
| 입구 전체 요청 (초당) | 숫자 | 들어오는 전체 트래픽 | |
| 입구 5xx 에러율 | 숫자 | 사용자가 실제로 받은 서버 에러 | 1% 주황 · 5% 빨강 |
| 입구 4xx 비율 (JWT 거부 포함) | 숫자 | 토큰 만료 · 위조로 거부된 요청. **서비스 지표에는 안 잡힘** | 10% 주황 · 30% 빨강 |
| 입구 p95 응답 시간 | 숫자 | 사용자가 체감하는 속도 | 500ms 주황 · 1초 빨강 |
| 경로별 요청 수 | 그래프 | 어느 경로(web · auth · device …)로 요청이 몰리나 | |
| 응답 코드별 요청 수 | 쌓인 그래프 | 2xx · 4xx · 5xx 비율 변화 | |
| 경로별 p95 응답 시간 | 그래프 | 어느 경로가 느린가 | 1초 |

경로 이름은 `httproute/home-iot/<라우트 이름>/rule/0` 형태입니다.

### 2-3. MQTT 브로커 (mosquitto)

| 패널 | 종류 | 보는 것 | 색 기준 |
|------|------|---------|---------|
| 연결 클라이언트 수 | 숫자 | 브로커에 붙은 서비스 · 시뮬레이터 수 | **1 이하 빨강** |
| 온라인 기기 수 (telemetry) | 숫자 | 상태를 보내는 기기 수 | 0 빨강 |
| 버려진 메시지 (5분) | 숫자 | 브로커가 처리 못 하고 버린 메시지 | 1 이상 빨강 |
| 브로커 가동 시간 | 숫자 | 갑자기 작아지면 브로커가 재시작된 것 | |
| 브로커 메시지 수신 · 발행 | 그래프 2줄 | 브로커가 받은 양 · 내보낸 양 | |
| telemetry가 받은 메시지 (채널별) | 그래프 | 서비스 쪽에서 본 메시지 흐름 | |
| 연결 클라이언트 수 추이 | 그래프 | 끊긴 시점 찾기 | |

- `broker_clients_connected` 에는 **exporter 자신도 1로 세어집니다.** 그래서 0이 아니라 **1 이하**가 "모두 끊김"입니다
- **브로커 지표**(`broker_*`)는 브로커가 센 값, **telemetry 지표**(`homeiot_mqtt_messages_total`)는 받는 서비스가 센 값입니다. 둘을 나란히 보면 문제가 어느 쪽인지 나뉩니다

### 2-4. 배포 (Argo CD → home-iot)

| 패널 | 모양 | 보는 것 |
|------|------|---------|
| 배포 표시 (모든 그래프) | 파란 세로선 | home-iot Deployment가 바뀐 시각 (새 이미지 배포 · 설정 변경). 선에 마우스를 올리면 서비스 이름 |
| 지금 돌고 있는 이미지 (서비스별 배포 버전) | 표 | 서비스(컨테이너)별 이미지와 `sha-` 태그 |

- 그래프가 튀거나 에러가 늘었을 때 **바로 앞에 파란 선이 있으면 그 배포를 먼저 의심**합니다 ([런북](./runbook.md) 되돌리기)
- 배포 시각 · PR · 빌드 번호 전체 기록은 [배포 이력](./deploy-history.md)
- 쿼리: 세로선 `changes(kube_deployment_status_observed_generation{namespace="home-iot"}[2m]) > 0`, 표 `max by (container, image_spec) (kube_pod_container_info{namespace="home-iot"})`
- 표는 `image` 가 아니라 `image_spec`(Deployment에 적힌 이미지)을 씁니다. `image` 는 런타임이 보고한 이름이라, 코드가 안 바뀐 빌드처럼 **내용이 같은 이미지**면 예전 태그로 보입니다 (11/26 dev control이 `sha-ac0a867` 로 보였던 이유)
- 서비스별 에러율 패널은 에러가 한 번도 없으면 No data가 나와서, `or ... * 0` 을 붙여 **0%** 로 보이게 했습니다

## 3. 장애가 났을 때 보는 순서

| 증상 | 먼저 볼 패널 | 판단 |
|------|-------------|------|
| 사용자가 "에러가 난다" | 2-2 입구 5xx 에러율 → 2-1 서비스별 에러율 | 서비스 에러율도 높음 → 그 서비스 문제. 서비스는 0인데 입구만 높음 → 파드가 죽었거나 응답 시간 초과 (4절 재시작 수 확인) |
| "로그인이 자꾸 풀린다" | 2-2 입구 4xx 비율 | 갑자기 올라감 → 토큰 만료 · 키 문제. auth 로그 확인 |
| "느리다" | 2-2 입구 p95 → 2-2 경로별 p95 → 2-1 서비스별 p95 | 입구만 느림 → 서비스 밖(네트워크 · 대기). 특정 서비스도 느림 → 그 서비스 |
| "기기 제어가 안 된다" | 2-3 연결 클라이언트 수 → 메시지 수신 · 발행 → telemetry 수신 | 연결 1 이하 → 서비스 · 시뮬레이터가 브로커에 못 붙음. 브로커 수신은 느는데 telemetry가 멈춤 → telemetry 문제. 둘 다 멈춤 → 브로커 · 시뮬레이터 문제 |
| 화면은 되는데 기기 상태가 안 바뀜 | 2-3 온라인 기기 수 · 버려진 메시지 | 온라인 0 → 시뮬레이터 확인. 버려진 메시지 증가 → 브로커 과부하 |

원인 서비스를 찾았으면 5절의 Loki 쿼리로 그 서비스 로그를 봅니다.

## 4. 쿼리 모음 (Grafana Explore → Prometheus)

대시보드에 없는 것을 보고 싶을 때 **Explore** 에 붙여 넣어 씁니다.

### 서비스

| 확인 | 쿼리 |
|------|------|
| 수집 여부 (1이면 정상) | `up{namespace="home-iot"}` |
| 서비스별 요청 수 | `sum by (service) (rate(http_requests_total[5m]))` |
| 서비스별 에러율 | `sum by (service) (rate(http_requests_total{status=~"5.."}[5m])) / sum by (service) (rate(http_requests_total[5m]))` |
| 서비스별 p95 응답 시간 | `histogram_quantile(0.95, sum by (le, service) (rate(http_request_duration_seconds_bucket[5m])))` |
| 경로별 요청 수 (한 서비스) | `sum by (route) (rate(http_requests_total{service="device-service"}[5m]))` |

`service` 라벨은 코드가 붙인 이름(`auth-service` 등)입니다.

### 업무 지표 (코드에 이미 있는 것)

| 확인 | 쿼리 |
|------|------|
| 기기 제어 명령 수 (결과별) | `sum by (type, result) (rate(homeiot_commands_total[5m]))` |
| 기기 제어 실패율 | `sum(rate(homeiot_commands_total{result!="completed"}[5m])) / sum(rate(homeiot_commands_total[5m]))` |
| 명령 → 기기 응답 p95 | `histogram_quantile(0.95, sum by (le, type) (rate(homeiot_command_roundtrip_seconds_bucket[5m])))` |
| 온라인 기기 수 | `homeiot_devices_online` |
| telemetry 수신 메시지 (채널별) | `sum by (channel) (rate(homeiot_mqtt_messages_total[5m]))` |

`result` 값은 control 코드(`services/control/src/index.js`)가 붙이는 `completed`(성공) · `failed`(실패) · `timeout`(응답 없음) 세 가지입니다.

### Envoy Gateway

| 확인 | 쿼리 |
|------|------|
| 경로별 요청 수 | `sum by (envoy_cluster_name) (rate(envoy_cluster_upstream_rq_total{envoy_cluster_name=~"httproute/.*"}[5m]))` |
| 응답 코드 종류별 | `sum by (envoy_response_code_class) (rate(envoy_cluster_upstream_rq_xx{envoy_cluster_name=~"httproute/.*"}[5m]))` |
| 경로별 5xx | `sum by (envoy_cluster_name) (rate(envoy_cluster_upstream_rq_xx{envoy_response_code_class="5"}[5m]))` |
| 경로별 p95 (ms) | `histogram_quantile(0.95, sum by (le, envoy_cluster_name) (rate(envoy_cluster_upstream_rq_time_bucket{envoy_cluster_name=~"httproute/.*"}[5m])))` |
| JWT 관련 지표 이름 찾기 | `{__name__=~".*jwt_authn.*"}` |

`envoy_cluster_name=~"httproute/.*"` 는 Envoy 내부용 항목을 빼고 우리 경로만 보는 조건입니다.

### MQTT 브로커

| 확인 | 쿼리 |
|------|------|
| 연결 클라이언트 수 | `broker_clients_connected` |
| 메시지 수신 (초당) | `rate(broker_publish_messages_received[5m])` |
| 메시지 발행 (초당) | `rate(broker_publish_messages_sent[5m])` |
| 버려진 메시지 (5분) | `increase(broker_publish_messages_dropped[5m])` |
| 가동 시간 | `broker_uptime` |
| 브로커가 내는 지표 전체 | `{__name__=~"broker_.*"}` |

### 노드 · 파드

| 확인 | 쿼리 |
|------|------|
| 파드별 CPU | `sum by (pod) (rate(container_cpu_usage_seconds_total{namespace="home-iot", container!=""}[5m]))` |
| 파드별 메모리 | `sum by (pod) (container_memory_working_set_bytes{namespace="home-iot", container!=""})` |
| 최근 15분 재시작 수 | `sum by (pod) (increase(kube_pod_container_status_restarts_total{namespace="home-iot"}[15m]))` |

노드 · 파드는 기본 대시보드도 있습니다: `Kubernetes / Compute Resources / Namespace (Pods)` (namespace = home-iot), `Node Exporter / Nodes`

## 5. 로그 쿼리 (Grafana Explore → Loki)

| 확인 | 쿼리 |
|------|------|
| 한 서비스 로그 | `{namespace="home-iot", app="auth"}` |
| 에러 로그만 | `{namespace="home-iot"} \| json \| level="error"` |
| 느린 요청 (1초 이상) | `{namespace="home-iot"} \| json \| durationMs > 1000` |
| 5xx 응답만 | `{namespace="home-iot"} \| json \| status >= 500` |
| 한 사용자의 요청 따라가기 | `{namespace="home-iot"} \| json \| userId="<사용자 id>"` |
| web 로그 (지표가 없는 서비스) | `{namespace="home-iot", app="web"}` |
| MQTT 브로커 로그 | `{namespace="home-iot", app="mosquitto", container="mosquitto"}` |
| exporter 로그 | `{namespace="home-iot", app="mosquitto", container="exporter"}` |

- 로그 한 줄의 필드: `time` · `level` · `service` · `msg`, HTTP 요청 로그는 `method` · `path` · `status` · `durationMs` · `userId` (`common/src/logger.js` · `service.js`)
- 관측 설계의 `request_id` 는 아직 코드에 없습니다 ([관측 설계](./observability.md) 5절 체크리스트)

## 6. 패널 직접 만들기

대시보드에 없는 지표를 추가할 때입니다. 예: "MQTT 연결 클라이언트 수" 숫자 패널

**1) 패널 추가**

- 대시보드 오른쪽 위 **Edit** → **Add** → **Visualization**

**2) 쿼리 입력**

- 아래 쿼리 칸: **Data source** = `Prometheus`, 오른쪽 **Builder / Code** 중 **Code**
- 쿼리 입력 → **Run queries** 로 그래프가 나오는지 확인

```
broker_clients_connected
```

**3) 모양 설정 (오른쪽 설정 패널)**

| 항목 | 값 |
|------|-----|
| 맨 위 시각화 종류 | **Stat** (큰 숫자 하나) |
| Panel options → Title | `연결 클라이언트 수` |
| Standard options → Unit | `short` |
| Thresholds | Base `빨강` → **+ Add threshold** → `2` `초록` |
| Stat styles → Color mode | `Background` |

**4) 저장**

- 오른쪽 위 **Back to dashboard** → **Save dashboard**

**시각화 종류 고르기**

| 보고 싶은 것 | 종류 |
|--------------|------|
| 지금 값 하나 (연결 수 · 에러율) | **Stat** |
| 시간에 따른 변화 (요청 수 추이) | **Time series** |
| 0~100% 같은 범위 안의 값 | **Gauge** |

**단위 고르기**

| 값 | Unit |
|----|------|
| 초당 요청 | `requests/sec (rps)` |
| 비율 (0~1) | `Percent (0.0-1.0)` |
| 초 / 밀리초 | `seconds (s)` / `milliseconds (ms)` |
| 개수 | `short` |

- 라벨별로 선이 여러 개 나오면 쿼리 아래 **Options → Legend → Custom** 에 `{{service}}` 처럼 라벨 이름을 넣어야 범례가 깔끔합니다
- 쿼리에 `rate(...[5m])` 를 쓰는 이유: `_total` 지표는 계속 커지기만 하는 누적값이라, 그대로 그리면 오르막선만 보입니다. `rate` 로 "초당 얼마"로 바꿔서 봅니다

## 7. 관측 설계와의 대응

[관측 설계](./observability.md) 4절 알림 기준을 어느 패널 · 쿼리로 보는지입니다. 알림 규칙은 Grafana Alerting에 6개(dev · prod 각각)로 만들었고, 울렸을 때 대응은 [런북](./runbook.md)을 봅니다.

| 알림 기준 | 보는 곳 | 쿼리 |
|-----------|---------|------|
| 에러율 5%가 5분 넘음 | 2-1 서비스별 에러율 · 2-2 입구 5xx 에러율 | 4절 서비스 에러율 |
| p95 응답 시간 1초가 5분 넘음 | 2-1 서비스별 p95 · 2-2 입구 p95 | 4절 서비스 p95 |
| Pod 재시작 5분 내 3회 이상 | 기본 대시보드 · 4절 재시작 수 | `increase(kube_pod_container_status_restarts_total{namespace="home-iot"}[5m]) >= 3` |
| 기기 제어 실패율 10%가 5분 넘음 | 4절 업무 지표 | 기기 제어 실패율 |
| MQTT Broker 연결 클라이언트 0 (2분 이상) | 2-3 연결 클라이언트 수 | `broker_clients_connected <= 1` (exporter 포함이라 1 이하) |

## 8. 데이터가 안 보일 때

| 증상 | 원인 | 해결 |
|------|------|------|
| 패널 전체가 No data | 데이터 소스가 다름 | 대시보드 맨 위 **데이터 소스** 를 `Prometheus` 로 |
| Envoy 패널만 No data | `envoy-gateway-proxy` 수집 안 됨 | Target health 확인 → [설치 가이드](./monitoring-guide.md) 7절 |
| MQTT 패널만 No data | `home-iot-mqtt` 수집 안 됨 | `kubectl -n home-iot get pods -l app=mosquitto` 가 `2/2` 인지 → 설치 가이드 7절 |
| 숫자가 들쭉날쭉 · 0으로 자주 떨어짐 | 요청이 거의 없음 (`rate` 결과가 0) | 정상. 오른쪽 위 시간 범위를 늘리거나 실제로 요청을 보내 봄 |
| 에러율 패널이 비어 있음 | 요청이 0이라 0 ÷ 0 | 정상. 요청이 생기면 나타남 |
| p95가 이상하게 큼 | 요청이 너무 적어 몇 건이 전체를 좌우 | 요청이 쌓인 뒤 다시 봄 |
| 과거 sample 서비스가 보임 | 수집을 멈춘 뒤에도 7일간 남음 | 보관 기간이 지나면 사라짐 |
