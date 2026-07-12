import dotenv from 'dotenv';
import { join } from 'path';
dotenv.config({ path: join(__dirname, 'development.env') });

import { createServer } from 'http';
import app from './app';
import { redisConnection } from './config';
import { closeAllWorkers } from './workers';
import './workers'; // initialise workers on startup
import logger from './logger';

const PORT = process.env.PORT || 6768;
const server = createServer(app);

server.listen(PORT, () => {
  logger.info({ port: PORT }, 'Queue service started');
});

async function gracefulShutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down gracefully');

  const forceExit = setTimeout(() => {
    logger.error('Could not close in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
  forceExit.unref();

  try {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    logger.info('HTTP server closed');

    await closeAllWorkers();
    logger.info('Workers closed');

    await redisConnection.quit();
    logger.info('Redis connection closed');

    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error: any) {
    logger.error({ err: error }, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
