import { PollingWorker } from './pollingWorker';
import { Logger } from '../common/logger';

const worker = new PollingWorker(30);

worker.start().catch((err) => {
  Logger.error('Erro fatal no worker de polling:', err);
  process.exit(1);
});

process.on('SIGINT', () => {
  worker.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  worker.stop();
  process.exit(0);
});
