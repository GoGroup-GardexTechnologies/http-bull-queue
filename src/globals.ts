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
  'SEND_GRID_API_KEY',
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

export const SEND_GRID_API_KEY: string = process.env.SEND_GRID_API_KEY!;
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
  firebaseCloudFunctionUrl: process.env.FIREBASE_CLOUD_FUNCTION_URL || '',
  smsPortalBaseUrl: process.env.SMS_PORTAL_BASE_URL || 'https://rest.smsportal.com/v1',
};
