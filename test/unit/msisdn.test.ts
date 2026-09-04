import { describe, expect, it } from 'vitest';
import { maskMsisdn, normaliseMsisdn } from '@domain/msisdn';

describe('normaliseMsisdn', () => {
  it('normalises every form docs/04 lists to 2547XXXXXXXX', () => {
    const forms = [
      '0712345678',
      '+254712345678',
      '254712345678',
      '712345678',
      '7 12 345 678',
      '0712 345 678',
      '+254 712-345-678',
      '00254712345678',
      "'0712345678",
      '  0712345678  ',
    ];
    for (const form of forms) {
      const result = normaliseMsisdn(form);
      expect(result.ok, form).toBe(true);
      if (result.ok) expect(result.msisdn, form).toBe('254712345678');
    }
  });

  it('rejects what it cannot normalise unambiguously', () => {
    const cases: Array<[string, string]> = [
      ['', 'empty'],
      ['   ', 'empty'],
      ['not a number', 'contains_letters'],
      ['0712345678x', 'contains_letters'],
      ['071234567', 'wrong_length'],
      ['07123456789', 'wrong_length'],
      ['0812345678', 'not_a_kenyan_mobile'],
      ['0201234567', 'not_a_kenyan_mobile'],
    ];
    for (const [input, reason] of cases) {
      const result = normaliseMsisdn(input);
      expect(result.ok, input).toBe(false);
      if (!result.ok) expect(result.reason, input).toBe(reason);
    }
  });

  it('rejects a landline and a shortcode rather than guessing', () => {
    expect(normaliseMsisdn('0202345678').ok).toBe(false);
    expect(normaliseMsisdn('40404').ok).toBe(false);
  });
});

describe('maskMsisdn', () => {
  it('shows the country code and last three digits only', () => {
    expect(maskMsisdn('254712345678')).toBe('2547•••••678');
  });

  it('never leaks the middle digits', () => {
    const masked = maskMsisdn('254712345678');
    expect(masked).not.toContain('12345');
    expect(masked.replace(/[•]/g, '')).toHaveLength(7);
  });
});

describe('the 01xx range', () => {
  it('normalises every form to 2541XXXXXXXX', () => {
    // Safaricom and Airtel both issue from this block now. Rejecting it would
    // silently drop real participants out of a payout run.
    const forms = [
      '0110123456',
      '+254110123456',
      '254110123456',
      '110123456',
      '0110 123 456',
      '00254110123456',
    ];
    for (const form of forms) {
      const result = normaliseMsisdn(form);
      expect(result.ok, form).toBe(true);
      if (result.ok) expect(result.msisdn, form).toBe('254110123456');
    }
  });

  it('accepts the 010x block too', () => {
    const result = normaliseMsisdn('0100123456');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.msisdn).toBe('254100123456');
  });

  it('still applies the length rule to it', () => {
    expect(normaliseMsisdn('011012345').ok).toBe(false);
    expect(normaliseMsisdn('01101234567').ok).toBe(false);
  });

  it('masks it the same way', () => {
    expect(maskMsisdn('254110123456')).toBe('2541•••••456');
  });
});
