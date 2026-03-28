import * as Joi from 'joi';
import { COUNTRY_PHONE_CODES } from './globals';

// ---------------------------------------------------------------------------
// stripHtml
// ---------------------------------------------------------------------------

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// mongoIdValidation
// ---------------------------------------------------------------------------

export const mongoIdValidation = Joi.string()
  .length(24)
  .pattern(/^[a-f0-9]{24}$/)
  .messages({
    'string.length': 'id must be a 24-character hex string',
    'string.pattern.base': 'id must be a valid MongoDB ObjectId',
  });

// ---------------------------------------------------------------------------
// phoneValidation
// ---------------------------------------------------------------------------

const validCodes = COUNTRY_PHONE_CODES.map((c) => c.code);

export const phoneValidation = Joi.string()
  .pattern(/^\+[0-9]+ [0-9]+$/)
  .custom((value, helpers) => {
    const match = value.match(/^\+([0-9]+) /);
    if (!match || !validCodes.includes(match[1])) {
      return helpers.error('phone.invalidCode');
    }
    return value;
  })
  .messages({
    'string.pattern.base': 'phone must be in +{countryCode} {number} format',
    'phone.invalidCode': 'phone country code is not recognised',
  });
