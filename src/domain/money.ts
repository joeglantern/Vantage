/**
 * Money, per the one rule in docs/03:
 *
 *   A BIGINT count of minor units, always paired with a currency code. A string
 *   in JSON. Never a float, and never a JavaScript `number` crossing a boundary.
 *
 * KES 1,500.00 is 150000 minor units with currency KES.
 */
import { err, type Result } from './result.js';

export const SUPPORTED_CURRENCIES = ['KES'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

/** Minor units per major unit. KES has cents, so 100. */
const MINOR_UNITS_PER_MAJOR: Readonly<Record<Currency, bigint>> = { KES: 100n };

export interface Money {
  readonly amountMinor: bigint;
  readonly currency: Currency;
}

export type MoneyError =
  | 'not_an_integer_string'
  | 'unsupported_currency'
  | 'currency_mismatch'
  | 'negative'
  | 'out_of_range';

/**
 * The largest amount we will represent. Postgres BIGINT tops out far higher,
 * but a payout above this is a typo, not a payout, and an explicit bound is
 * cheaper than discovering the limit at the gateway.
 */
export const MAX_AMOUNT_MINOR = 9_007_199_254_740_991n * 100n;

export function isCurrency(value: string): value is Currency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

/**
 * Parses minor units from a string. Deliberately does not accept a `number`:
 * that is the boundary where precision is lost.
 */
export function moneyFromMinorString(
  amountMinor: string,
  currency: string,
): Result<{ money: Money }, MoneyError> {
  if (!isCurrency(currency)) return err('unsupported_currency');
  if (!/^-?\d+$/.test(amountMinor)) return err('not_an_integer_string');

  const parsed = BigInt(amountMinor);
  if (parsed < 0n) return err('negative');
  if (parsed > MAX_AMOUNT_MINOR) return err('out_of_range');

  return { ok: true, money: { amountMinor: parsed, currency } };
}

/**
 * Parses a major-unit amount as written by a human in a spreadsheet: "1500",
 * "1500.00", "1,500". Rejects anything with more precision than the currency
 * has, rather than rounding it. Silently rounding somebody's stipend is not a
 * behaviour this system should have.
 */
export function moneyFromMajorString(
  amountMajor: string,
  currency: string,
): Result<{ money: Money }, MoneyError> {
  if (!isCurrency(currency)) return err('unsupported_currency');

  const cleaned = amountMajor.trim().replace(/,/g, '').replace(/\s/g, '');
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (match === null) return err('not_an_integer_string');

  const [, sign, whole, fraction = ''] = match;
  if (sign === '-') return err('negative');
  if (whole === undefined) return err('not_an_integer_string');

  const scale = MINOR_UNITS_PER_MAJOR[currency];
  const digits = scale.toString().length - 1;
  if (fraction.length > digits) return err('not_an_integer_string');

  const padded = fraction.padEnd(digits, '0');
  const parsed = BigInt(whole) * scale + BigInt(padded === '' ? '0' : padded);
  if (parsed > MAX_AMOUNT_MINOR) return err('out_of_range');

  return { ok: true, money: { amountMinor: parsed, currency } };
}

export function addMoney(a: Money, b: Money): Result<{ money: Money }, MoneyError> {
  if (a.currency !== b.currency) return err('currency_mismatch');
  const sum = a.amountMinor + b.amountMinor;
  if (sum > MAX_AMOUNT_MINOR) return err('out_of_range');
  return { ok: true, money: { amountMinor: sum, currency: a.currency } };
}

export function sumMoney(
  amounts: readonly Money[],
  currency: Currency,
): Result<{ money: Money }, MoneyError> {
  let total: Money = { amountMinor: 0n, currency };
  for (const amount of amounts) {
    const next = addMoney(total, amount);
    if (!next.ok) return next;
    total = next.money;
  }
  return { ok: true, money: total };
}

export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  if (a.currency !== b.currency) {
    throw new TypeError('Refusing to compare amounts in different currencies');
  }
  if (a.amountMinor < b.amountMinor) return -1;
  if (a.amountMinor > b.amountMinor) return 1;
  return 0;
}

/**
 * M-Pesa B2C moves whole shillings. This mirrors the database check constraint
 * on `payout_item`; the constraint is the authority, this is the early warning.
 */
export function isWholeMajorUnit(money: Money): boolean {
  return money.amountMinor % MINOR_UNITS_PER_MAJOR[money.currency] === 0n;
}

/** The JSON representation. A string, always. See docs/03. */
export function moneyToJSON(money: Money): { amountMinor: string; currency: Currency } {
  return { amountMinor: money.amountMinor.toString(), currency: money.currency };
}

/** Display only. Never parsed back, never sent to a gateway. */
export function formatMoney(money: Money): string {
  const scale = MINOR_UNITS_PER_MAJOR[money.currency];
  const digits = scale.toString().length - 1;
  const whole = money.amountMinor / scale;
  const fraction = (money.amountMinor % scale).toString().padStart(digits, '0');
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${money.currency} ${grouped}.${fraction}`;
}
