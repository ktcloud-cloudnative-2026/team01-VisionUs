# 이미지 태그 규칙 · 배포 이력

[← README](../README.md) · [파이프라인 안내](pipeline-guide.md) · [배포 이력 표](deploy-history.md)

## 1. 태그 규칙

| 태그 | 예 | 누가 붙이나 | 어디에 쓰나 |
| --- | --- | --- | --- |
| `sha-<커밋 7자리>` | `sha-9d5a6c1` | Jenkins (준비 단계) | **배포에 쓰는 태그.** dev, prod 설정의 `newTag`에 들어감 |
| `latest` | `latest` | Jenkins (빌드 단계) | 가장 최근에 만든 이미지. 배포에는 쓰지 않음 |

- 이미지 주소: `ghcr.io/ktcloud-cloudnative-2026/team01-visionus/<서비스>:<태그>`
- `sha-` 뒤 7자리는 main에 머지된 커밋 번호입니다. 태그만 보고 어떤 코드로 만든 이미지인지 찾을 수 있습니다.
  - 예: `sha-9d5a6c1` → `git show 9d5a6c1` → `feat: control 명령 API 받기 + 입력 검사 (#35) (#36)`
- 같은 태그로 이미지를 다시 올리지 않습니다. 코드가 바뀌면 커밋이 바뀌고, 태그도 새로 생깁니다.

### 배포에 `latest`를 쓰지 않는 이유

- `latest`는 새로 빌드할 때마다 내용이 바뀌어서, 지금 돌고 있는 버전이 무엇인지 알 수 없습니다.
- 태그 글자가 그대로면 Argo CD가 바뀐 것을 알아채지 못해 배포가 일어나지 않습니다.
- 되돌릴 때 "어느 버전으로" 돌아갈지 정할 수 없습니다.

## 2. 배포 PR 규칙

배포 PR은 dev, prod 모두 아래 이름을 씁니다. **배포 이력 표가 이 제목을 읽으므로 제목을 고치지 않습니다.**

- **dev**: Jenkins가 PR을 만든 뒤 **바로 자동 머지**합니다 (테스트 · 빌드 · Trivy 검사 · GHCR 올리기를 모두 통과한 경우에만). 자동 머지에 실패하면 디스코드 알림의 PR을 직접 머지합니다.
- **prod**: 사람이 PR을 만들고 머지합니다 (아래 3번).

| 항목 | 모양 | 예 |
| --- | --- | --- |
| 브랜치 | `deploy/<환경>-<서비스>-<태그>` | `deploy/dev-control-sha-9d5a6c1` |
| PR 제목 · 커밋 | `deploy(<환경>): <서비스> <태그>` | `deploy(dev): control sha-9d5a6c1` |
| 바뀌는 파일 | `deploy/overlays/<환경>/kustomization.yaml`의 `newTag` 한 줄 | |

## 3. prod 승인 배포

dev에서 확인된 **같은 `sha-` 태그를 prod에 그대로** 올립니다. 다시 빌드하지 않으므로 dev에서 시험한 이미지와 prod 이미지가 똑같습니다.

1. dev에서 동작 확인 (`/readyz` ready, 기능 확인)
2. `deploy/overlays/prod/kustomization.yaml`의 `newTag` **한 줄만** dev와 같은 태그로 바꾸는 PR을 만듭니다 (prod에 처음 올라가는 서비스는 아래 참고).
   - 브랜치 `deploy/prod-<서비스>-<태그>`, 제목 `deploy(prod): <서비스> <태그>`
   - 본문에 dev 배포 PR 번호와 확인 결과를 적습니다.
3. **PR 머지 = 승인.** 머지하면 Argo CD(`home-iot-prod`)가 prod에 반영합니다.
4. 팀원 PR은 서로 관심 가지고 살펴봅니다 (바뀐 게 태그 한 줄인지, dev와 같은 태그인지).

- 첫 prod 배포: `deploy(prod): control sha-c3b55f7` (#55, 11/20)
- 서비스가 prod에 **처음** 올라갈 때는 태그 한 줄로 안 끝납니다. ① `overlays/prod`의 `resources`, `images`에 내 서비스 추가 (dev 가이드 7번과 같은 일) ② 서비스가 따로 쓰는 비밀값이 있으면 prod 클러스터에도 넣기 (예: auth 로그인 키 `auth-jwt`. dev 가이드 7-1번의 "키 만들기", "클러스터에 넣기"만 t1-prod-cp로 하면 됨. "배포 설정에 연결"은 dev 때 이미 됨). 공용 비밀값(DB, MQTT, GHCR)은 이미 들어 있습니다.

## 4. 배포 이력 표

[deploy-history.md](deploy-history.md)는 손으로 적지 않고 스크립트로 만듭니다. main에 머지된 배포 커밋(`deploy(...)`)이 곧 배포 기록이기 때문입니다.

```bash
git switch main && git pull
bash scripts/deploy-history.sh > docs/deploy-history.md
```

표를 새로 만든 뒤 `docs/` PR로 올립니다. 배포할 때마다 할 필요는 없고, 정리가 필요할 때(주 1회, 발표 전 등) 한 번 돌리면 됩니다.

- **빌드 번호** 칸은 Jenkins가 만든 dev 배포 PR 본문("Jenkins 빌드 #N")을 GitHub API로 읽어 채웁니다. 토큰 없이 시간당 60번까지 읽을 수 있어서, 연달아 여러 번 돌리면 `-` 로 비는 칸이 생길 수 있습니다 (`GITHUB_TOKEN` 이 있으면 자동으로 씀)
- prod는 다시 빌드하지 않으므로, prod 줄의 빌드 번호는 **같은 태그를 만든 dev 빌드 번호**입니다
- 대시보드에서도 배포를 볼 수 있습니다: Grafana `Home IoT 개요` 의 파란 세로선(배포 시각)과 맨 아래 표(지금 돌고 있는 이미지) — [지표 가이드](metrics-guide.md) 2-4절

## 5. 되돌리기

1. 배포 이력 표에서 돌아갈 태그를 찾습니다. 표는 최근 것이 위에 있으니, 같은 환경·서비스 중 **바로 아래 줄**이 직전 버전입니다.
2. **문제가 된 배포 PR**(가장 위 줄)을 GitHub에서 **Revert** 하거나, `newTag`를 1번에서 찾은 태그로 바꾸는 PR을 만들어 머지합니다.
3. Argo CD가 main을 보고 이전 버전으로 맞춥니다.
