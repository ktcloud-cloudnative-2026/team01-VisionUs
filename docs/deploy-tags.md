# 이미지 태그 규칙 · 배포 이력

[← README](../README.md) · [파이프라인 안내](pipeline-guide.md) · [배포 이력 표](deploy-history.md)

## 1. 태그 규칙

| 태그 | 예 | 누가 붙이나 | 어디에 쓰나 |
| --- | --- | --- | --- |
| `sha-<커밋 7자리>` | `sha-9d5a6c1` | Jenkins (준비 단계) | **배포에 쓰는 태그.** dev 설정의 `newTag`에 들어감 |
| `latest` | `latest` | Jenkins (빌드 단계) | 가장 최근에 만든 이미지. 배포에는 쓰지 않음 |

- 이미지 주소: `ghcr.io/ktcloud-cloudnative-2026/team01-visionus/<서비스>:<태그>`
- `sha-` 뒤 7자리는 main에 머지된 커밋 번호입니다. 태그만 보고 어떤 코드로 만든 이미지인지 찾을 수 있습니다.
  - 예: `sha-9d5a6c1` → `git show 9d5a6c1` → `feat: control 명령 API 받기 + 입력 검사 (#35)`
- 같은 태그로 이미지를 다시 올리지 않습니다. 코드가 바뀌면 커밋이 바뀌고, 태그도 새로 생깁니다.

### 배포에 `latest`를 쓰지 않는 이유

- `latest`는 새로 빌드할 때마다 내용이 바뀌어서, 지금 돌고 있는 버전이 무엇인지 알 수 없습니다.
- 태그 글자가 그대로면 Argo CD가 바뀐 것을 알아채지 못해 배포가 일어나지 않습니다.
- 되돌릴 때 "어느 버전으로" 돌아갈지 정할 수 없습니다.

## 2. 배포 PR 규칙

Jenkins가 아래 이름으로 만듭니다. **배포 이력 표가 이 제목을 읽으므로 제목을 고치지 않습니다.**

| 항목 | 모양 | 예 |
| --- | --- | --- |
| 브랜치 | `deploy/<환경>-<서비스>-<태그>` | `deploy/dev-control-sha-9d5a6c1` |
| PR 제목 · 커밋 | `deploy(<환경>): <서비스> <태그>` | `deploy(dev): control sha-9d5a6c1` |
| 바뀌는 파일 | `deploy/overlays/<환경>/kustomization.yaml`의 `newTag` 한 줄 | |

## 3. prod (아직 정하지 않음)

제안: dev에서 확인한 **같은 `sha-` 태그를 prod에 그대로** 올립니다. 다시 빌드하지 않으므로 dev에서 시험한 이미지와 prod 이미지가 똑같습니다. PR 제목은 `deploy(prod): <서비스> <태그>`로 같은 모양을 씁니다.

## 4. 배포 이력 표

[deploy-history.md](deploy-history.md)는 손으로 적지 않고 스크립트로 만듭니다. main에 머지된 배포 커밋(`deploy(...)`)이 곧 배포 기록이기 때문입니다.

```bash
git switch main && git pull
bash scripts/deploy-history.sh > docs/deploy-history.md
```

표를 새로 만든 뒤 `docs/` PR로 올립니다. 배포할 때마다 할 필요는 없고, 정리가 필요할 때(주 1회, 발표 전 등) 한 번 돌리면 됩니다.

## 5. 되돌리기

1. 배포 이력 표에서 돌아갈 태그를 찾습니다 (예: 바로 앞 줄의 `sha-2d613f4`).
2. 그 배포 PR을 GitHub에서 **Revert** 하거나, `newTag`를 그 태그로 바꾸는 PR을 만들어 머지합니다.
3. Argo CD가 main을 보고 이전 버전으로 맞춥니다.
