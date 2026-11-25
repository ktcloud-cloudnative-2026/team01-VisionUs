# deploy

Kubernetes 매니페스트와 Argo CD 설정. 클러스터 · GitOps 담당이 구조를 정합니다.

```
deploy/
  base/              서비스별 Deployment · Service
  overlays/dev/
  overlays/prod/
  argocd/            Application
  monitoring/        모니터링 Argo CD 앱 + helm values (Prometheus · Loki · Alloy · Grafana)
```
