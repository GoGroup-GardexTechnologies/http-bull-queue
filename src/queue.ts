import { Queue } from 'bullmq';
import { REDIS_HOST, REDIS_PORT, REDIS_PASS, queue as queueNames } from './globals';

const connection = {
  host: REDIS_HOST,
  port: parseInt(REDIS_PORT, 10),
  ...(REDIS_PASS ? { password: REDIS_PASS } : {}),
};

export const emailQueue = new Queue(queueNames.emailQueue, { connection });

export const smsQueue = new Queue(queueNames.smsQueue, { connection });

export const trackProcessOutputDocumentExpiryQueue = new Queue(
  queueNames.trackProcessOutputDocumentExpiryQueue,
  { connection },
);

export const trackProcessOutputDocumentForPenaltyFeesQueue = new Queue(
  queueNames.trackProcessOutputDocumentForPenaltyFeesQueue,
  { connection },
);
