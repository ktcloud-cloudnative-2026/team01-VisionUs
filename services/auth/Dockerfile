# 1단계 (주방): 패키지 설치. npm은 여기서만 씁니다
FROM node:24-alpine3.24 AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY common ./common
RUN npm ci --omit=dev
COPY src ./src

# 2단계 (도시락): 깨끗한 alpine에 node 실행 파일과 결과물만 담습니다
FROM alpine:3.24
RUN apk add --no-cache libstdc++ \
 && addgroup -g 1000 node \
 && adduser -u 1000 -G node -s /bin/sh -D node
COPY --from=build /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY --from=build /app ./
ENV NODE_ENV=production PORT=3000
USER node
EXPOSE 3000
CMD ["node", "src/index.js"]
