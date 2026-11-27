# <비전어스> — <Home IoT 플랫폼>
<p align="center">
  <img src="docs/README%20banner.png" alt="비전어스 Home IoT 플랫폼 배너" width="100%">
</p>

### 소개🔻
>가정에서 사용하는 여러 전자기기를 하나의 플랫폼에 연결하고, 스마트폰이나 웹에서 상태를 확인하거나 원격으로 제어하는 시스템입니다.
## 문서

| 구분 | 문서 | 내용 |
|---|---|---|
| 기획 | [기획서](docs/home-iot-plan-v0.2.md)  | 목표 · 범위 · 성공 기준 · 일정 |
| | [요구사항](docs/Home_IoT_Requirements_v0.1.md) | 기능(US-번호) · 비기능 |
| 설계 | [아키텍처](docs/Home_IoT_Architecture.pdf) | 컨텍스트 · 서비스 구성 · 핵심 시퀀스 · 배포 구성 |
| | [기술 스택](docs/tech-stack.md) | 무엇을 왜 어디에 |
| | [API 명세](docs/api-spec.md) | 서비스별 OpenAPI |
| | [ERD](docs/erd/) | 서비스별 DB |
| | [DB 구조 · 샘플 데이터](docs/db-seed.md) | `db/schema.sql` · `db/seed.sql` 실행 방법 |
| | [관측 설계](docs/observability.md) | 지표 · 로그 · 알림 |
| 협업 | [역할](docs/roles.md) | 서비스 담당 · 공통 영역 담당 |
| | [공통 규칙](docs/conventions.md) | Git 전략 · 코드 규칙 · 비밀값 |
| | [팀 운영 약속](docs/team.md) | 완료 기준 · 회의 · 의사결정 |
| | [GitHub 사용 가이드](docs/github-guide.md) | clone · 브랜치 · PR · 리뷰 |
| 운영 | [런북](docs/runbook.md) | 장애별 확인 명령 · 조치 |
| | [모니터링 설치 가이드](docs/monitoring-guide.md) | Prometheus · Loki · Grafana 설치 · 확인 |
| | [부하 테스트](docs/load-test.md) | 출시 전 용량 테스트 (동시 100 → 1,000명) · 로그인 병목 트러블슈팅 |
| | [이미지 크기 비교](docs/image-size.md) | 멀티스테이지 빌드 전후 (285MB → 226MB) |
| | [결정 기록](docs/adr/) | 무엇을 왜 골랐나 |

## 외부 도구로 작성하기

문서는 이 저장소에 직접 써도 되고, 더 편한 도구로 써도 됩니다. 외부 도구로 쓰면 해당 `docs/` 파일에 링크와 한 줄 요약을 남겨, 이 README에서 모든 문서를 찾을 수 있게 합니다.

| 문서 | 잘 맞는 도구 |
|---|---|
| 기획서 · 기술 스택 · 팀 운영 약속 · 회의록 | [Notion](https://www.notion.so), [Google Docs](https://docs.google.com) |
| 요구사항 · 할 일 | GitHub Projects · Issues, [Notion](https://www.notion.so) 데이터베이스 |
| 아키텍처 그림 | [draw.io](https://app.diagrams.net), [Excalidraw](https://excalidraw.com), [FigJam](https://www.figma.com/figjam/), [Miro](https://miro.com), [Mermaid](https://mermaid.js.org)(Markdown 안에 바로) |
| 화면 설계 · 와이어프레임 | [Figma](https://www.figma.com) |
| API 명세 | [Swagger Editor](https://editor.swagger.io)(OpenAPI 파일), [Postman](https://www.postman.com) |
| ERD | [dbdiagram.io](https://dbdiagram.io), [ERDCloud](https://www.erdcloud.com) |

- 저장소가 공개이므로 외부 문서는 "링크가 있는 사람 보기"로 공유합니다. 비밀값은 외부 문서에도 쓰지 않습니다
- 그림은 링크와 함께 PNG 한 장을 `docs/`에 같이 올려 두면 도구가 없어도 볼 수 있습니다
- API 명세는 코드와 함께 바뀌므로 OpenAPI 파일을 저장소에 두는 것을 권합니다

## 링크

| 항목 | 링크 |
|---|---|
| 할 일 보드 (GitHub Projects) |https://github.com/orgs/ktcloud-cloudnative-2026/projects/3|
| dev 주소 | <dev 주소> |
| prod 주소 | <prod 주소> |
| 대시보드 | <Grafana 주소> |

## 폴더

```
docs/       설계 문서 (이 README의 표)
services/   서비스 코드 — 서비스마다 폴더 하나
deploy/     Kubernetes 매니페스트 · Argo CD
.github/    PR · 이슈 템플릿, CI 워크플로
```
