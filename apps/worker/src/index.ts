import { prisma } from '../../../packages/db/src/client.js';
import { startCronLoops } from './cron.js';
import { closeRabbit, startConsumers } from './rabbit.js';

await startConsumers();
startCronLoops();
console.log('TrackFlow worker started');

process.on('SIGTERM', async () => {
  await closeRabbit();
  await prisma.$disconnect();
  process.exit(0);
});
