import { createClient } from 'redis';
import {
  REDIS_HOST,
  REDIS_PORT,
  REDIS_PASS,
  TURBO_SMTP_CONSUMER_KEY,
  TURBO_SMTP_CONSUMER_SECRET,
  SMS_PORTAL_CLIENT_ID,
  SMS_PORTAL_API_KEY,
} from '../globals';
import logger from '../logger';

// ---------------------------------------------------------------------------
// Redis
// ---------------------------------------------------------------------------

export const redisConnection = createClient({
  socket: {
    host: REDIS_HOST,
    port: parseInt(REDIS_PORT, 10),
  },
  ...(REDIS_PASS ? { password: REDIS_PASS } : {}),
});

redisConnection.on('error', (err) => {
  logger.error({ err: err.message }, 'Redis connection error');
});

redisConnection.connect().catch((err) => {
  logger.error({ err: err.message }, 'Redis failed to connect');
});

// ---------------------------------------------------------------------------
// TurboSMTP
// ---------------------------------------------------------------------------

export const turboSmtpHeaders = {
  headers: {
    'Content-Type': 'application/json',
    consumerKey: TURBO_SMTP_CONSUMER_KEY,
    consumerSecret: TURBO_SMTP_CONSUMER_SECRET,
  },
};

// ---------------------------------------------------------------------------
// SMS Portal
// ---------------------------------------------------------------------------

export const smsPortalRequestHeaders = {
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Basic ${Buffer.from(`${SMS_PORTAL_CLIENT_ID}:${SMS_PORTAL_API_KEY}`).toString('base64')}`,
  },
};
