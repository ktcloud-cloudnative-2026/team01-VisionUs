#!/usr/bin/env bash
# 배포 이력 표 만들기
# main에 머지된 배포 커밋 "deploy(환경): 서비스 태그 (#PR)"를 읽어 마크다운 표로 출력한다.
# 사용: git fetch && bash scripts/deploy-history.sh > docs/deploy-history.md
#
# 빌드 번호: Jenkins가 만든 dev 배포 PR 본문("Jenkins 빌드 #N")을 GitHub API로 읽는다.
#   - 공개 저장소라 토큰 없이 됨 (시간당 60회 제한). GITHUB_TOKEN 이 있으면 같이 보낸다
#   - prod는 다시 빌드하지 않으므로 같은 태그를 만든 dev 빌드 번호를 적는다
#   - API를 못 읽으면 "-" 로 두고 표는 그대로 만든다
set -euo pipefail
BRANCH="${1:-origin/main}"
REPO="${REPO:-ktcloud-cloudnative-2026/team01-VisionUs}"

build_of_pr() {  # PR 번호 → Jenkins 빌드 번호 (없으면 빈 값)
  local auth=()
  [ -n "${GITHUB_TOKEN:-}" ] && auth=(-H "Authorization: Bearer $GITHUB_TOKEN")
  curl -sf --max-time 10 ${auth[@]+"${auth[@]}"} "https://api.github.com/repos/$REPO/pulls/$1" 2>/dev/null |
    grep -oE 'Jenkins 빌드 #[0-9]+' | head -1 | grep -oE '[0-9]+$' || true
}

rows=$(TZ=Asia/Seoul git log "$BRANCH" --grep='^deploy(' --format='%cd%x09%s' --date=format-local:'%Y-%m-%d %H:%M')

# 1) dev 배포 PR에서 빌드 번호 모으기 (태그 → "서비스 #N")
declare -A BUILD_OF_TAG=()
while IFS=$'\t' read -r date subject; do
  [[ "$subject" == deploy\(dev\)* ]] || continue
  svc=$(awk '{print $2}' <<<"$subject")
  tag=$(awk '{print $3}' <<<"$subject")
  pr=$(grep -oE '#[0-9]+' <<<"$subject" | tail -1 || true)
  [ -n "$pr" ] || continue
  n=$(build_of_pr "${pr#\#}")
  [ -n "$n" ] && BUILD_OF_TAG["$svc $tag"]="$svc #$n"
done <<<"$rows"

echo "# 배포 이력"
echo
echo "\`bash scripts/deploy-history.sh\`로 만든 표입니다. 손으로 고치지 않습니다."
echo
echo "- **빌드 번호**: Jenkins 작업(서비스)별 빌드 번호. prod는 다시 빌드하지 않으므로 같은 이미지를 만든 dev 빌드 번호입니다"
echo
echo "| 날짜 | 환경 | 서비스 | 이미지 태그 | 빌드 번호 | 배포 PR | 배포한 변경 |"
echo "| --- | --- | --- | --- | --- | --- | --- |"
while IFS=$'\t' read -r date subject; do
  # 예: deploy(dev): control sha-9d5a6c1 (#37)
  env=$(sed -E 's/^deploy\(([^)]*)\).*/\1/' <<<"$subject")
  svc=$(awk '{print $2}' <<<"$subject")
  tag=$(awk '{print $3}' <<<"$subject")
  pr=$(grep -oE '#[0-9]+' <<<"$subject" | tail -1 || true)
  build="${BUILD_OF_TAG["$svc $tag"]:--}"
  # 태그의 커밋 번호로 "무엇을 배포했는지" 찾기
  src=$(git log -1 --format=%s "${tag#sha-}" 2>/dev/null || echo "-")
  echo "| $date | $env | $svc | \`$tag\` | $build | ${pr:--} | $src |"
done <<<"$rows"
