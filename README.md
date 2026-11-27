# 비전어스 — Home IoT 플랫폼
<p align="center">
  <img src="docs/README%20banner.png" alt="비전어스 Home IoT 플랫폼 배너" width="100%">
</p>

### 소개🔻
>가정에서 사용하는 여러 전자기기를 하나의 플랫폼에 연결하고, 스마트폰이나 웹에서 상태를 확인하거나 원격으로 제어하는 시스템입니다.

## 결과물 한눈에

| 단계 | 결과물 | 어디에 |
|---|---|---|
| ① 설계 | API 명세 · ERD · 아키텍처 · 기술 스택 | [API 명세](docs/api-spec.md) · [ERD](docs/erd/) · [아키텍처](docs/Home_IoT_Architecture.pdf) · [기술 스택](docs/tech-stack.md) |
| | 지표 정의 · 역할 분담 | [관측 설계](docs/observability.md) · [지표 가이드](docs/metrics-guide.md) · [역할](docs/roles.md) |
| | DB 구조 · 샘플 데이터 시드 | [`db/`](db/) · [DB 구조 · 샘플 데이터](docs/db-seed.md) |
| ② 구현 · 컨테이너 | 서비스 코드 · 단위 테스트 | [`services/`](services/) · [`web/`](web/) |
| | Dockerfile (멀티스테이지 · non-root, 연습용 sample만 한 단계) · 이미지 크기 비교 | `services/<서비스>/Dockerfile` · `web/Dockerfile` · [이미지 크기 비교](docs/image-size.md) |
| | 쿠버네티스 매니페스트 (probe · 자원 제한) | [`deploy/`](deploy/) |
| ③ 배포 · 관측 · 성능 | CI (테스트 · 빌드 · Trivy · GHCR) · 단계도 | `services/<서비스>/Jenkinsfile` · `web/Jenkinsfile` · [파이프라인 안내](docs/pipeline-guide.md) |
| | GitOps 배포 (Argo CD) · 태그 규칙 · 배포 이력 | [`deploy/overlays/`](deploy/overlays/) · [태그 규칙](docs/deploy-tags.md) · [배포 이력](docs/deploy-history.md) |
| | 롤백 시연 | [롤백 시연](docs/rollback-demo.md) |
| | 모니터링 (Prometheus · Grafana · Loki) · 대시보드 | [모니터링 가이드](docs/monitoring-guide.md) · [대시보드 JSON](deploy/monitoring/dashboards/home-iot-overview.json) |
| | 경보 · 장애 대응 · 로그로 원인 찾은 사례 | [런북](docs/runbook.md) · [로그 사례](docs/log-case.md) |
| | 부하 테스트 (k6) 개선 전후 | [부하 테스트](docs/load-test.md) · [`load/`](load/) |

## 문서

| 구분 | 문서 | 내용 |
|---|---|---|
| 기획 | [기획서](docs/home-iot-plan-v0.2.md)  | 목표 · 범위 · 성공 기준 · 일정 |
| | [요구사항](docs/Home_IoT_Requirements_v0.1.md) | 기능(US-번호) · 비기능 |
| 설계 | [아키텍처](docs/Home_IoT_Architecture.pdf) | 컨텍스트 · 서비스 구성 · 핵심 시퀀스 · 배포 구성 |
| | [기술 스택](docs/tech-stack.md) | 무엇을 왜 어디에 |
| | [API 명세](docs/api-spec.md) | REST API 경로 · 요청 · 응답 · 에러 코드 |
| | [ERD](docs/erd/) | 테이블 관계 (실제 구조는 `db/schema.sql`) |
| | [DB 구조 · 샘플 데이터](docs/db-seed.md) | `db/schema.sql` · `db/seed.sql` 실행 방법 |
| | [관측 설계](docs/observability.md) | 지표 · 로그 · 알림 |
| 협업 | [역할](docs/roles.md) | 서비스 담당 · 공통 영역 담당 |
| | [공통 규칙](docs/conventions.md) | Git 전략 · 코드 규칙 · 비밀값 |
| | [팀 운영 약속](docs/team.md) | 완료 기준 · 회의 · 의사결정 |
| | [GitHub 사용 가이드](docs/github-guide.md) | clone · 브랜치 · PR · 리뷰 |
| 운영 | [런북](docs/runbook.md) | 장애별 확인 명령 · 조치 |
| | [파이프라인 안내](docs/pipeline-guide.md) | CI/CD 단계도 · 내 서비스를 dev에 올리는 법 |
| | [태그 규칙 · 배포 이력](docs/deploy-tags.md) | 이미지 태그 · prod 승인 배포 · [배포 이력 표](docs/deploy-history.md) |
| | [롤백 시연](docs/rollback-demo.md) | 태그 한 줄로 이전 버전 되돌리기 |
| | [모니터링 설치 가이드](docs/monitoring-guide.md) | Prometheus · Loki · Grafana 설치 · 확인 |
| | [지표 가이드](docs/metrics-guide.md) | 대시보드 패널 · 쿼리 읽는 법 |
| | [로그 사례](docs/log-case.md) | Loki로 원인 찾은 기록 |
| | [부하 테스트](docs/load-test.md) | 출시 전 용량 테스트 (동시 100 → 1,000명) · 로그인 병목 트러블슈팅 |
| | [이미지 크기 비교](docs/image-size.md) | 멀티스테이지 빌드 전후 (285MB → 226MB) |

## 링크

| 항목 | 링크 |
|---|---|
| 할 일 보드 (GitHub Projects) |https://github.com/orgs/ktcloud-cloudnative-2026/projects/3|
| dev 주소 | https://visionus-dev.jpexstudio.com |
| prod 주소 | https://visionus.jpexstudio.com |
| 대시보드 (Grafana) | 내부망 전용 · SSH 터널로 접속 (dev `localhost:13000`, prod `localhost:13001`) → [모니터링 가이드 5절](docs/monitoring-guide.md#브라우저로-grafana--prometheus-보기) |

## 폴더

```
docs/       설계 · 운영 문서 (이 README의 표)
services/   백엔드 서비스 코드 — 서비스마다 폴더 하나 (Dockerfile · Jenkinsfile 포함)
web/        사용자 화면 (Next.js)
nginx/      web 앞단 nginx (web-nginx)
deploy/     Kubernetes 매니페스트 · Argo CD · 모니터링
db/         DB 구조 · 샘플 데이터 시드
load/       k6 부하 테스트 스크립트
scripts/    보조 스크립트 (배포 이력 표 만들기)
.github/    PR · 이슈 템플릿, CODEOWNERS
```
