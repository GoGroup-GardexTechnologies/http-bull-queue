import dotenv from 'dotenv';
import { join } from 'path';
dotenv.config({ path: join(__dirname, 'development.env') });

import { createServer } from 'http';
import app from './app';
import { redisConnection } from './config';
import { closeAllWorkers } from './workers';
import './workers'; // initialise workers on startup

const PORT = process.env.PORT || 6768;
const server = createServer(app);

server.listen(PORT, () => {
  console.log(`Queue service running on port ${PORT}`);
});

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}, shutting down gracefully...`);

  const forceExit = setTimeout(() => {
    console.error('Could not close in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
  forceExit.unref();

  try {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    console.log('HTTP server closed');

    await closeAllWorkers();
    console.log('Workers closed');

    await redisConnection.quit();
    console.log('Redis connection closed');

    console.log('Shutdown complete');
    process.exit(0);
  } catch (error: any) {
    console.error('Error during shutdown:', error.message);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
