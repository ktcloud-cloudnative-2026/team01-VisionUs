# 배포 이력

`bash scripts/deploy-history.sh`로 만든 표입니다. 손으로 고치지 않습니다.

- **빌드 번호**: Jenkins 작업(서비스)별 빌드 번호. prod는 다시 빌드하지 않으므로 같은 이미지를 만든 dev 빌드 번호입니다

| 날짜 | 환경 | 서비스 | 이미지 태그 | 빌드 번호 | 배포 PR | 배포한 변경 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-26 14:17 | dev | web | `sha-f1807d0` | web #24 | #103 | fix: 모든 기기 목록에서 기기 등록 카드 제거 (#102) (#102) |
| 2026-11-26 12:35 | dev | web | `sha-fa42768` | web #22 | #101 | feat: 웹 화면 디자인 적용 (#100) (#100) |
| 2026-11-26 12:11 | dev | simulator | `sha-439e416` | simulator #24 | #99 | feat: simulator 화면 디자인 수정 (#98) (#98) |
| 2026-11-26 11:49 | dev | simulator | `sha-70d2bbb` | simulator #22 | #97 | feat: simulator 화면 디자인 적용 (#96) (#96) |
| 2026-11-24 14:35 | prod | auth | `sha-2c300d1` | auth #25 | #89 | feat: auth를 최종 소스로 교체 (#66) (#67) |
| 2026-11-24 12:23 | dev | simulator | `sha-4f51360` | simulator #13 | #88 | feat: simulator의 Dockerfile 수정 (#87) (#87) |
| 2026-11-24 11:58 | dev | web·web-nginx | `sha-9c09a99` | web·web-nginx #8 | #86 | fix(deploy): web.yaml imagePullSecrets 들여쓰기 수정 (#85) |
| 2026-11-24 11:28 | dev | web·web-nginx | `sha-e89b622` | web·web-nginx #6 | #83 | fix(deploy): web·web-nginx 이미지 이름을 GHCR 경로로 수정, ghcr-pull 추가 (#82) (#82) |
| 2026-11-24 10:42 | dev | web·web-nginx | `sha-a2703fe` | web·web-nginx #2 | #80 | feat: web의 package-lock 수정 (#79) (#79) |
| 2026-11-24 09:42 | dev | simulator | `sha-6b7e8ec` | simulator #4 | #77 | deploy(dev): simulator sha-3e8cb97 (#75) |
| 2026-11-23 14:43 | dev | simulator | `sha-3e8cb97` | simulator #2 | #75 | feat: simulator을 최종 소스로 교체 (#76) (#74) |
| 2026-11-22 20:56 | dev | telemetry | `sha-907bedb` | telemetry #2 | #72 | feat: telemetry을 최종 소스로 교체 (#70) (#71) |
| 2026-11-20 15:42 | dev | auth | `sha-2c300d1` | auth #25 | #68 | feat: auth를 최종 소스로 교체 (#66) (#67) |
| 2026-11-20 12:25 | dev | device | `sha-8969fb0` | device #2 | #65 | feat: device을 최종 소스로 교체 (#42) (#64) |
| 2026-11-20 10:25 | dev | control | `sha-ae4a119` | control #22 | #62 | fix: 동시 빌드 시 GHCR 로그인 충돌 해결 (control, sample) (#59) (#60) |
| 2026-11-20 10:25 | dev | sample | `sha-ae4a119` | sample #31 | #61 | fix: 동시 빌드 시 GHCR 로그인 충돌 해결 (control, sample) (#59) (#60) |
| 2026-11-20 10:15 | dev | control | `sha-ac0a867` | control #20 | #58 | feat: dev 배포 PR 자동 머지 (control, sample) (#56) (#57) |
| 2026-11-20 09:45 | prod | control | `sha-c3b55f7` | control #17 | #55 | feat: control 최종 소스 교체 + dev 인프라(MQTT, DB) 연결 (#52) (#53) |
| 2026-11-19 17:36 | dev | control | `sha-c3b55f7` | control #17 | #54 | feat: control 최종 소스 교체 + dev 인프라(MQTT, DB) 연결 (#52) (#53) |
| 2026-11-19 15:48 | dev | sample | `sha-c221ec6` | sample #24 | #51 | feat: 젠킨스 빌드 결과 디스코드 알림 (control, sample) (#48) (#49) |
| 2026-11-19 15:48 | dev | control | `sha-c221ec6` | control #15 | #50 | feat: 젠킨스 빌드 결과 디스코드 알림 (control, sample) (#48) (#49) |
| 2026-11-18 15:30 | dev | control | `sha-54a8a43` | control #13 | #47 | feat: control 엘리베이터 호출 API 받기 + 입력 검사 (#45) (#46) |
| 2026-11-18 14:39 | dev | control | `sha-7e14474` | control #11 | #44 | chore: control Dockerfile 멀티스테이지로 변경 (264MB → 210MB) (#43) |
| 2026-11-18 09:38 | dev | sample | `sha-4ada646` | sample #16 | #40 | chore: sample 주소를 /api/v1/sample로 변경 + 가이드 주소 안내 수정 (#39) |
| 2026-11-17 11:19 | dev | control | `sha-9d5a6c1` | control #6 | #37 | feat: control 명령 API 받기 + 입력 검사 (#35) (#36) |
| 2026-11-12 17:05 | dev | auth | `sha-db7d4b6` | auth #1 | #33 | feat: auth 서비스 뼈대 추가 (#31) (#32) |
| 2026-11-12 12:09 | dev | control | `sha-2d613f4` | control #1 | #30 | feat: control 서비스 뼈대 추가 (#28) (#29) |
| 2026-11-10 16:58 | dev | sample | `sha-ddee513` | sample #1 | #22 | ci: sample Jenkinsfile 추가 (#20) (#21) |
| 2026-11-09 14:47 | dev | sample | `sha-737d341` | - | #17 | ci: PR 자동 생성 막히면 링크 남기기 + 확인용 v3 (#9) (#16) |
| 2026-11-09 14:28 | dev | sample | `sha-86511bd` | - | #14 | ci: dev 배포를 자동 PR 방식으로 변경 (#9) (#13) |
