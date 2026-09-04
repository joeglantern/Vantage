/**
 * MSISDN normalisation, per the first validation rule in docs/04:
 *
 *   `0712…`, `+254712…`, `254712…`, `7 12…` all normalise to `2547XXXXXXXX`,
 *   and the `01xx` range normalises the same way to `2541XXXXXXXX`.
 *
 * A phone number is the payment instrument here. Getting this wrong sends money
 * to a stranger, so the rule is strict: normalise what is unambiguous, reject
 * everything else. Never guess.
 */
import { err, type Result } from './result.js';

export const KENYA_COUNTRY_CODE = '254';

/**
 * The mobile prefixes accepted after the country code.
 *
 * Kenyan mobile numbering uses two ranges. `07xx` is the original block, and
 * `01xx` is the later allocation that Safaricom and Airtel now issue from.
 * Rejecting `01xx` would refuse real, current numbers, which at a stipend cycle
 * means a participant silently drops out of a payout run.
 *
 * Both ranges carry nine national significant digits, so the only thing that
 * differs is the leading digit.
 */
export const KENYAN_MOBILE_PREFIXES = ['7', '1'] as const;

/** Digits after the leading prefix digit. 1 + 8 = 9 national significant digits. */
const SUBSCRIBER_DIGITS = 8;

declare const msisdnBrand: unique symbol;
/** A number that has been through `normaliseMsisdn`. Nothing else is one. */
export type Msisdn = string & { readonly [msisdnBrand]: true };

export type MsisdnError =
  | 'empty'
  | 'contains_letters'
  | 'not_a_kenyan_mobile'
  | 'wrong_length';

export function normaliseMsisdn(input: string): Result<{ msisdn: Msisdn }, MsisdnError> {
  const trimmed = input.trim();
  if (trimmed === '') return err('empty');

  // Spreadsheets contain spaces, hyphens, brackets and a leading apostrophe
  // from Excel's text coercion. Strip formatting, keep a leading +.
  const cleaned = trimmed.replace(/^'/, '').replace(/[\s\-()./]/g, '');
  if (/[^+\d]/.test(cleaned)) return err('contains_letters');

  const digits = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;
  if (digits === '' || /\D/.test(digits)) return err('contains_letters');

  const national = toNationalSignificant(digits);
  if (national === null) return err('not_a_kenyan_mobile');

  const prefix = national.slice(0, 1);
  if (!(KENYAN_MOBILE_PREFIXES as readonly string[]).includes(prefix)) {
    return err('not_a_kenyan_mobile');
  }
  if (national.length !== SUBSCRIBER_DIGITS + 1) return err('wrong_length');

  return { ok: true, msisdn: `${KENYA_COUNTRY_CODE}${national}` as Msisdn };
}

/**
 * Reduces any accepted form to the national significant number: the part after
 * the country code and without a trunk zero. Returns null if the input is not
 * one of the accepted shapes.
 */
function toNationalSignificant(digits: string): string | null {
  // 254712345678
  if (digits.startsWith(KENYA_COUNTRY_CODE)) {
    return digits.slice(KENYA_COUNTRY_CODE.length);
  }
  // 00254712345678, international prefix dialled literally
  if (digits.startsWith(`00${KENYA_COUNTRY_CODE}`)) {
    return digits.slice(2 + KENYA_COUNTRY_CODE.length);
  }
  // 0712345678, trunk zero
  if (digits.startsWith('0')) {
    return digits.slice(1);
  }
  // 712345678, bare national significant number
  return digits;
}

/**
 * The log and pack representation: `2547•••••678`. docs/05 requires MSISDNs to
 * be redacted to the last three digits everywhere they are displayed or logged.
 */
export function maskMsisdn(msisdn: string): string {
  if (msisdn.length <= 7) return '•'.repeat(msisdn.length);
  const head = msisdn.slice(0, 4);
  const tail = msisdn.slice(-3);
  return `${head}${'•'.repeat(msisdn.length - 7)}${tail}`;
}
