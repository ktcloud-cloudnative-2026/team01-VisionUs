# 모니터링 설치 가이드

[← README](../README.md)

> [관측 설계](./observability.md)에서 정한 **Prometheus + Grafana(지표), Loki(로그)** 를 dev · prod 클러스터에 올리는 방법입니다.
> 설치는 앱과 똑같이 **Argo CD가 합니다.** 처음 한 번만 cp 노드에서 명령 몇 줄을 실행하고, 그 뒤로는 values 파일 수정 → PR → merge만 하면 됩니다.

## 목차

- [흐름](#흐름)
- [0. 무엇이 어디에 생기나](#0-무엇이-어디에-생기나)
- [1. 파일 구성](#1-파일-구성)
- [2. 설치 전 확인 (cp 노드에서)](#2-설치-전-확인-cp-노드에서)
- [3. 저장소에 올리기 (처음 한 번)](#3-저장소에-올리기-처음-한-번)
- [4. 클러스터에 등록하기 (클러스터마다 처음 한 번)](#4-클러스터에-등록하기-클러스터마다-처음-한-번)
- [5. 확인](#5-확인)
  - [브라우저로 Grafana · Prometheus 보기](#브라우저로-grafana--prometheus-보기)
  - [지표 (Grafana Explore → Prometheus)](#지표-grafana-explore--prometheus)
  - [로그 (Grafana Explore → Loki)](#로그-grafana-explore--loki)
- [6. 설정 바꾸기](#6-설정-바꾸기)
- [7. 막혔을 때](#7-막혔을-때)

## 흐름

```
[처음 한 번]  PR merge → cp 노드에서 Secret 만들기 → Argo CD 앱 apply → 확인
[매번]        deploy/monitoring/values/*.yaml 수정 → PR → merge → (자동) Argo CD가 반영
```

## 0. 무엇이 어디에 생기나

```
서비스 Pod (home-iot 네임스페이스)
  auth · control · device · telemetry · simulator
   │  /metrics (이미 코드에 있음: common/src/service.js)    │  stdout JSON 로그 (common/src/logger.js)
   ▼                                                        ▼
Prometheus  ── 지표 수집                     Alloy ── 로그 수집 ──▶ Loki ── 로그 저장
   │                                                                 │
   └────────────────────────▶  Grafana  ◀────────────────────────────┘
                                대시보드 · 알림  (MetalLB IP로 접속)
```

| VM | 하는 일 |
|----|---------|
| tN-bastion | 아무것도 설치 안 함 (접속 입구) |
| tN-db | 아무것도 설치 안 함 |
| tN-dev-cp · tN-prod-cp | 4단계 명령을 여기서 실행. 모니터링 파드는 뜨지 않음 |
| tN-dev-w1·w2 · tN-prod-w1·w2 | 모니터링 파드가 실제로 실행되는 곳 (쿠버네티스가 배치) |

- 모든 모니터링 파드는 `monitoring` 네임스페이스에 생깁니다. 앱(`home-iot`)과 섞이지 않습니다
- dev · prod 클러스터에 **각각 따로** 설치합니다
- 워커 메모리는 3~4GB 정도 더 씁니다

**서비스 코드와 `deploy/base/` 는 고칠 것이 없습니다.** `/metrics` 와 JSON 로그는 이미 공통 코드에 있고, Service에도 `app` 라벨과 `http` 포트 이름이 이미 있습니다.

## 1. 파일 구성

```
deploy/
  monitoring/                    모니터링 관련 파일은 전부 이 폴더에
    README.md
    monitoring-dev.yaml          dev 클러스터용 Argo CD 앱 (차트 3개 + 버전)
    monitoring-prod.yaml         prod 클러스터용 (이름만 다름)
    values/
      kube-prometheus-stack.yaml Prometheus · Grafana · 우리 서비스 수집 목록
      loki.yaml                  Loki
      alloy.yaml                 로그 수집기
```

| 차트 | 버전 | 저장소 |
|------|------|--------|
| kube-prometheus-stack | 93.10.0 | prometheus-community.github.io/helm-charts |
| loki | 21.6.0 | grafana-community.github.io/helm-charts |
| alloy | 1.16.0 | grafana.github.io/helm-charts |

- Loki 차트는 2026-03부터 `grafana-community` 저장소에서 관리합니다. 옛 글의 `grafana/loki` 를 쓰지 않습니다
- 로그 수집기 Promtail은 2026-03-02에 지원이 끝나서 Alloy를 씁니다

## 2. 설치 전 확인 (cp 노드에서)

「kubeadm 클러스터 구축 가이드」의 7·8단계(MetalLB, local-path)가 되어 있어야 합니다.

```bash
kubectl get storageclass                 # local-path (default)
kubectl -n metallb-system get ipaddresspool
kubectl -n argocd get applications       # home-iot-dev(또는 prod)가 보이면 Argo CD 준비 완료
```

예전에 `helm install` 로 모니터링을 직접 설치했다면 먼저 지웁니다 (두 곳에서 관리하면 충돌):

```bash
helm list -n monitoring                  # 아무것도 없으면 넘어감
helm uninstall alloy loki kps -n monitoring
```

## 3. 저장소에 올리기 (처음 한 번)

작업은 개발 VM **t1-base**(`10.10.31.20`, `lab` 계정)에서 합니다. 설정 파일 묶음(`team01-monitoring.zip`)을 내 PC에 받아 둔 상태에서 시작합니다.

**1) 내 PC → t1-base로 zip 복사** (Windows PowerShell)

zip은 보통 `다운로드` 폴더에 저장됩니다. 같은 이름이 있으면 `team01-monitoring (1).zip` 처럼 저장되니 예전 파일을 지우고 받습니다.

```powershell
scp "$env:USERPROFILE\Downloads\team01-monitoring.zip" lab@10.10.31.20:~/
```

`lab` 비밀번호를 입력하고 `100%` 가 나오면 복사 완료입니다.

**2) t1-base 접속 · 브랜치 만들기**

```powershell
ssh lab@10.10.31.20          # VMware 화면에서 터미널을 열어도 됩니다
```

여기부터는 **t1-base 안에서** 실행합니다. 이슈를 먼저 만들고 그 번호를 씁니다 (예: #45 → `feat/45-monitoring`).

```bash
cd ~/team01        # 내 저장소 폴더 (clone한 이름이 다르면 그 폴더로)
git switch main && git pull
git switch -c feat/<이슈번호>-monitoring
```

t1-base에 저장소가 없으면 먼저: `cd ~ && git clone https://github.com/ktcloud-cloudnative-2026/team01-VisionUs.git team01`

**3) zip 풀어서 저장소에 넣기**

```bash
# unzip이 없으면 설치 (경로가 나오면 이미 있음)
which unzip || sudo apt-get install -y unzip

# 압축 풀기 → 저장소에 복사 (zip 안의 team01/ 내용을 ~/team01/ 에 그대로)
rm -rf ~/mon-src
unzip ~/team01-monitoring.zip -d ~/mon-src
cp -r ~/mon-src/team01/. ~/team01/
```

`ls -R ~/mon-src/team01` 로 보면 아래 파일들이 있어야 합니다.

```
docs/monitoring-guide.md
deploy/monitoring/README.md
deploy/monitoring/monitoring-dev.yaml
deploy/monitoring/monitoring-prod.yaml
deploy/monitoring/values/kube-prometheus-stack.yaml
deploy/monitoring/values/loki.yaml
deploy/monitoring/values/alloy.yaml
```

zip을 새로 받았을 때(가이드 · 설정이 바뀐 경우)도 1) → 3) 을 다시 하면 덮어써집니다.

**4) 안내 README 2개 고치기 (선택이지만 권장)**

이 두 파일은 가이드가 아니라, 저장소에 원래 있던 **안내판** 파일입니다.

| 파일 | 원래 역할 | 고치는 이유 |
|------|-----------|-------------|
| `README.md` (저장소 첫 화면) | 팀 문서 목록 표 | 표에 없으면 가이드가 `docs/` 안에만 있어 팀원이 존재를 모름 |
| `deploy/README.md` | `deploy/` 폴더 구조도 | 새 `monitoring/` 폴더가 구조도에서 빠짐 |

- **고치지 않아도 모니터링 설치 · 동작에는 영향이 없습니다.** Argo CD는 `deploy/monitoring/` 안의 파일만 읽고, README는 사람이 읽는 설명서입니다
- 그래도 고치는 것은 팀 규칙 때문입니다. `README.md` 에 "이 README에서 모든 문서를 찾을 수 있게 합니다", `deploy/README.md` 에 "클러스터 · GitOps 담당이 구조를 정합니다"라고 되어 있습니다

아래를 붙여 넣으면 정확한 위치에 한 줄씩 들어갑니다.

```bash
# README.md : "운영 | 런북" 줄 바로 아래에 가이드 링크 추가
sed -i '/^| 운영 | \[런북\]/a | | [모니터링 설치 가이드](docs/monitoring-guide.md) | Prometheus · Loki · Grafana 설치 · 확인 |' README.md

# deploy/README.md : "argocd/" 줄 바로 아래에 monitoring/ 설명 추가
sed -i '/^  argocd\//a\  monitoring/        모니터링 Argo CD 앱 + helm values (Prometheus · Loki · Alloy · Grafana)' deploy/README.md
```

건너뛰려면 이 단계를 생략하고, 6)의 `git add` 에서 `README.md deploy/README.md` 를 뺍니다. PR 리뷰 때 GitOps 담당에게 물어보고 정해도 됩니다.

**5) 결과 확인**

```bash
git status --short
```

```
 M README.md                  ← 4) 를 했을 때만
 M deploy/README.md           ← 4) 를 했을 때만
?? deploy/monitoring/
?? docs/monitoring-guide.md
```

- 바뀐 내용 보기: `git diff` (각 README에 `+` 로 시작하는 줄 하나씩. 나올 때는 `q`)
- 다른 파일이 `M` 으로 나오면 실수로 바뀐 것입니다. `git restore <파일명>` 으로 되돌립니다

**6) 커밋하고 올리기**

```bash
git add deploy/monitoring docs/monitoring-guide.md README.md deploy/README.md
git status         # 비밀번호 · kube config 가 목록에 없는지 확인
git commit -m "feat: 모니터링 스택 Argo CD 배포 설정 추가 (#<이슈번호>)"
git push -u origin feat/<이슈번호>-monitoring
```

GitHub 저장소 페이지의 **Compare & pull request** 버튼으로 PR을 만들고 **클러스터 · GitOps 담당을 리뷰어로** 지정합니다. merge되면 4단계로 갑니다.

**7) 정리 (선택)**: `rm -rf ~/mon-src ~/team01-monitoring.zip`

## 4. 클러스터에 등록하기 (클러스터마다 처음 한 번)

`monitoring-dev.yaml` · `monitoring-prod.yaml` 은 Argo CD가 지켜보는 파일이 아니라서, merge만으로는 아무 일도 일어나지 않습니다. cp 노드에서 직접 한 번 apply 합니다.

**dev (tN-dev-cp에서)**

```bash
cd ~/team01 && git switch main && git pull     # cp 노드에 저장소가 없으면 먼저 git clone

# 1) 네임스페이스 + Grafana 관리자 비밀번호 (Git에 안 올리는 값)
kubectl create namespace monitoring
kubectl -n monitoring create secret generic grafana-admin \
  --from-literal=admin-user=admin \
  --from-literal=admin-password='<팀 비밀번호>'

# 2) Argo CD 앱 등록
kubectl apply -f deploy/monitoring/monitoring-dev.yaml
```

**prod (tN-prod-cp에서)**: 위와 같고, 마지막 줄만 `monitoring-prod.yaml` 입니다.

- Secret보다 앱을 먼저 apply했다면 Grafana 파드가 `CreateContainerConfigError` 로 멈춥니다. Secret을 만들면 잠시 뒤 스스로 Running이 됩니다
- `kubectl apply` 는 여러 번 실행해도 안전합니다. 이미 있으면 바뀐 부분만 고칩니다

## 5. 확인

```bash
kubectl -n argocd get applications       # monitoring-dev  Synced  Healthy (처음엔 몇 분 걸림)
kubectl -n monitoring get pods -o wide   # 모두 Running, NODE 칸은 워커
kubectl -n monitoring get pvc            # 모두 Bound
kubectl -n monitoring get svc kps-grafana kps-kube-prometheus-stack-prometheus
# EXTERNAL-IP 칸이 아래 표의 고정 주소와 같으면 정상
```

### 브라우저로 Grafana · Prometheus 보기

Grafana와 Prometheus는 MetalLB가 **고정 IP**를 붙여 둡니다. 주소는 `deploy/monitoring/monitoring-dev.yaml` · `monitoring-prod.yaml` 의 `metallb.io/loadBalancerIPs` 에서 정합니다.

| | 클러스터 안 주소 (dev) | 클러스터 안 주소 (prod) | 내 PC 브라우저 주소 |
|---|---|---|---|
| Grafana | `http://10.10.21.120` (포트 80) | `http://10.10.21.220` (포트 80) | `http://localhost:13000` |
| Prometheus | `http://10.10.21.121:9090` | `http://10.10.21.221:9090` | `http://localhost:19090` |

- 10.10.21.x 주소는 팀 VM끼리만 통하므로, 내 PC에서는 **bastion을 거치는 SSH 터널**로 봅니다
- 내 PC 쪽 포트는 이미 쓰는 80 · 8080 · 18080 과 겹치지 않게 **13000 · 19090** 을 씁니다

**1) 팀 VM에서 먼저 확인** (tN-db 등)

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://10.10.21.120          # Grafana → 302
curl -s -o /dev/null -w '%{http_code}\n' http://10.10.21.121:9090/-/ready   # Prometheus → 200
```

**2) 내 PC에서 터널 열기**

「팀 서버 접속과 사용법」에서 bastion에 접속하는 ssh 명령 뒤에 `-L` 두 개를 붙입니다. (Windows PowerShell · macOS 터미널 모두 같은 명령)

```bash
# dev 클러스터 보기
ssh -N -L 13000:10.10.21.120:80 -L 19090:10.10.21.121:9090 <bastion 접속 계정@주소>

# prod 클러스터 보기 (dev 터널을 Ctrl+C로 닫고)
ssh -N -L 13000:10.10.21.220:80 -L 19090:10.10.21.221:9090 <bastion 접속 계정@주소>
```

- `-L 13000:10.10.21.120:80` = 내 PC의 13000번으로 들어온 요청을 bastion이 10.10.21.120:80(Grafana)으로 전달
- `-N` = 원격 명령 없이 터널만 엽니다. 창을 닫거나 Ctrl+C를 누르면 터널도 닫힙니다
- 이미 80 · 8080 · 18080 터널을 쓰는 명령이 있으면 그 명령 뒤에 `-L` 두 개를 이어 붙여도 됩니다

**3) 브라우저 열기**

- Grafana: `http://localhost:13000` → `admin` / 4단계에서 정한 비밀번호
- Prometheus: `http://localhost:19090` → 상단 **Status → Target health** 에서 `home-iot` 항목이 모두 **UP** 이면 우리 서비스 수집 정상

Prometheus 화면에는 로그인이 없습니다. 팀 VM끼리만 통하는 주소라 외부에는 열리지 않지만, 주소를 팀 밖에 공유하지 않습니다.

### 지표 (Grafana Explore → Prometheus)

| 확인 | 쿼리 |
|------|------|
| 서비스 수집 여부 (1이면 정상) | `up{namespace="home-iot"}` |
| 서비스별 요청 수 | `sum by (service) (rate(http_requests_total[5m]))` |
| 서비스별 에러율 | `sum by (service) (rate(http_requests_total{status=~"5.."}[5m])) / sum by (service) (rate(http_requests_total[5m]))` |
| 서비스별 p95 응답 시간 | `histogram_quantile(0.95, sum by (le, service) (rate(http_request_duration_seconds_bucket[5m])))` |

`service` 라벨은 코드가 붙인 이름(`auth-service` 등)입니다.

### 로그 (Grafana Explore → Loki)

| 확인 | 쿼리 |
|------|------|
| auth 로그 전체 | `{namespace="home-iot", app="auth"}` |
| 에러 로그만 | `{namespace="home-iot"} \| json \| level="error"` |
| 느린 요청 (1초 이상) | `{namespace="home-iot"} \| json \| durationMs > 1000` |

**기본 대시보드**: Dashboards에 `Kubernetes / Compute Resources / Namespace (Pods)` (namespace = home-iot 선택), `Node Exporter / Nodes` 가 이미 들어 있습니다.

## 6. 설정 바꾸기

| 바꾸는 것 | 파일 | 반영 |
|-----------|------|------|
| 보관 기간 · 용량 · 메모리 | `deploy/monitoring/values/*.yaml` | merge하면 자동 |
| 수집할 서비스 추가 | `kube-prometheus-stack.yaml` 의 `additionalServiceMonitors` → `values: [...]` 에 이름 추가 | merge하면 자동 |
| 브라우저 접속 IP | `deploy/monitoring/monitoring-dev.yaml` · `monitoring-prod.yaml` 의 `metallb.io/loadBalancerIPs` | merge 후 cp 노드에서 `git pull` → `kubectl apply -f` 다시 |
| 차트 버전 | `deploy/monitoring/monitoring-dev.yaml` · `monitoring-prod.yaml` 의 `targetRevision` | merge 후 cp 노드에서 `git pull` → `kubectl apply -f` 다시 |

- prod는 dev에서 확인한 버전만 올립니다 (앱 배포와 같은 규칙)
- `loki.yaml` 은 차트가 values를 엄격하게 검사합니다. 차트에 없는 키를 넣으면 Sync가 실패합니다

## 7. 막혔을 때

| 증상 | 원인 | 해결 |
|------|------|------|
| Sync 실패, 메시지에 `Too long` | `ServerSideApply=true` 빠짐 | `deploy/monitoring/monitoring-*.yaml` 의 `syncOptions` 확인 후 다시 apply |
| Sync 실패, 메시지에 `values don't meet the specifications` | loki.yaml에 차트에 없는 키 | 메시지에 나온 키를 지움 |
| 원인을 모를 때 | | `kubectl -n argocd describe application monitoring-dev \| tail -30` |
| PVC Pending | 기본 StorageClass 없음 | 클러스터 구축 가이드 8단계 |
| Grafana · Prometheus EXTERNAL-IP `<pending>` | 고정 IP(.120 · .121 / .220 · .221)를 다른 서비스가 이미 씀, 또는 MetalLB 풀이 없음 | `kubectl get svc -A \| grep LoadBalancer` 로 그 IP를 쓰는 서비스 확인 → 남은 연습용 서비스를 지우거나 `monitoring-*.yaml` 의 IP를 대역 안의 빈 번호로 바꿈 |
| ssh 터널 실행 시 `bind: Address already in use` | 내 PC에서 13000 · 19090 을 이미 씀 | `-L` 앞 숫자만 다른 번호로 바꾸고(예: 13001) 브라우저 주소도 같이 바꿈 |
| 브라우저에서 `localhost:13000` 이 안 열림 | 터널 창이 닫힘, 또는 bastion에서 그 IP로 못 감 | ssh 창이 열려 있는지 확인 → 팀 VM에서 5단계 1) curl 확인 |
| 파드 Pending, 이벤트에 `Insufficient memory` | 워커 메모리 부족 | values의 `resources` · `size` 줄여서 PR |
| `up{namespace="home-iot"}` 에 서비스가 없음 | values 목록에 이름이 없거나 Service의 `app` 라벨이 다름 | `kubectl -n home-iot get svc --show-labels` 와 목록 비교 |
| Grafana에서 Loki 오류 `no org id` | `auth_enabled: false` 빠짐 | loki.yaml 확인 |
| 워커 하나가 꺼지면 Prometheus · Loki가 Pending | local-path는 데이터가 한 노드에만 있음 | 노드를 다시 켜면 복구. 실습 환경에서는 감수 |
| Grafana 로그인 실패 | Secret 비밀번호와 다름 | `kubectl -n monitoring get secret grafana-admin -o jsonpath='{.data.admin-password}' \| base64 -d` |
