// Mock heavy dependencies before any imports
jest.mock('../config', () => ({
  redisConnection: { status: 'ready', quit: jest.fn() },
  turboSmtpHeaders: { headers: {} },
  smsPortalRequestHeaders: { headers: {} },
}));

jest.mock('../queue', () => ({
  emailQueue: {
    add: jest.fn(),
    getWaiting: jest.fn().mockResolvedValue([]),
    getActive: jest.fn().mockResolvedValue([]),
    getCompleted: jest.fn().mockResolvedValue([]),
    getFailed: jest.fn().mockResolvedValue([]),
    getDelayed: jest.fn().mockResolvedValue([]),
    getWorkers: jest.fn().mockResolvedValue([]),
  },
  smsQueue: {
    add: jest.fn(),
    getWaiting: jest.fn().mockResolvedValue([]),
    getActive: jest.fn().mockResolvedValue([]),
    getCompleted: jest.fn().mockResolvedValue([]),
    getFailed: jest.fn().mockResolvedValue([]),
    getDelayed: jest.fn().mockResolvedValue([]),
    getWorkers: jest.fn().mockResolvedValue([]),
  },
  trackProcessOutputDocumentExpiryQueue: {
    add: jest.fn(),
    getWaiting: jest.fn().mockResolvedValue([]),
    getActive: jest.fn().mockResolvedValue([]),
    getCompleted: jest.fn().mockResolvedValue([]),
    getFailed: jest.fn().mockResolvedValue([]),
    getDelayed: jest.fn().mockResolvedValue([]),
    getWorkers: jest.fn().mockResolvedValue([]),
  },
  trackProcessOutputDocumentForPenaltyFeesQueue: {
    add: jest.fn(),
    getWaiting: jest.fn().mockResolvedValue([]),
    getActive: jest.fn().mockResolvedValue([]),
    getCompleted: jest.fn().mockResolvedValue([]),
    getFailed: jest.fn().mockResolvedValue([]),
    getDelayed: jest.fn().mockResolvedValue([]),
    getWorkers: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../workers', () => ({ closeAllWorkers: jest.fn() }));

import request from 'supertest';
import app from '../app';
import { emailQueue, smsQueue, trackProcessOutputDocumentExpiryQueue, trackProcessOutputDocumentForPenaltyFeesQueue } from '../queue';

const QUEUE_SECRET = 'test-queue-secret';
const ADMIN_SECRET = 'test-admin-secret';
const MONGO_ID = '507f1f77bcf86cd799439011';

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

describe('GET /health', () => {
  it('returns 200 and is accessible without auth', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });
});

// ---------------------------------------------------------------------------
// Auth on enqueue endpoints
// ---------------------------------------------------------------------------

describe('POST enqueue endpoints — auth', () => {
  const endpoints = [
    '/emailQueue/add-job',
    '/smsQueue/add-job',
    '/trackProcessOutputDocumentExpiryQueue/add-job',
    '/trackProcessOutputDocumentForPenaltyFeesQueue/add-job',
  ];

  for (const endpoint of endpoints) {
    it(`${endpoint} returns 401 without x-queue-secret`, async () => {
      const res = await request(app).post(endpoint).send({});
      expect(res.status).toBe(401);
    });

    it(`${endpoint} returns 401 with wrong x-queue-secret`, async () => {
      const res = await request(app).post(endpoint).set('x-queue-secret', 'wrong').send({});
      expect(res.status).toBe(401);
    });
  }
});

// ---------------------------------------------------------------------------
// POST /emailQueue/add-job
// ---------------------------------------------------------------------------

describe('POST /emailQueue/add-job', () => {
  const PATH = '/emailQueue/add-job';
  const VALID = { email: 'user@example.com', subject: 'Hello', message: 'World' };

  it('returns 400 when email is missing', async () => {
    const { email, ...body } = VALID;
    const res = await request(app).post(PATH).set('x-queue-secret', QUEUE_SECRET).send(body);
    expect(res.status).toBe(400);
  });

  it('returns 400 when email is invalid', async () => {
    const res = await request(app).post(PATH).set('x-queue-secret', QUEUE_SECRET).send({ ...VALID, email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when subject is missing', async () => {
    const { subject, ...body } = VALID;
    const res = await request(app).post(PATH).set('x-queue-secret', QUEUE_SECRET).send(body);
    expect(res.status).toBe(400);
  });

  it('returns 400 when message is missing', async () => {
    const { message, ...body } = VALID;
    const res = await request(app).post(PATH).set('x-queue-secret', QUEUE_SECRET).send(body);
    expect(res.status).toBe(400);
  });

  it('returns 201 and jobId on valid payload', async () => {
    (emailQueue.add as jest.Mock).mockResolvedValueOnce({ id: 'job-1' });
    const res = await request(app).post(PATH).set('x-queue-secret', QUEUE_SECRET).send(VALID);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('jobId', 'job-1');
  });
});

// ---------------------------------------------------------------------------
// POST /smsQueue/add-job
// ---------------------------------------------------------------------------

describe('POST /smsQueue/add-job', () => {
  const PATH = '/smsQueue/add-job';
  const VALID = { phone: '+267 71234567', subject: 'Test', message: 'Hello' };

  it('returns 400 when phone is missing', async () => {
    const { phone, ...body } = VALID;
    const res = await request(app).post(PATH).set('x-queue-secret', QUEUE_SECRET).send(body);
    expect(res.status).toBe(400);
  });

  it('returns 400 when phone has an invalid country code', async () => {
    const res = await request(app).post(PATH).set('x-queue-secret', QUEUE_SECRET).send({ ...VALID, phone: '+999 71234567' });
    expect(res.status).toBe(400);
  });

  it('returns 201 and jobId on valid payload', async () => {
    (smsQueue.add as jest.Mock).mockResolvedValueOnce({ id: 'job-2' });
    const res = await request(app).post(PATH).set('x-queue-secret', QUEUE_SECRET).send(VALID);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('jobId', 'job-2');
  });
});

// ---------------------------------------------------------------------------
// POST /trackProcessOutputDocumentExpiryQueue/add-job
// ---------------------------------------------------------------------------

describe('POST /trackProcessOutputDocumentExpiryQueue/add-job', () => {
  const PATH = '/trackProcessOutputDocumentExpiryQueue/add-job';

  it('returns 400 when id is missing', async () => {
    const res = await request(app).post(PATH).set('x-queue-secret', QUEUE_SECRET).send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when id is not a valid MongoId', async () => {
    const res = await request(app).post(PATH).set('x-queue-secret', QUEUE_SECRET).send({ id: 'not-a-mongo-id' });
    expect(res.status).toBe(400);
  });

  it('returns 201 and jobId on valid payload', async () => {
    (trackProcessOutputDocumentExpiryQueue.add as jest.Mock).mockResolvedValueOnce({ id: MONGO_ID });
    const res = await request(app).post(PATH).set('x-queue-secret', QUEUE_SECRET).send({ id: MONGO_ID });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('jobId');
  });
});

// ---------------------------------------------------------------------------
// POST /trackProcessOutputDocumentForPenaltyFeesQueue/add-job
// ---------------------------------------------------------------------------

describe('POST /trackProcessOutputDocumentForPenaltyFeesQueue/add-job', () => {
  const PATH = '/trackProcessOutputDocumentForPenaltyFeesQueue/add-job';

  it('returns 400 when id is missing', async () => {
    const res = await request(app).post(PATH).set('x-queue-secret', QUEUE_SECRET).send({});
    expect(res.status).toBe(400);
  });

  it('returns 201 and jobId on valid payload', async () => {
    (trackProcessOutputDocumentForPenaltyFeesQueue.add as jest.Mock).mockResolvedValueOnce({ id: MONGO_ID });
    const res = await request(app).post(PATH).set('x-queue-secret', QUEUE_SECRET).send({ id: MONGO_ID });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('jobId');
  });
});

// ---------------------------------------------------------------------------
// Management endpoints — auth
// ---------------------------------------------------------------------------

describe('Management endpoints — auth', () => {
  const endpoints = [
    { method: 'get', path: '/queue-status' },
    { method: 'get', path: '/worker-status' },
    { method: 'post', path: '/force-process/email' },
  ];

  for (const { method, path } of endpoints) {
    it(`${method.toUpperCase()} ${path} returns 401 without x-admin-secret`, async () => {
      const res = await (request(app) as any)[method](path).send({});
      expect(res.status).toBe(401);
    });

    it(`${method.toUpperCase()} ${path} returns 401 with wrong x-admin-secret`, async () => {
      const res = await (request(app) as any)[method](path).set('x-admin-secret', 'wrong').send({});
      expect(res.status).toBe(401);
    });

    it(`${method.toUpperCase()} ${path} returns 200 with correct x-admin-secret`, async () => {
      const res = await (request(app) as any)[method](path).set('x-admin-secret', ADMIN_SECRET).send({});
      expect(res.status).toBe(200);
    });
  }
});

describe('POST /force-process/:queueName — invalid queue', () => {
  it('returns 400 for an unknown queue name', async () => {
    const res = await request(app)
      .post('/force-process/unknown')
      .set('x-admin-secret', ADMIN_SECRET)
      .send({});
    expect(res.status).toBe(400);
  });
});
