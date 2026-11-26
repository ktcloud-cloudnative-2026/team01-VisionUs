# 런북 (장애 대응 절차)

[← README](../README.md) · [관측 설계](observability.md) · [모니터링 가이드](monitoring-guide.md) · [로그 사례](log-case.md)

장애가 났을 때 처음 보는 팀원도 그대로 따라 할 수 있게 씁니다. 경보 6개가 디스코드로 오면 아래에서 **경보 이름**을 찾아 순서대로 확인합니다.

- 경보 채널: dev → `#모니터링-알림`, prod → `#모니터링-알림-prod` (제목에 `[prod]`)
- 경보는 Grafana Alerting에서 1분마다 검사합니다 (폴더 · 그룹 `home-iot`). 기준은 [관측 설계 4절](observability.md#4-알림-기준)
- 명령은 해당 클러스터 cp 노드에서 실행합니다: dev `t1-dev-cp`, prod `t1-prod-cp`
- Grafana: dev `http://localhost:13000` · prod `http://localhost:13001` (터널은 [모니터링 가이드](monitoring-guide.md#브라우저로-grafana--prometheus-보기))

## 공통 확인 순서

1. **어디인가**: 디스코드 제목에 `[prod]` 가 있는지 → 해당 cp 노드로 접속
2. **파드 상태**
   ```bash
   kubectl -n home-iot get pods -o wide
   ```
3. **이벤트 · 직전 로그**
   ```bash
   kubectl -n home-iot describe pod <파드 이름> | tail -20
   kubectl -n home-iot logs <파드 이름> --tail=50
   kubectl -n home-iot logs <파드 이름> --previous --tail=50   # 재시작된 경우 죽기 직전 로그
   ```
4. **에러 로그 검색** (Grafana → Explore → Loki)
   ```logql
   {namespace="home-iot"} | json | level="error" or status >= 500
   ```
5. **최근 배포 확인**: [배포 이력](deploy-history.md) 맨 위 줄, Argo CD 앱(`home-iot-dev` / `home-iot-prod`)의 최근 Sync 시각. 경보 직전에 배포가 있었다면 그 배포를 먼저 의심합니다

> `home-iot` 네임스페이스는 Argo CD가 관리합니다. `kubectl edit` · `scale` 로 고치면 Argo CD가 Git 상태로 되돌립니다. 고칠 때는 **Git(PR)** 로 고칩니다. (예외: Secret, postgres EndpointSlice — Git에 안 올리거나 Argo CD가 무시하는 것이라 손으로 적용)

## 되돌리기 (모든 경보 공통)

배포 때문이면 **직전 태그로 되돌리는 PR** 을 올립니다.

1. [배포 이력](deploy-history.md)에서 해당 서비스의 직전 `sha-` 태그 확인
2. `deploy/overlays/dev/kustomization.yaml` (prod면 `overlays/prod`) 의 그 서비스 `newTag` 를 직전 태그로 바꾸는 PR
3. dev는 merge 후 Argo CD가 3분 안에 반영, prod는 `deploy(prod)` PR merge = 승인
4. 반영 확인: `kubectl -n home-iot get pods` 에서 새 파드 Running, 디스코드 경보 `[RESOLVED]`

---

## 장애별 대응

### HomeIotPodNotReady — 파드가 5분 넘게 준비 안 됨

| 항목 | 내용 |
|---|---|
| 뜻 | 파드의 `/readyz` 가 실패. Ready 조건: control · device · telemetry = **DB + MQTT**, auth = DB, simulator = MQTT |
| 확인할 명령 | `kubectl -n home-iot get pods` → `describe pod` 의 Events → `logs` |
| 흔한 원인 | ① `ImagePullBackOff`: GHCR 토큰 만료 · Secret `ghcr-pull` 없음 ② `CreateContainerConfigError`: Secret(`home-iot-secrets`, `auth-jwt`) 없음 ③ DB 연결 실패: t1-db(10.10.21.10:5432) 꺼짐, svc `postgres` 의 EndpointSlice 없음 ④ MQTT 연결 실패: mosquitto 파드 이상 |
| 조치 | ① GHCR 토큰 재발급 → `ghcr-pull` Secret 다시 만들기 ② Secret 다시 등록 (값은 담당자 DM), 등록 후 `kubectl -n home-iot delete pod -l app=<서비스>` 로 새로 띄우기 ③ `kubectl -n home-iot get endpointslice -l kubernetes.io/service-name=postgres` 로 주소(10.10.21.10) 확인, 없으면 `kubectl apply -f deploy/external/postgres-endpointslice.yaml` (Argo CD가 관리 안 하는 파일), t1-db에서 `systemctl status postgresql` ④ 아래 MQTT 항목 |
| 되돌리기 | 배포 직후라면 직전 태그로 되돌리기 PR |

### HomeIotHighErrorRate — 서비스 5xx 에러율 5% 초과 (5분)

| 항목 | 내용 |
|---|---|
| 뜻 | 경보의 `service` 라벨 서비스가 서버 에러(500번대)를 많이 냄 |
| 확인할 명령 | Loki: `{namespace="home-iot", app="<서비스>"} \| json \| status >= 500` · `level="error"` 로그의 `msg`, `err` |
| 흔한 원인 | ① 방금 배포한 코드 버그 ② DB 연결 끊김(`pg pool error`) ③ 다른 서비스 호출 실패(502 `UPSTREAM_ERROR`, 예: control → device) ④ 기기 응답 없음(504 `DEVICE_TIMEOUT`) |
| 조치 | ① 직전 태그로 되돌리기 ② DB 상태 확인 ③ 호출 대상 서비스 파드 상태부터 확인 ④ 아래 제어 실패 항목 |
| 되돌리기 | 직전 태그로 되돌리기 PR |

### HomeIotSlowResponse — 응답 p95 1초 초과 (5분)

| 항목 | 내용 |
|---|---|
| 뜻 | 요청 100개 중 느린 5개가 1초보다 오래 걸림 (평소 p95 약 10ms) |
| 확인할 명령 | Grafana 대시보드 `Home IoT 개요` 의 응답 시간 패널 · Loki: `{namespace="home-iot", app="<서비스>"} \| json \| durationMs > 1000` |
| 흔한 원인 | ① 제어 명령이 기기 응답을 기다리다 시간 초과(최대 `COMMAND_TIMEOUT_MS` 5초) ② DB 느림 ③ 노드 자원 부족 |
| 조치 | ① 시뮬레이터 · MQTT 상태 확인(아래 항목) ② t1-db 부하 확인 ③ `kubectl describe node t1-<dev\|prod>-w1` 의 Allocated resources, Grafana 기본 대시보드 `Node Exporter / Nodes` 의 CPU · 메모리 |
| 되돌리기 | 배포 직후라면 직전 태그로 되돌리기 PR |

### HomeIotPodRestart — 5분 안에 3번 이상 재시작

| 항목 | 내용 |
|---|---|
| 뜻 | 컨테이너가 계속 죽었다 다시 뜸 (CrashLoopBackOff 직전) |
| 확인할 명령 | `kubectl -n home-iot logs <파드> --previous --tail=50` · `describe pod` 의 `Last State` |
| 흔한 원인 | ① `OOMKilled`: 메모리 limit(예: control 256Mi) 초과 ② 시작하자마자 에러(설정값 · Secret 누락) ③ livenessProbe(`/healthz`) 실패 |
| 조치 | ① 메모리 limit 올리는 PR (`deploy/base/<서비스>/deployment.yaml`) ② `--previous` 로그의 마지막 에러로 원인 수정 ③ 앱이 멈췄는지 로그 확인 |
| 되돌리기 | 직전 태그로 되돌리기 PR |

### HomeIotControlFailure — 기기 제어 실패율 10% 초과 (5분)

| 항목 | 내용 |
|---|---|
| 뜻 | `homeiot_commands_total` 중 `completed` 가 아닌 결과(`timeout`, `failed`)가 10% 넘음 |
| 확인할 명령 | Loki: `{namespace="home-iot", app="control"} \| json \| msg="command timeout"` · Prometheus: `sum by (result) (rate(homeiot_commands_total[5m]))` |
| 흔한 원인 | ① 시뮬레이터(기기)가 명령을 못 받음 → `timeout` ② MQTT 끊김 ③ 기기가 명령을 처리 못 함 → `failed` (`COMMAND_FAILED`) |
| 조치 | ① `kubectl -n home-iot get pods -l app=simulator`, 시뮬레이터 로그 ② 아래 MQTT 항목 ③ 시뮬레이터 로그의 에러 메시지 확인 |
| 되돌리기 | control · simulator 직전 태그로 되돌리기 PR |

### HomeIotMqttDisconnected — MQTT 연결 수 2 미만 (2분)

| 항목 | 내용 |
|---|---|
| 뜻 | 브로커에 붙은 클라이언트가 exporter 자신(1개)뿐 → 서비스가 모두 끊김. 값이 아예 없으면(No data) exporter도 죽은 것 |
| 확인할 명령 | `kubectl -n home-iot get pods -l app=mosquitto` (정상 `2/2`) · `kubectl -n home-iot logs deploy/mosquitto -c mosquitto --tail=30` · 서비스 로그의 `mqtt reconnecting` |
| 흔한 원인 | ① mosquitto 파드 재시작 · 죽음 ② 계정 불일치(`home-iot-secrets` 의 `MQTT_USERNAME` · `MQTT_PASSWORD`) ③ svc `mosquitto` 문제 |
| 조치 | ① 파드 상태 · Events 확인 (서비스들은 자동 재연결) ② Secret 값 확인 후 다시 등록 → 값은 파드가 **시작할 때만** 읽으므로 `kubectl -n home-iot delete pod -l app=mosquitto` 로 다시 띄움 (Deployment가 새 파드를 만듦, 서비스 쪽 값도 바꿨다면 그 서비스 파드도 같은 방법) ③ `kubectl -n home-iot get endpointslice -l kubernetes.io/service-name=mosquitto` (ENDPOINTS 칸에 파드 IP가 있어야 정상) |
| 되돌리기 | `deploy/base/infra/mosquitto.yaml` 최근 변경이 원인이면 되돌리는 PR (base라 dev · prod 둘 다 영향) |

---

## 사례

실제로 로그로 원인을 찾은 기록은 [로그 사례](log-case.md)에 남깁니다.
