# 내 서비스를 dev에 올리는 법

[← README](../README.md)

> **sample을 복사해서 이름만 바꾸면** 머지할 때 dev에 올라갑니다.
> CI는 Jenkins(t1-ci)가 하고, 배포는 Argo CD가 합니다.

## 흐름

```
[처음 한 번]  sample 복사 → 이름 바꾸기 → dev 목록에 등록 → 올리기 → Jenkins 작업 만들기
[매번]        PR 머지 → (자동) Jenkins: 테스트·빌드·보안 검사·이미지 올리기·배포 PR 생성
              → 배포 PR 머지 → (자동) Argo CD가 dev에 배포
```

클러스터에 직접 접속할 필요는 없습니다.

## 처음 한 번: 내 서비스 붙이기

> **1~5번은 같은 터미널에서 이어서** 실행합니다.
> 터미널을 닫았다면 `SVC=내서비스이름` 을 다시 입력하고 이어서 하면 됩니다. (`echo $SVC` 로 확인)

**1. 브랜치**

내 서비스 작업용 이슈를 먼저 만들고, 그 번호를 씁니다. (예: 이슈 #30 → `feat/30-control-service`)

```bash
cd ~/team01        # 내 저장소 폴더 (clone한 이름이 다르면 그 폴더로)
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
sed -i "s/sample/$SVC/g" services/$SVC/package.json services/$SVC/package-lock.json services/$SVC/src/*.js services/$SVC/test/*.js services/$SVC/Jenkinsfile

cp -r deploy/base/sample deploy/base/$SVC
sed -i "s/sample/$SVC/g" deploy/base/$SVC/*.yaml
```

sample 옆에 내 서비스가 새로 생깁니다 (`services/`, `deploy/base/`). sample 원본은 그대로입니다.
`services/<서비스>/Jenkinsfile` 도 함께 복사되어 내 서비스 이름으로 바뀝니다.

확인:

```bash
ls services/ deploy/base/
grep -rn sample services/$SVC/src services/$SVC/test services/$SVC/Jenkinsfile deploy/base/$SVC
```

`ls` 에 내 서비스가 보이고, `grep` 결과가 **아무것도 안 나오면** 됩니다.

**3. dev 목록에 등록**

`deploy/overlays/dev/kustomization.yaml` 은 **dev에 무엇을, 어떤 버전으로 띄울지** 적은 목록입니다.
여기에 내 줄을 추가합니다. 그대로 복사해서 **한 번만** 실행합니다 (두 번 하면 줄이 두 개 생깁니다).

```bash
F=deploy/overlays/dev/kustomization.yaml
sed -i "s#^\( *\)- ../../base/sample\$#&\n\1- ../../base/$SVC#" $F
IND=$(grep -m1 -o '^ *- name:' $F | sed 's/- name://')
printf '%s- name: ghcr.io/ktcloud-cloudnative-2026/team01-visionus/%s\n%s  newTag: latest\n' "$IND" "$SVC" "$IND" >> $F
cat $F
```

- `resources`: dev에 띄울 서비스 목록 → 내 서비스 추가
- `images`: 서비스별 버전 칸 → 내 칸 추가. 처음엔 `latest`, 이후엔 Jenkins가 자동으로 바꿉니다

↓ **붙여 넣지 말고 비교만** 하세요. `cat` 결과가 이렇게 보이면 됩니다 (control 자리에 내 서비스 이름, 줄 앞 공백은 달라도 됩니다).

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
(cd services/$SVC && npm install && npm test)
git add services/$SVC deploy/
git status
git commit -m "feat: <서비스> 서비스 추가 (#이슈번호)"
git push -u origin feat/<이슈번호>-<서비스>-service
```

- `npm test` 에서 `fail 0` 이면 통과입니다. **실패하면 아래 줄은 치지 말고** 고친 뒤 다시 합니다
- 첫 줄의 괄호 `( )` 는 테스트만 서비스 폴더에서 하고, 끝나면 원래 폴더(저장소 맨 위)로 돌아오게 합니다
- `git status` 에서 **초록색**으로 내 서비스 폴더와 `deploy/` 파일들이 보이면 됩니다. `node_modules` 가 보이면 커밋하지 말고 알려 주세요
- GitHub에서 PR → 머지까지 합니다

**6. Jenkins 작업 만들기**

Jenkins 화면 여는 법은 아래 [참고](#jenkins-화면-보기)에 있습니다.

1. **새로운 Item** → 이름 `<서비스>` → **Pipeline** → **OK**
2. 맨 아래 **Pipeline** 칸

   | 항목 | 값 |
   | --- | --- |
   | Definition | Pipeline script from SCM |
   | SCM | Git |
   | Repository URL | `https://github.com/ktcloud-cloudnative-2026/team01-VisionUs.git` |
   | Credentials | `smh4261/******` (github) |
   | Branch Specifier | `*/main` |
   | Script Path | `services/<서비스>/Jenkinsfile` |

3. **저장** → 5번 PR이 머지된 뒤 **지금 빌드** 한 번 (처음 한 번 눌러야 자동 실행이 등록됩니다)

## 매번: dev에 올리기

1. 로컬에서 `npm test` 통과 확인 → PR → Squash and merge
2. 2분 안에 Jenkins가 알아서 빌드합니다 (테스트 → 빌드 → 보안 검사 → 이미지 올리기 → 배포 PR)
3. **Pull requests** 에 `deploy(dev): <서비스> sha-xxxxxxx` PR이 자동으로 생깁니다
4. 바뀐 게 내 서비스 `newTag` 인지 보고 → Squash and merge
5. 몇 분 뒤 dev에 반영됩니다

## 잘못 올라갔으면

배포 PR 화면에서 **Revert** → 만들어진 PR 머지 → 이전 버전으로 돌아갑니다.

## 참고

- main은 PR로만 바뀝니다. 그래서 배포도 PR로 합니다
- PR 단계 자동 검사는 없습니다. **머지 전에 로컬에서 `npm test`** 를 꼭 돌려 주세요
- 배포 PR이 안 생기면 Jenkins에서 내 작업의 빌드 → **Console Output** 을 확인합니다. 그래도 모르겠으면 알려 주세요

### Jenkins 화면 보기

Jenkins는 t1-ci(`10.10.21.30`) 서버에 있습니다. 계정은 파이프라인 담당에게 받습니다.

1. `~/.ssh/config` 에 추가 (처음 한 번)

   ```
   Host t1-ci
     HostName 10.10.21.30
     User lab
     ProxyJump t1-bastion
   ```

2. 터미널에서 켜 두기 (멈춰 있으면 정상, 끝낼 때 Ctrl+C)

   ```bash
   ssh -N -L 18080:localhost:8080 t1-ci
   ```

3. 브라우저에서 `http://localhost:18080`
