import { stripHtml } from '../functions';
import * as Joi from 'joi';

// Mock globals to avoid loading country phone codes and startup validation
jest.mock('../globals', () => ({
  COUNTRY_PHONE_CODES: [
    { country: 'Botswana', code: '267', iso: 'BW' },
    { country: 'South Africa', code: '27', iso: 'ZA' },
    { country: 'United States', code: '1', iso: 'US' },
  ],
  VERIFIED_EMAIL: 'noreply@test.com',
  OPEN_SSL_PASSPHRASE: '',
  REDIS_HOST: 'localhost',
  REDIS_PORT: '6379',
  REDIS_PASS: '',
  TURBO_SMTP_CONSUMER_KEY: 'test-consumer-key',
  TURBO_SMTP_CONSUMER_SECRET: 'test-consumer-secret',
  SMS_PORTAL_CLIENT_ID: 'test-id',
  SMS_PORTAL_API_KEY: 'test-key',
  queue: {
    emailQueue: 'emailQueue',
    smsQueue: 'smsQueue',
    trackProcessOutputDocumentForPenaltyFeesQueue: 'trackProcessOutputDocumentForPenaltyFeesQueue',
    trackProcessOutputDocumentExpiryQueue: 'trackProcessOutputDocumentExpiryQueue',
  },
  SERVICE_URLS: {
    trackProcessOutputDocumentExpiryUrl: '',
    trackProcessOutputDocumentForPenaltyFeesUrl: '',
    smsPortalBaseUrl: '',
  },
}));

// ---------------------------------------------------------------------------
// stripHtml
// ---------------------------------------------------------------------------

describe('stripHtml()', () => {
  it('removes HTML tags', () => {
    expect(stripHtml('<p>Hello <b>World</b></p>')).toBe('Hello World');
  });

  it('collapses multiple spaces into one', () => {
    expect(stripHtml('<p>  too   many   spaces  </p>')).toBe('too many spaces');
  });

  it('returns plain text unchanged', () => {
    expect(stripHtml('No tags here')).toBe('No tags here');
  });

  it('handles empty string', () => {
    expect(stripHtml('')).toBe('');
  });

  it('removes self-closing tags', () => {
    expect(stripHtml('Line one<br/>Line two')).toBe('Line one Line two');
  });
});

// ---------------------------------------------------------------------------
// mongoIdValidation
// ---------------------------------------------------------------------------

describe('mongoIdValidation', () => {
  // Import after mock is in place
  const { mongoIdValidation } = require('../functions');
  const schema = Joi.object({ id: mongoIdValidation.required() });

  it('accepts a valid 24-character hex ObjectId', () => {
    const { error } = schema.validate({ id: '507f1f77bcf86cd799439011' });
    expect(error).toBeUndefined();
  });

  it('rejects a string that is too short', () => {
    const { error } = schema.validate({ id: '507f1f77bcf86cd79943901' });
    expect(error).toBeDefined();
  });

  it('rejects a non-hex string of the right length', () => {
    const { error } = schema.validate({ id: 'zzzzzzzzzzzzzzzzzzzzzzzz' });
    expect(error).toBeDefined();
  });

  it('rejects an empty value', () => {
    const { error } = schema.validate({ id: '' });
    expect(error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// phoneValidation
// ---------------------------------------------------------------------------

describe('phoneValidation', () => {
  const { phoneValidation } = require('../functions');
  const schema = Joi.object({ phone: phoneValidation.required() });

  it('accepts a valid Botswana number', () => {
    const { error } = schema.validate({ phone: '+267 71234567' });
    expect(error).toBeUndefined();
  });

  it('rejects a number with an unrecognised country code', () => {
    const { error } = schema.validate({ phone: '+999 71234567' });
    expect(error).toBeDefined();
  });

  it('rejects a number with no space separator', () => {
    const { error } = schema.validate({ phone: '+26771234567' });
    expect(error).toBeDefined();
  });

  it('rejects an empty string', () => {
    const { error } = schema.validate({ phone: '' });
    expect(error).toBeDefined();
  });

  it('accepts ISO format with spaces in subscriber number and normalises to single space', () => {
    const { error, value } = schema.validate({ phone: '+267 77 534 528' });
    expect(error).toBeUndefined();
    expect(value.phone).toBe('+267 77534528');
  });

  it('accepts already-normalised format unchanged', () => {
    const { error, value } = schema.validate({ phone: '+267 77534528' });
    expect(error).toBeUndefined();
    expect(value.phone).toBe('+267 77534528');
  });

  it('accepts South Africa ISO format and normalises', () => {
    const { error, value } = schema.validate({ phone: '+27 82 123 4567' });
    expect(error).toBeUndefined();
    expect(value.phone).toBe('+27 821234567');
  });

  it('rejects ISO format with an unrecognised country code', () => {
    const { error } = schema.validate({ phone: '+999 12 345' });
    expect(error).toBeDefined();
  });
});
