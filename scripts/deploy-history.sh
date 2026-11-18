#!/usr/bin/env bash
# 배포 이력 표 만들기
# main에 머지된 배포 커밋 "deploy(환경): 서비스 태그 (#PR)"를 읽어 마크다운 표로 출력한다.
# 사용: git fetch && bash scripts/deploy-history.sh > docs/deploy-history.md
set -euo pipefail
BRANCH="${1:-origin/main}"

echo "# 배포 이력"
echo
echo "\`bash scripts/deploy-history.sh\`로 만든 표입니다. 손으로 고치지 않습니다."
echo
echo "| 날짜 | 환경 | 서비스 | 이미지 태그 | 배포 PR | 배포한 변경 |"
echo "| --- | --- | --- | --- | --- | --- |"
TZ=Asia/Seoul git log "$BRANCH" --grep='^deploy(' --format='%cd%x09%s' --date=format-local:'%Y-%m-%d %H:%M' |
while IFS=$'\t' read -r date subject; do
  # 예: deploy(dev): control sha-9d5a6c1 (#37)
  env=$(sed -E 's/^deploy\(([^)]*)\).*/\1/' <<<"$subject")
  svc=$(awk '{print $2}' <<<"$subject")
  tag=$(awk '{print $3}' <<<"$subject")
  pr=$(grep -oE '#[0-9]+' <<<"$subject" | tail -1 || true)
  # 태그의 커밋 번호로 "무엇을 배포했는지" 찾기
  src=$(git log -1 --format=%s "${tag#sha-}" 2>/dev/null || echo "-")
  echo "| $date | $env | $svc | \`$tag\` | ${pr:--} | $src |"
done
