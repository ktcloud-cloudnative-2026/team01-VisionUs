import { readFileSync } from 'node:fs';

/**
 * - 컨테이너 배포: output 'standalone' (node server.js 로 실행)
 * - 로컬 개발(npm run dev): API_PROXY_DEV=1 이면 /api/v1/*, /simulator 를 개발용 게이트웨이(:8080)로 전달
 *   JWT 검증과 서비스별 라우팅은 게이트웨이가 한다 (클러스터에서는 Envoy Gateway)
 */
const GATEWAY = process.env.GATEWAY_URL || 'http://localhost:8080';

/**
 * 개발 서버(next dev)에 접속을 허용할 호스트 = 저장소 루트 .env 의 DEV_HOSTS (예: 10.10.31.20,t1-base)
 * 환경 변수 DEV_HOSTS 가 있으면 그 값을 먼저 쓴다. 운영 빌드(standalone)에는 영향 없음.
 */
function devHosts() {
  let raw = process.env.DEV_HOSTS;
  if (!raw) {
    try {
      const line = readFileSync(new URL('../.env', import.meta.url), 'utf8')
        .split('\n').find((l) => /^\s*DEV_HOSTS\s*=/.test(l));
      raw = line?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
    } catch { /* .env 없음 */ }
  }
  const hosts = (raw || '').split(',').map((h) => h.trim()).filter(Boolean);
  return [...new Set(['localhost', '127.0.0.1', ...hosts])];
}

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  allowedDevOrigins: devHosts(),
  async rewrites() {
    if (process.env.API_PROXY_DEV !== '1') return [];
    return [
      { source: '/api/v1/:path*', destination: `${GATEWAY}/api/v1/:path*` },
      { source: '/simulator', destination: `${GATEWAY}/simulator/` },
      { source: '/simulator/:path*', destination: `${GATEWAY}/simulator/:path*` },
    ];
  },
};

export default nextConfig;
