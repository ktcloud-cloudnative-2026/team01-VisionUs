# 관측 설계

[← README](../README.md)

> Home IoT 시스템(MSA) 관측 설계 초안입니다.
> 서비스: Gateway(Envoy Gateway) · Auth Service · Device Service · MQTT Broker · 기기 시뮬레이터.

## 1. 공통 지표 (모든 서비스) — 골든 시그널: 지연 · 트래픽 · 에러 · 포화

| 지표 | 이름(Prometheus) | 대시보드 |
|------|------------------|----------|
| 요청 수 | `http_requests_total{service,method,route,status}` | Grafana · 서비스 공통 |
| 에러율 | `http_requests_total{status=~"5.."}` ÷ 전체 요청 수 | Grafana · 서비스 공통 |
| 응답 시간(p95) | `histogram_quantile(0.95, http_request_duration_seconds_bucket)` | Grafana · 서비스 공통 |
| CPU · 메모리 · 재시작 수 | `container_cpu_usage_seconds_total` · `container_memory_working_set_bytes` · `kube_pod_container_status_restarts_total` | Grafana · 클러스터/Pod |

- Auth · Device Service(Node.js/Express)는 `prom-client`로 `/metrics`를 노출합니다.
- Gateway(Envoy Gateway)는 Envoy 기본 지표(`envoy_cluster_upstream_rq_*`, `envoy_cluster_upstream_rq_time`)로 같은 항목을 대신합니다.

## 2. 업무 지표 (서비스별) — [성공 기준](./plan.md#5-성공-기준-숫자로)에서

> 성공 기준 문서가 확정되면 목표 숫자를 맞춰 조정합니다.

| 서비스 | 지표 | 왜 |
|--------|------|----|
| Auth Service | `auth_login_total{result=success\|fail}` | 로그인 실패 급증(오류·무차별 대입) 확인 |
| Gateway | `gateway_jwt_rejected_total{reason}` | 토큰 만료·위조로 거부되는 요청 파악 |
| Device Service | `device_control_total{device,result}` | 기기별(조명·에어컨·난방기기·공기청정기·커튼·엘리베이터 호출) 제어 성공/실패 |
| Device Service | `device_control_latency_seconds` (명령 발행 → 상태 수신) | 사용자가 체감하는 제어 반응 시간 |
| Device Service | `mqtt_publish_failed_total` | 명령이 브로커에 전달되지 않는 경우 감지 |
| MQTT Broker | 연결 클라이언트 수 · 메시지 수신/발행 수 | 브로커 단절·메시지 정체 확인 |
| 기기 시뮬레이터 | `simulator_state_published_total{device}` | 시뮬레이터가 상태를 정상 발행하는지 확인 |

## 3. 로그 형식 (모든 서비스 같게)

```
{"time":"2026-11-05T09:00:00+09:00","level":"info","service":"device-service","request_id":"<id>","message":"light control requested"}
```

- 필수 필드: `time` · `level` · `service` · `request_id` · `message`
- 한 줄에 JSON 하나로 stdout에 출력합니다. 비밀번호·JWT 원문은 기록하지 않습니다.
- 기기 제어 로그에는 `device`, `command`를 추가로 넣어 MQTT 명령/상태와 같은 `request_id`로 추적합니다.

## 4. 알림 기준

| 조건 | 받는 사람 | 대응 문서(런북) |
|------|-----------|-----------------|
| Pod가 5분 넘게 Ready 아님 | 관측 영역 담당 | [runbook.md](runbook.md) · HomeIotPodNotReady |
| 에러율 5%가 5분 넘음 | 관측 영역 담당 | [runbook.md](runbook.md) · HomeIotHighErrorRate |
| p95 응답 시간 1초가 5분 넘음 | 관측 영역 담당 | [runbook.md](runbook.md) · HomeIotSlowResponse |
| Pod 재시작 5분 내 3회 이상 | 관측 영역 담당 | [runbook.md](runbook.md) · HomeIotPodRestart |
| 기기 제어 실패율 10%가 5분 넘음 | Device Service 담당 | [runbook.md](runbook.md) · HomeIotControlFailure |
| MQTT Broker 연결 클라이언트 0 (2분 이상) — exporter 자신이 1로 잡혀서 Grafana 기준은 `broker_clients_connected < 2` | 관측 영역 담당 | [runbook.md](runbook.md) · HomeIotMqttDisconnected |

- 경보는 Grafana Alerting(dev · prod 각각)에서 보내고, 디스코드 dev `#모니터링-알림` · prod `#모니터링-알림-prod` 로 옵니다
- 로그로 원인을 찾은 기록: [log-case.md](log-case.md)

## 5. 코드에 처음부터 넣을 것

- [ ] `/metrics` 엔드포인트 (Auth · Device Service · 시뮬레이터)
- [ ] 요청 ID 헤더(`x-request-id`)를 받아서 다음 서비스와 MQTT 메시지로 전달 (없으면 Gateway에서 생성)
- [ ] JSON 로그 형식 (3번) 공통 로거 사용
- [ ] `/health` 엔드포인트 (쿠버네티스 probe용)
