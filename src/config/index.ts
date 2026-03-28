import { createClient } from 'redis';
import sgMail from '@sendgrid/mail';
import {
  REDIS_HOST,
  REDIS_PORT,
  REDIS_PASS,
  SEND_GRID_API_KEY,
  SMS_PORTAL_CLIENT_ID,
  SMS_PORTAL_API_KEY,
} from '../globals';

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
  console.error('[Redis] Connection error:', err.message);
});

redisConnection.connect().catch((err) => {
  console.error('[Redis] Failed to connect:', err.message);
});

// ---------------------------------------------------------------------------
// SendGrid
// ---------------------------------------------------------------------------

sgMail.setApiKey(SEND_GRID_API_KEY);
export const sendgridClient = sgMail;

// ---------------------------------------------------------------------------
// SMS Portal
// ---------------------------------------------------------------------------

export const smsPortalRequestHeaders = {
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Basic ${Buffer.from(`${SMS_PORTAL_CLIENT_ID}:${SMS_PORTAL_API_KEY}`).toString('base64')}`,
  },
};
