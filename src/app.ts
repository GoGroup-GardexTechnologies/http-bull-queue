import crypto from 'crypto';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import * as Joi from 'joi';
import { StatusCodes } from 'http-status-codes';
import client from 'prom-client';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import {
  emailQueue,
  smsQueue,
  trackProcessOutputDocumentExpiryQueue,
  trackProcessOutputDocumentForPenaltyFeesQueue,
} from './queue';
import { mongoIdValidation, phoneValidation } from './functions';
import logger from './logger';

const app = express();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false, // not a browser-facing service
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : false,
  credentials: true,
}));
app.use(express.json());

const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
const enqueueLimiter = rateLimit({ windowMs: 60 * 1000, max: 120 });

app.use(globalLimiter);

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

export function verifyQueueSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.QUEUE_SECRET;
  const provided = req.headers['x-queue-secret'] as string | undefined;

  if (!provided || !secret) {
    res.status(StatusCodes.UNAUTHORIZED).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const a = Buffer.from(provided.padEnd(64));
    const b = Buffer.from(secret.padEnd(64));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b) || provided !== secret) {
      res.status(StatusCodes.UNAUTHORIZED).json({ error: 'Unauthorized' });
      return;
    }
  } catch {
    res.status(StatusCodes.UNAUTHORIZED).json({ error: 'Unauthorized' });
    return;
  }

  next();
}

export function requireAdminSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.ADMIN_SECRET;
  const provided = req.headers['x-admin-secret'] as string | undefined;

  if (!provided || !secret) {
    res.status(StatusCodes.UNAUTHORIZED).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const a = Buffer.from(provided.padEnd(64));
    const b = Buffer.from(secret.padEnd(64));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b) || provided !== secret) {
      res.status(StatusCodes.UNAUTHORIZED).json({ error: 'Unauthorized' });
      return;
    }
  } catch {
    res.status(StatusCodes.UNAUTHORIZED).json({ error: 'Unauthorized' });
    return;
  }

  next();
}

// ---------------------------------------------------------------------------
// Route paths
// ---------------------------------------------------------------------------

export const p = {
  health: '/health',
  emailQueueAdd: '/emailQueue/add-job',
  smsQueueAdd: '/smsQueue/add-job',
  trackExpiryQueueAdd: '/trackProcessOutputDocumentExpiryQueue/add-job',
  trackPenaltyQueueAdd: '/trackProcessOutputDocumentForPenaltyFeesQueue/add-job',
  queueStatus: '/queue-status',
  workerStatus: '/worker-status',
  forceProcess: '/force-process/:queueName',
};

// ---------------------------------------------------------------------------
// Prometheus metrics
// ---------------------------------------------------------------------------

client.collectDefaultMetrics({ prefix: 'queue_' });

const httpRequestDuration = new client.Histogram({
  name: 'queue_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

const httpRequestsTotal = new client.Counter({
  name: 'queue_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path || 'unknown';
    httpRequestDuration.observe(
      { method: req.method, route, status_code: String(res.statusCode) },
      duration,
    );
    httpRequestsTotal.inc(
      { method: req.method, route, status_code: String(res.statusCode) },
    );
  });
  next();
});

app.get('/metrics', async (_req: Request, res: Response) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

// ---------------------------------------------------------------------------
// Bull Board — queue observability dashboard
// ---------------------------------------------------------------------------

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullMQAdapter(emailQueue),
    new BullMQAdapter(smsQueue),
    new BullMQAdapter(trackProcessOutputDocumentExpiryQueue),
    new BullMQAdapter(trackProcessOutputDocumentForPenaltyFeesQueue),
  ],
  serverAdapter,
});

app.use('/admin/queues', requireAdminSecret, serverAdapter.getRouter());

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

app.get(p.health, (_req: Request, res: Response) => {
  res.status(StatusCodes.OK).json({ status: 'healthy' });
});

// ---------------------------------------------------------------------------
// Enqueue endpoints
// ---------------------------------------------------------------------------

const emailSchema = Joi.object({
  email: Joi.string().email().required(),
  subject: Joi.string().required(),
  message: Joi.string().required(),
});

const smsSchema = Joi.object({
  phone: phoneValidation.required(),
  subject: Joi.string().required(),
  message: Joi.string().required(),
});

const mongoIdSchema = Joi.object({
  id: mongoIdValidation.required(),
});

app.post(p.emailQueueAdd, verifyQueueSecret, enqueueLimiter, async (req: Request, res: Response) => {
  const { error, value } = emailSchema.validate(req.body);
  if (error) {
    res.status(StatusCodes.BAD_REQUEST).json({ error: error.message });
    return;
  }

  const job = await emailQueue.add('send-email', value);
  res.status(StatusCodes.CREATED).json({ jobId: job.id });
});

app.post(p.smsQueueAdd, verifyQueueSecret, enqueueLimiter, async (req: Request, res: Response) => {
  const { error, value } = smsSchema.validate(req.body);
  if (error) {
    res.status(StatusCodes.BAD_REQUEST).json({ error: error.message });
    return;
  }

  const job = await smsQueue.add('send-sms', value);
  res.status(StatusCodes.CREATED).json({ jobId: job.id });
});

app.post(
  p.trackExpiryQueueAdd,
  verifyQueueSecret,
  enqueueLimiter,
  async (req: Request, res: Response) => {
    const { error, value } = mongoIdSchema.validate(req.body);
    if (error) {
      res.status(StatusCodes.BAD_REQUEST).json({ error: error.message });
      return;
    }

    const job = await trackProcessOutputDocumentExpiryQueue.add('track-expiry', value);
    res.status(StatusCodes.CREATED).json({ jobId: job.id });
  },
);

app.post(
  p.trackPenaltyQueueAdd,
  verifyQueueSecret,
  enqueueLimiter,
  async (req: Request, res: Response) => {
    const { error, value } = mongoIdSchema.validate(req.body);
    if (error) {
      res.status(StatusCodes.BAD_REQUEST).json({ error: error.message });
      return;
    }

    const job = await trackProcessOutputDocumentForPenaltyFeesQueue.add('track-penalty', value);
    res.status(StatusCodes.CREATED).json({ jobId: job.id });
  },
);

// ---------------------------------------------------------------------------
// Management endpoints
// ---------------------------------------------------------------------------

const QUEUE_MAP: Record<string, typeof emailQueue> = {
  email: emailQueue,
  sms: smsQueue,
  trackExpiry: trackProcessOutputDocumentExpiryQueue,
  trackPenalty: trackProcessOutputDocumentForPenaltyFeesQueue,
};

app.get(p.queueStatus, requireAdminSecret, async (_req: Request, res: Response) => {
  const entries = await Promise.all(
    Object.entries(QUEUE_MAP).map(async ([name, q]) => {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        q.getWaiting(),
        q.getActive(),
        q.getCompleted(),
        q.getFailed(),
        q.getDelayed(),
      ]);
      return {
        name,
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
      };
    }),
  );

  res.status(StatusCodes.OK).json(entries);
});

app.get(p.workerStatus, requireAdminSecret, async (_req: Request, res: Response) => {
  const entries = await Promise.all(
    Object.entries(QUEUE_MAP).map(async ([name, q]) => {
      const workers = await q.getWorkers();
      return { name, workers };
    }),
  );

  res.status(StatusCodes.OK).json(entries);
});

app.post(p.forceProcess, requireAdminSecret, async (req: Request, res: Response) => {
  const { queueName } = req.params;
  const q = QUEUE_MAP[queueName];

  if (!q) {
    res.status(StatusCodes.BAD_REQUEST).json({ error: `Unknown queue: ${queueName}` });
    return;
  }

  const delayed = await q.getDelayed();
  await Promise.all(delayed.map((job) => job.promote()));

  res.status(StatusCodes.OK).json({ promoted: delayed.length });
});

export default app;