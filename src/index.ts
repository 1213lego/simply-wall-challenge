import { config } from './config';
import prisma from './infrastructure/db/prisma-client';
import { createApp } from './app';

const app = createApp(prisma);

app.listen(config.port, () => {
  console.log(`[server] Portfolio API running on port ${config.port} (${config.nodeEnv})`);
});

process.on('SIGTERM', async () => {
  console.log('[server] SIGTERM received, shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[server] SIGINT received, shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});
