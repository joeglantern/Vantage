import { describe, expect, it } from 'vitest';
import {
  addMoney,
  compareMoney,
  formatMoney,
  isWholeMajorUnit,
  moneyFromMajorString,
  moneyFromMinorString,
  moneyToJSON,
  sumMoney,
} from '@domain/money';

const kes = (minor: bigint) => ({ amountMinor: minor, currency: 'KES' as const });

describe('money parsing', () => {
  it('reads minor units from a string', () => {
    const result = moneyFromMinorString('150000', 'KES');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.money.amountMinor).toBe(150000n);
  });

  it('reads what a human types in a spreadsheet', () => {
    const cases: Array<[string, bigint]> = [
      ['1500', 150000n],
      ['1500.00', 150000n],
      ['1,500', 150000n],
      ['1,500.50', 150050n],
      ['0', 0n],
      ['0.05', 5n],
    ];
    for (const [input, expected] of cases) {
      const result = moneyFromMajorString(input, 'KES');
      expect(result.ok, input).toBe(true);
      if (result.ok) expect(result.money.amountMinor, input).toBe(expected);
    }
  });

  it('rejects rather than rounds when there is more precision than the currency has', () => {
    // Silently rounding somebody's stipend is not a behaviour this system has.
    const result = moneyFromMajorString('1500.005', 'KES');
    expect(result.ok).toBe(false);
  });

  it('rejects negatives, letters and unsupported currencies', () => {
    expect(moneyFromMajorString('-100', 'KES').ok).toBe(false);
    expect(moneyFromMinorString('-100', 'KES').ok).toBe(false);
    expect(moneyFromMinorString('12.5', 'KES').ok).toBe(false);
    expect(moneyFromMinorString('abc', 'KES').ok).toBe(false);
    expect(moneyFromMinorString('100', 'USD').ok).toBe(false);
  });

  it('keeps exactness past 2^53, which is why JSON carries a string', () => {
    const big = '9007199254740993';
    const result = moneyFromMinorString(big, 'KES');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(moneyToJSON(result.money).amountMinor).toBe(big);
      // The bug this design exists to prevent. The lint rule that forbids
      // Number() on money is doing its job everywhere except right here,
      // where the whole point is to show what it would cost.
      // eslint-disable-next-line no-restricted-globals
      expect(String(Number(big))).not.toBe(big);
    }
  });
});

describe('money arithmetic', () => {
  it('adds and sums exactly', () => {
    const sum = sumMoney([kes(150000n), kes(250000n), kes(1n)], 'KES');
    expect(sum.ok).toBe(true);
    if (sum.ok) expect(sum.money.amountMinor).toBe(400001n);
  });

  it('sums an empty batch to zero', () => {
    const sum = sumMoney([], 'KES');
    expect(sum.ok).toBe(true);
    if (sum.ok) expect(sum.money.amountMinor).toBe(0n);
  });

  it('refuses to add across currencies', () => {
    const mixed = addMoney(kes(100n), { amountMinor: 100n, currency: 'USD' as never });
    expect(mixed.ok).toBe(false);
  });

  it('refuses to compare across currencies rather than returning a wrong answer', () => {
    expect(() =>
      compareMoney(kes(100n), { amountMinor: 100n, currency: 'USD' as never }),
    ).toThrow(TypeError);
  });
});

describe('whole shillings', () => {
  it('accepts whole shillings and rejects cents', () => {
    expect(isWholeMajorUnit(kes(150000n))).toBe(true);
    expect(isWholeMajorUnit(kes(150050n))).toBe(false);
    expect(isWholeMajorUnit(kes(0n))).toBe(true);
  });
});

describe('formatting', () => {
  it('groups thousands for display', () => {
    expect(formatMoney(kes(150000n))).toBe('KES 1,500.00');
    expect(formatMoney(kes(123456789n))).toBe('KES 1,234,567.89');
    expect(formatMoney(kes(5n))).toBe('KES 0.05');
  });
});
