# IVDMS HTTP Bull Queue

An HTTP-fronted [BullMQ](https://docs.bullmq.io/) service that decouples the IVDMS backend from its external notification and background-job dependencies. The backend posts job payloads over HTTP; this service enqueues them and worker processes handle delivery asynchronously.

## How it works

```
IVDMS Backend  ──POST /emailQueue/add-job──────────────────────► BullMQ Worker ──► SendGrid
               ──POST /smsQueue/add-job────────────────────────► BullMQ Worker ──► SMS Portal
               ──POST /trackProcessOutputDocumentExpiryQueue/add-job ──────────► BullMQ Worker ──► Firebase
               ──POST /trackProcessOutputDocumentForPenaltyFeesQueue/add-job ──► BullMQ Worker ──► Firebase
```

All enqueue endpoints require the `x-queue-secret` header. Management endpoints require `x-admin-secret`. The `/health` endpoint is open for readiness/liveness probes.

## Queues

| Queue | Description |
|-------|-------------|
| `emailQueue` | Sends transactional emails via SendGrid |
| `smsQueue` | Sends SMS messages via SMS Portal |
| `trackProcessOutputDocumentExpiryQueue` | Notifies Firebase to track document expiry |
| `trackProcessOutputDocumentForPenaltyFeesQueue` | Notifies Firebase to track documents for penalty fees |

## HTTP Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | None | Health check |
| `POST` | `/emailQueue/add-job` | `x-queue-secret` | Enqueue an email job |
| `POST` | `/smsQueue/add-job` | `x-queue-secret` | Enqueue an SMS job |
| `POST` | `/trackProcessOutputDocumentExpiryQueue/add-job` | `x-queue-secret` | Enqueue a document expiry tracking job |
| `POST` | `/trackProcessOutputDocumentForPenaltyFeesQueue/add-job` | `x-queue-secret` | Enqueue a penalty fees tracking job |
| `GET` | `/queue-status` | `x-admin-secret` | View waiting/active/completed/failed/delayed counts for all queues |
| `GET` | `/worker-status` | `x-admin-secret` | View active worker list for all queues |
| `POST` | `/force-process/:queueName` | `x-admin-secret` | Trigger immediate processing for a named queue |

### Payload schemas

**`/emailQueue/add-job`**
```json
{ "email": "user@example.com", "subject": "string", "message": "HTML or plain text" }
```

**`/smsQueue/add-job`**
```json
{ "phone": "+267 71234567", "subject": "string", "message": "string" }
```
Phone must be in `+{countryCode} {number}` format using a recognised country code.

**`/trackProcessOutputDocumentExpiryQueue/add-job`** and **`/trackProcessOutputDocumentForPenaltyFeesQueue/add-job`**
```json
{ "id": "507f1f77bcf86cd799439011" }
```
`id` must be a valid 24-character hex MongoDB ObjectId.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `QUEUE_SECRET` | Yes | Shared secret the IVDMS backend sends as `x-queue-secret` |
| `ADMIN_SECRET` | Yes | Secret for management endpoints (`x-admin-secret`) |
| `REDIS_HOST` | Yes | Redis hostname |
| `REDIS_PORT` | Yes | Redis port |
| `REDIS_PASS` | No | Redis password (omit for no-auth) |
| `SEND_GRID_API_KEY` | Yes | SendGrid API key for email delivery |
| `SMS_PORTAL_CLIENT_ID` | Yes | SMS Portal client ID |
| `SMS_PORTAL_API_KEY` | Yes | SMS Portal API key |
| `SMS_PORTAL_BASE_URL` | No | SMS Portal base URL (default: `https://rest.smsportal.com/v1`) |
| `VERIFIED_EMAIL` | No | From address for outgoing emails (default: `noreply@ivdms.website`) |
| `FIREBASE_CLOUD_FUNCTION_URL` | No | Firebase Cloud Function URL for document tracking |
| `PORT` | No | HTTP port (default: `6768`) |

## Development

```bash
npm install
```

Copy `src/development.env` and fill in your values, then:

```bash
npm run start:dev
```

### Run tests

```bash
npm test
```

Tests use `jest` + `ts-jest` + `supertest` and mock Redis/BullMQ/SendGrid, so no external services are required.

## curl examples

```bash
# Health check
curl http://localhost:6768/health

# Enqueue an email
curl -X POST http://localhost:6768/emailQueue/add-job \
  -H "Content-Type: application/json" \
  -H "x-queue-secret: your-queue-secret" \
  -d '{"email":"user@example.com","subject":"Hello","message":"<p>World</p>"}'

# Enqueue an SMS
curl -X POST http://localhost:6768/smsQueue/add-job \
  -H "Content-Type: application/json" \
  -H "x-queue-secret: your-queue-secret" \
  -d '{"phone":"+267 71234567","subject":"Hello","message":"Your application has been approved."}'

# Queue status (ops)
curl http://localhost:6768/queue-status \
  -H "x-admin-secret: your-admin-secret"

# Force process a queue
curl -X POST http://localhost:6768/force-process/email \
  -H "x-admin-secret: your-admin-secret"
```

Valid queue names for `/force-process/:queueName`: `email`, `sms`, `trackExpiry`, `trackPenalty`.

## Docker

### Build

```bash
docker build -t gardextechnologies/ivdms-http-bull-queue:latest .
```

### Push to Docker Hub

```bash
docker login
docker push gardextechnologies/ivdms-http-bull-queue:latest
```

### Run

```bash
docker run -d \
  --name ivdms-http-bull-queue \
  -p ${PORT:-6768}:${PORT:-6768} \
  -e QUEUE_SECRET=your-queue-secret \
  -e ADMIN_SECRET=your-admin-secret \
  -e REDIS_HOST=your-redis-host \
  -e REDIS_PORT=6379 \
  -e REDIS_PASS=your-redis-password \
  -e SEND_GRID_API_KEY=your-sendgrid-key \
  -e SMS_PORTAL_CLIENT_ID=your-sms-client-id \
  -e SMS_PORTAL_API_KEY=your-sms-api-key \
  -e VERIFIED_EMAIL=noreply@example.com \
  -e FIREBASE_CLOUD_FUNCTION_URL=https://your-function-url \
  gardextechnologies/ivdms-http-bull-queue:latest
```

### Docker Compose example

```yaml
services:
  http-bull-queue:
    image: gardextechnologies/ivdms-http-bull-queue:latest
    ports:
      - "${PORT:-6768}:${PORT:-6768}"
    environment:
      QUEUE_SECRET: ${QUEUE_SECRET}
      ADMIN_SECRET: ${ADMIN_SECRET}
      REDIS_HOST: ${REDIS_HOST}
      REDIS_PORT: ${REDIS_PORT}
      REDIS_PASS: ${REDIS_PASS}
      SEND_GRID_API_KEY: ${SEND_GRID_API_KEY}
      SMS_PORTAL_CLIENT_ID: ${SMS_PORTAL_CLIENT_ID}
      SMS_PORTAL_API_KEY: ${SMS_PORTAL_API_KEY}
      VERIFIED_EMAIL: ${VERIFIED_EMAIL}
      FIREBASE_CLOUD_FUNCTION_URL: ${FIREBASE_CLOUD_FUNCTION_URL}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:6768/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

## Project structure

```
src/
  __tests__/
    setup.ts                  # Jest env var bootstrap
    functions.test.ts         # stripHtml, mongoIdValidation, phoneValidation
    routes.test.ts            # Full route tests (auth, validation, enqueue)
  config/
    index.ts                  # Redis + SendGrid + SMS Portal client setup
  app.ts                      # Express app (imported by tests and server)
  server.ts                   # HTTP server bootstrap + graceful shutdown
  globals.ts                  # Env var validation and exports
  queue.ts                    # BullMQ queue definitions
  workers.ts                  # BullMQ worker definitions
  functions.ts                # Shared helpers (validation, HTML stripping)
  development.env             # Local development environment variables
```
