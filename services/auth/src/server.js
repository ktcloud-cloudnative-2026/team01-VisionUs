import { app, log, SERVICE } from './app.js';

const PORT = Number(process.env.PORT || 3000);
const server = app.listen(PORT, () => log('info', 'started', { port: PORT }));

// 쿠버네티스가 파드를 끌 때 하던 요청은 마무리하고 끄기
process.on('SIGTERM', () => {
  log('info', 'shutting down', { service: SERVICE });
  server.close(() => process.exit(0));
});
