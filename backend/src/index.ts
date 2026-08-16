import app from './app';
import { config } from './config/env';
import { Logger } from './common/logger';

const server = app.listen(config.port, () => {
  Logger.info(`🚀 Servidor Backend DeliveryVip rodando na porta ${config.port} em modo ${config.nodeEnv}`);
});

process.on('unhandledRejection', (reason: any) => {
  Logger.error('Unhandled Rejection at Promise:', reason);
});

process.on('uncaughtException', (error: Error) => {
  Logger.error('Uncaught Exception thrown:', error);
});
