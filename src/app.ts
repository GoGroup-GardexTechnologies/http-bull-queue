import crypto from 'crypto';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import * as Joi from 'joi';
import { StatusCodes } from 'http-status-codes';
import {
  emailQueue,
  smsQueue,
  trackProcessOutputDocumentExpiryQueue,
  trackProcessOutputDocumentForPenaltyFeesQueue,
} from './queue';
import { mongoIdValidation, phoneValidation } from './functions';

const app = express();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(cors());
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
