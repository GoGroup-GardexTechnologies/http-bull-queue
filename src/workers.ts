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

const connection = {
  host: REDIS_HOST,
  port: parseInt(REDIS_PORT, 10),
  ...(REDIS_PASS ? { password: REDIS_PASS } : {}),
};

// ---------------------------------------------------------------------------
// Email worker
// ---------------------------------------------------------------------------

export let emailWorker: Worker;

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

    console.log(`[emailWorker] Sent email to ${email}`);
  },
  { connection },
);

emailWorker.on('failed', (job, err) => {
  console.error(`[emailWorker] Job ${job?.id} failed:`, err.message);
});

// ---------------------------------------------------------------------------
// SMS worker
// ---------------------------------------------------------------------------

export let smsWorker: Worker;

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

    console.log(`[smsWorker] Sent SMS to ${phone}`);
  },
  { connection },
);

smsWorker.on('failed', (job, err) => {
  console.error(`[smsWorker] Job ${job?.id} failed:`, err.message);
});

// ---------------------------------------------------------------------------
// Track process output document expiry worker
// ---------------------------------------------------------------------------

export let trackProcessOutputDocumentExpiryWorker: Worker;

trackProcessOutputDocumentExpiryWorker = new Worker(
  queueNames.trackProcessOutputDocumentExpiryQueue,
  async (job: Job) => {
    const { id } = job.data as { id: string };

    await axios.post(SERVICE_URLS.trackProcessOutputDocumentExpiryUrl, { id });

    console.log(`[trackProcessOutputDocumentExpiryWorker] Processed document ${id}`);
  },
  { connection },
);

trackProcessOutputDocumentExpiryWorker.on('failed', (job, err) => {
  console.error(`[trackProcessOutputDocumentExpiryWorker] Job ${job?.id} failed:`, err.message);
});

// ---------------------------------------------------------------------------
// Track process output document for penalty fees worker
// ---------------------------------------------------------------------------

export let trackProcessOutputDocumentForPenaltyFeesWorker: Worker;

trackProcessOutputDocumentForPenaltyFeesWorker = new Worker(
  queueNames.trackProcessOutputDocumentForPenaltyFeesQueue,
  async (job: Job) => {
    const { id } = job.data as { id: string };

    await axios.post(SERVICE_URLS.trackProcessOutputDocumentForPenaltyFeesUrl, { id });

    console.log(`[trackProcessOutputDocumentForPenaltyFeesWorker] Processed document ${id}`);
  },
  { connection },
);

trackProcessOutputDocumentForPenaltyFeesWorker.on('failed', (job, err) => {
  console.error(
    `[trackProcessOutputDocumentForPenaltyFeesWorker] Job ${job?.id} failed:`,
    err.message,
  );
});

// ---------------------------------------------------------------------------
// Graceful close
// ---------------------------------------------------------------------------

export async function closeAllWorkers(): Promise<void> {
  await Promise.all([
    emailWorker.close(),
    smsWorker.close(),
    trackProcessOutputDocumentExpiryWorker.close(),
    trackProcessOutputDocumentForPenaltyFeesWorker.close(),
  ]);
}
