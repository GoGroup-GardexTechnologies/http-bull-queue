import { parsePhoneNumber, CountryCode } from 'libphonenumber-js';

// ---------------------------------------------------------------------------
// Country phone codes
// ---------------------------------------------------------------------------

export const COUNTRY_PHONE_CODES: { country: string; code: string; iso: string }[] = [
  { country: 'Botswana', code: '267', iso: 'BW' },
  { country: 'South Africa', code: '27', iso: 'ZA' },
  { country: 'Zimbabwe', code: '263', iso: 'ZW' },
  { country: 'Zambia', code: '260', iso: 'ZM' },
  { country: 'Namibia', code: '264', iso: 'NA' },
  { country: 'United Kingdom', code: '44', iso: 'GB' },
  { country: 'United States', code: '1', iso: 'US' },
];

// ---------------------------------------------------------------------------
// Startup validation
// ---------------------------------------------------------------------------

const REQUIRED_ENV: string[] = [
  'QUEUE_SECRET',
  'REDIS_HOST',
  'REDIS_PORT',
  'TURBO_SMTP_CONSUMER_KEY',
  'TURBO_SMTP_CONSUMER_SECRET',
  'SMS_PORTAL_CLIENT_ID',
  'SMS_PORTAL_API_KEY',
];

const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`[http-bull-queue] Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const REDIS_HOST: string = process.env.REDIS_HOST!;
export const REDIS_PORT: string = process.env.REDIS_PORT!;
export const REDIS_PASS: string = process.env.REDIS_PASS || '';

export const TURBO_SMTP_CONSUMER_KEY: string = process.env.TURBO_SMTP_CONSUMER_KEY!;
export const TURBO_SMTP_CONSUMER_SECRET: string = process.env.TURBO_SMTP_CONSUMER_SECRET!;
export const VERIFIED_EMAIL: string = process.env.VERIFIED_EMAIL || 'noreply@ivdms.website';

export const SMS_PORTAL_CLIENT_ID: string = process.env.SMS_PORTAL_CLIENT_ID!;
export const SMS_PORTAL_API_KEY: string = process.env.SMS_PORTAL_API_KEY!;

export const queue = {
  emailQueue: 'emailQueue',
  smsQueue: 'smsQueue',
  trackProcessOutputDocumentForPenaltyFeesQueue: 'trackProcessOutputDocumentForPenaltyFeesQueue',
  trackProcessOutputDocumentExpiryQueue: 'trackProcessOutputDocumentExpiryQueue',
};

export const SERVICE_URLS = {
  trackProcessOutputDocumentExpiryUrl: process.env.TRACK_PROCESS_OUTPUT_DOCUMENT_EXPIRY_URL || '',
  trackProcessOutputDocumentForPenaltyFeesUrl: process.env.TRACK_PROCESS_OUTPUT_DOCUMENT_FOR_PENALTY_FEES_URL || '',
  smsPortalBaseUrl: process.env.SMS_PORTAL_BASE_URL || 'https://rest.smsportal.com/v1',
};
