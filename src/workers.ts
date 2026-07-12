import { Worker, Job } from 'bullmq';
import axios from 'axios';
import { stripHtml } from './functions';
import { turboSmtpHeaders, smsPortalRequestHeaders } from './config';
import {
  REDIS_HOST,
  REDIS_PORT,
  REDIS_PASS,
  VERIFIED_EMAIL,
  SERVICE_URLS,
  queue as queueNames,
} from './globals';
import logger from './logger';

const connection = {
  host: REDIS_HOST,
  port: parseInt(REDIS_PORT, 10),
  ...(REDIS_PASS ? { password: REDIS_PASS } : {}),
};

// ---------------------------------------------------------------------------
// Shared worker options — tuned for production resilience
// ---------------------------------------------------------------------------

const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '5', 10);
const WORKER_QUEUES = process.env.WORKER_QUEUES
  ? new Set(process.env.WORKER_QUEUES.split(',').map((s) => s.trim()))
  : null;

const workerDefaults = {
  connection,
  concurrency: WORKER_CONCURRENCY,
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000 },
  removeOnComplete: { age: 3600 },   // keep 1h for debugging
  removeOnFail: { age: 86400 },       // keep 24h for inspection
  maxStalledCount: 2,                  // retry stalled jobs twice
};

// ---------------------------------------------------------------------------
// Circuit breaker — minimal inline implementation for worker HTTP calls
// ---------------------------------------------------------------------------

interface Breaker {
  failures: number;
  lastFailure: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

function createBreaker(name: string, threshold = 3, resetMs = 30000) {
  const breaker: Breaker = { failures: 0, lastFailure: 0, state: 'CLOSED' };

  return {
    async exec<T>(fn: () => Promise<T>): Promise<T> {
      if (breaker.state === 'OPEN') {
        if (Date.now() - breaker.lastFailure > resetMs) {
          breaker.state = 'HALF_OPEN';
        } else {
          throw new Error(`Circuit breaker [${name}] is OPEN`);
        }
      }

      try {
        const result = await fn();
        breaker.failures = 0;
        breaker.state = 'CLOSED';
        return result;
      } catch (err) {
        breaker.failures++;
        breaker.lastFailure = Date.now();
        if (breaker.failures >= threshold) {
          breaker.state = 'OPEN';
          logger.error({ circuit: name, failures: breaker.failures }, 'Circuit breaker OPEN');
        }
        throw err;
      }
    },
  };
}

const expiryBreaker = createBreaker('track-expiry');
const penaltyBreaker = createBreaker('track-penalty');

// ---------------------------------------------------------------------------
// Worker definitions
// ---------------------------------------------------------------------------

const activeWorkers: Worker[] = [];

function shouldRun(queueName: string): boolean {
  return !WORKER_QUEUES || WORKER_QUEUES.has(queueName);
}

// ---------------------------------------------------------------------------
// Email worker
// ---------------------------------------------------------------------------

export let emailWorker: Worker | null = null;

if (shouldRun(queueNames.emailQueue)) {
  emailWorker = new Worker(
    queueNames.emailQueue,
    async (job: Job) => {
      const { email, subject, message } = job.data as {
        email: string;
        subject: string;
        message: string;
      };

      await axios.post(
        'https://api.turbo-smtp.com/api/v2/mail/send',
        {
          from: VERIFIED_EMAIL,
          to: email,
          subject,
          content: stripHtml(message),
          html_content: message,
        },
        turboSmtpHeaders,
      );

      logger.info({ email }, 'Email sent');
    },
    workerDefaults,
  );

  emailWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, attempt: job?.attemptsMade, max: workerDefaults.attempts, err: err.message }, 'Email job failed');
  });

  activeWorkers.push(emailWorker);
}

// ---------------------------------------------------------------------------
// SMS worker
// ---------------------------------------------------------------------------

export let smsWorker: Worker | null = null;

if (shouldRun(queueNames.smsQueue)) {
  smsWorker = new Worker(
    queueNames.smsQueue,
    async (job: Job) => {
      const { phone, message } = job.data as { phone: string; subject: string; message: string };

      await axios.post(
        `${SERVICE_URLS.smsPortalBaseUrl}/bulkmessages`,
        {
          Messages: [{ Destination: phone.replace(/\s/g, ''), Content: message }],
        },
        smsPortalRequestHeaders,
      );

      logger.info({ phone }, 'SMS sent');
    },
    workerDefaults,
  );

  smsWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, attempt: job?.attemptsMade, max: workerDefaults.attempts, err: err.message }, 'SMS job failed');
  });

  activeWorkers.push(smsWorker);
}

// ---------------------------------------------------------------------------
// Track process output document expiry worker
// ---------------------------------------------------------------------------

export let trackProcessOutputDocumentExpiryWorker: Worker | null = null;

if (shouldRun(queueNames.trackProcessOutputDocumentExpiryQueue)) {
  trackProcessOutputDocumentExpiryWorker = new Worker(
    queueNames.trackProcessOutputDocumentExpiryQueue,
    async (job: Job) => {
      const { id } = job.data as { id: string };

      await expiryBreaker.exec(() =>
        axios.post(SERVICE_URLS.trackProcessOutputDocumentExpiryUrl, { id }),
      );

      logger.info({ documentId: id }, 'Processed document expiry');
    },
    workerDefaults,
  );

  trackProcessOutputDocumentExpiryWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, attempt: job?.attemptsMade, max: workerDefaults.attempts, err: err.message }, 'Track expiry job failed');
  });

  activeWorkers.push(trackProcessOutputDocumentExpiryWorker);
}

// ---------------------------------------------------------------------------
// Track process output document for penalty fees worker
// ---------------------------------------------------------------------------

export let trackProcessOutputDocumentForPenaltyFeesWorker: Worker | null = null;

if (shouldRun(queueNames.trackProcessOutputDocumentForPenaltyFeesQueue)) {
  trackProcessOutputDocumentForPenaltyFeesWorker = new Worker(
    queueNames.trackProcessOutputDocumentForPenaltyFeesQueue,
    async (job: Job) => {
      const { id } = job.data as { id: string };

      await penaltyBreaker.exec(() =>
        axios.post(SERVICE_URLS.trackProcessOutputDocumentForPenaltyFeesUrl, { id }),
      );

      logger.info({ documentId: id }, 'Processed document penalty fees');
    },
    workerDefaults,
  );

  trackProcessOutputDocumentForPenaltyFeesWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, attempt: job?.attemptsMade, max: workerDefaults.attempts, err: err.message }, 'Track penalty job failed');
  });

  activeWorkers.push(trackProcessOutputDocumentForPenaltyFeesWorker);
}

// ---------------------------------------------------------------------------
// Graceful close
// ---------------------------------------------------------------------------

export async function closeAllWorkers(): Promise<void> {
  await Promise.all(activeWorkers.map((w) => w.close()));
}
