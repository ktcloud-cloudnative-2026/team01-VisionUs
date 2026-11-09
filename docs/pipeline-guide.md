# 내 서비스를 dev에 올리는 법

[← README](../README.md)

> **sample을 복사해서 이름만 바꾸면** 머지할 때 dev에 올라갑니다.

## 흐름

```
[처음 한 번]  sample 복사 → 이름 바꾸기 → dev 목록에 등록 → 올리기
[매번]        PR 머지 → (자동) 테스트·빌드 → 배포 PR 머지 → (자동) dev에 배포
```

클러스터에 직접 접속할 필요는 없습니다.

## 처음 한 번: 내 서비스 붙이기

> **1~5번은 같은 터미널에서 이어서** 실행합니다.
> 터미널을 닫았다면 `SVC=내서비스이름` 을 다시 입력하고 이어서 하면 됩니다. (`echo $SVC` 로 확인)

**1. 브랜치**

내 서비스 작업용 이슈를 먼저 만들고, 그 번호를 씁니다. (예: 이슈 #20 → `feat/20-control-service`)

```bash
cd ~/team01
git switch main && git pull
git switch -c feat/<이슈번호>-<서비스>-service
```

**2. sample 복사하고 이름 바꾸기**

아래를 **그대로 복사하고, 맨 위 `SVC=` 뒤만 내 서비스 이름(소문자)으로** 바꿉니다.
(auth · device · control · telemetry · simulator)

```bash
SVC=control

cp -r services/sample services/$SVC
rm -rf services/$SVC/node_modules
sed -i "s/sample/$SVC/g" services/$SVC/package.json services/$SVC/package-lock.json services/$SVC/src/*.js

cp .github/workflows/sample.yml .github/workflows/$SVC.yml
sed -i "s/sample/$SVC/g" .github/workflows/$SVC.yml

cp -r deploy/base/sample deploy/base/$SVC
sed -i "s/sample/$SVC/g" deploy/base/$SVC/*.yaml
```

sample 옆에 내 서비스가 새로 생깁니다 (`services/`, `.github/workflows/`, `deploy/base/`). sample 원본은 그대로입니다.

확인:

```bash
ls services/ deploy/base/
grep -rn sample services/$SVC/src deploy/base/$SVC .github/workflows/$SVC.yml
```

`ls` 에 내 서비스가 보이고, `grep` 결과가 **아무것도 안 나오면** 됩니다.

**3. dev 목록에 등록**

`deploy/overlays/dev/kustomization.yaml` 은 **dev에 무엇을, 어떤 버전으로 띄울지** 적은 목록입니다.
여기에 내 줄을 추가합니다. 그대로 복사해서 실행합니다.

```bash
F=deploy/overlays/dev/kustomization.yaml
sed -i "\#- ../../base/sample#a\  - ../../base/$SVC" $F
printf '  - name: ghcr.io/ktcloud-cloudnative-2026/team01-visionus/%s\n    newTag: latest\n' "$SVC" >> $F
cat $F
```

- `resources`: dev에 띄울 서비스 목록 → 내 서비스 추가
- `images`: 서비스별 버전 칸 → 내 칸 추가. 처음엔 `latest`, 이후엔 머지할 때마다 자동으로 바뀝니다

↓ **붙여 넣지 말고 비교만** 하세요. `cat` 결과가 이렇게 보이면 됩니다 (control 자리에 내 서비스 이름).

```yaml
resources:
  - ../../base/platform
  - ../../base/sample
  - ../../base/control
images:
  - name: ghcr.io/ktcloud-cloudnative-2026/team01-visionus/sample
    newTag: sha-xxxxxxx
  - name: ghcr.io/ktcloud-cloudnative-2026/team01-visionus/control
    newTag: latest
```

**4. 주소 (나중에)**

지금은 `/api/<서비스>` 로 자동 설정되어 있고, 이대로 dev에서 동작합니다.
API 주소가 정해지면 **두 곳을 같이** 바꿉니다. 하나만 바꾸면 404가 납니다. (팀 협의)

- `deploy/base/<서비스>/httproute.yaml` 의 경로 (입구에서 내 서비스로 보내는 규칙)
- `services/<서비스>/src/app.js` 의 라우트 (내 서비스가 받는 주소)

**5. 테스트하고 올리기**

```bash
cd services/$SVC && npm install && npm test && cd ~/team01
git add services/$SVC .github/workflows/$SVC.yml deploy/
git status
git commit -m "feat: <서비스> 서비스 추가 (#이슈번호)"
git push -u origin feat/<이슈번호>-<서비스>-service
```

- `npm test` 에서 `fail 0` 이면 통과입니다
- `git status` 에서 **초록색**으로 내 서비스 폴더, 워크플로, `deploy/` 파일들이 보이면 됩니다

## 매번: dev에 올리기

1. PR → 검사(test, build) 초록 확인 → Squash and merge
2. **머지한 다음 한 번 더**: **Actions** 탭 → 방금 돈 실행 → `deploy-dev` 까지 초록이 되면, 아래 **Summary** 의 **"dev 배포 PR 만들기"** 링크 → PR 만들기
3. 바뀐 게 `newTag` 한 줄인지 보고 → Squash and merge
4. 몇 분 뒤 dev에 반영됩니다

## 잘못 올라갔으면

배포 PR 화면에서 **Revert** → 만들어진 PR 머지 → 이전 버전으로 돌아갑니다.

## 참고

- main은 PR로만 바뀝니다. 그래서 배포도 PR로 합니다
- 배포 PR을 손으로 만드는 이유: 조직 설정상 Actions가 PR을 만들 수 없어서입니다
- dev에 안 올라가면 알려 주세요
