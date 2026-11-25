# monitoring

모니터링 스택(Prometheus · Loki · Alloy · Grafana) 관련 파일을 모두 이 폴더에 둡니다.

설치 · 확인 · 문제 해결: [모니터링 설치 가이드](../../docs/monitoring-guide.md)

```
monitoring-dev.yaml            dev 클러스터용 Argo CD 앱 (차트 3개 + 버전) — cp 노드에서 처음 한 번 kubectl apply
monitoring-prod.yaml           prod 클러스터용 (이름만 다름)
values/
  kube-prometheus-stack.yaml   Prometheus · Grafana · 우리 서비스 수집 목록
  loki.yaml                    Loki (로그 저장)
  alloy.yaml                   Alloy (로그 수집)
```

- `values/` 를 고쳐서 merge하면 Argo CD가 자동 반영합니다
- `monitoring-*.yaml` (차트 버전 등)을 고치면 merge 후 cp 노드에서 `kubectl apply -f` 를 다시 해야 반영됩니다
- 비밀번호는 여기에 쓰지 않습니다 (Secret `grafana-admin`, 가이드 4단계)
