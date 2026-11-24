# 클러스터용 Nginx (Envoy Gateway → nginx → Next.js)
FROM nginx:1.30.7-alpine

# Alpine OS 패키지를 사용 가능한 최신 보안 패치로 업데이트
RUN apk upgrade --no-cache \
    && rm -f /etc/nginx/conf.d/default.conf \
    && mkdir -p /var/cache/nginx/next

COPY web.conf /etc/nginx/conf.d/web.conf

EXPOSE 8080