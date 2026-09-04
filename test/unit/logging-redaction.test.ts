/**
 * docs/09: "A unit test asserts that a log line containing a full MSISDN fails
 * the build." This is that test.
 *
 * It is written against the emitted bytes, not against the redaction list,
 * because the redaction list is exactly the thing that will be incomplete.
 */
import { describe, expect, it } from 'vitest';
import { Writable } from 'node:stream';
import { createLogger, scrubString } from '@platform/logging';

const MSISDN = '254712345678';
const ALL_FORMS = ['254712345678', '+254712345678', '0712345678'];

/** Collects everything a logger writes, so the test can inspect the bytes. */
function captureLog(write: (log: ReturnType<typeof createLogger>) => void): string {
  const chunks: string[] = [];
  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString('utf8'));
      callback();
    },
  });
  write(createLogger({ level: 'debug' }, sink));
  return chunks.join('');
}

describe('a full MSISDN never reaches a log line', () => {
  it('is masked when passed as a named field', () => {
    const output = captureLog((log) => {
      log.info({ msisdn: MSISDN }, 'sending payout');
    });
    for (const form of ALL_FORMS) expect(output).not.toContain(form);
  });

  it('is masked when interpolated into the message by hand', () => {
    // The 2am failure mode: a template string that bypasses the redaction list.
    const output = captureLog((log) => {
      log.info(`sending payout to ${MSISDN}`);
    });
    for (const form of ALL_FORMS) expect(output).not.toContain(form);
    expect(output).toContain('2547•••••678');
  });

  it('is masked under an unexpected field name', () => {
    const output = captureLog((log) => {
      log.warn({ someFieldNobodyAddedToTheList: MSISDN }, 'unusual');
    });
    for (const form of ALL_FORMS) expect(output).not.toContain(form);
  });

  it('is masked when nested inside an object', () => {
    const output = captureLog((log) => {
      log.info({ item: { recipient: { contact: MSISDN } } }, 'nested');
    });
    for (const form of ALL_FORMS) expect(output).not.toContain(form);
  });

  it('is masked inside an array', () => {
    const output = captureLog((log) => {
      log.info({ batch: [{ to: '0712345678' }, { to: '+254712345679' }] }, 'batch');
    });
    expect(output).not.toContain('0712345678');
    expect(output).not.toContain('254712345679');
  });

  it('is masked inside an error message', () => {
    const output = captureLog((log) => {
      log.error({ err: new Error(`failed to pay ${MSISDN}`) }, 'gateway error');
    });
    for (const form of ALL_FORMS) expect(output).not.toContain(form);
  });
});

describe('names, IDs and credentials never appear at all', () => {
  it('redacts a recipient name', () => {
    const output = captureLog((log) => {
      log.info({ fullName: 'Amina Wanjiru', full_name: 'Amina Wanjiru' }, 'recipient');
    });
    expect(output).not.toContain('Amina Wanjiru');
    expect(output).toContain('[redacted]');
  });

  it('redacts the M-Pesa registered name', () => {
    const output = captureLog((log) => {
      log.info({ registeredName: 'Peter Kimani' }, 'callback');
    });
    expect(output).not.toContain('Peter Kimani');
  });

  it('redacts a national ID', () => {
    const output = captureLog((log) => {
      log.info({ nationalId: '12345678', national_id: '12345678' }, 'recipient');
    });
    expect(output).not.toContain('12345678');
  });

  it('redacts channel credentials and the callback secret', () => {
    const output = captureLog((log) => {
      log.info(
        {
          securityCredential: 'SUPERSECRET',
          initiatorPassword: 'SUPERSECRET',
          callbackSecret: 'SUPERSECRET',
          credentials: { initiator: 'SUPERSECRET' },
        },
        'channel loaded',
      );
    });
    expect(output).not.toContain('SUPERSECRET');
  });

  it('redacts session tokens and auth headers', () => {
    const output = captureLog((log) => {
      log.info({ sessionToken: 'tok_live_x', cookie: 'sid=abc' }, 'request');
    });
    expect(output).not.toContain('tok_live_x');
    expect(output).not.toContain('sid=abc');
  });

  it('keeps raw gateway payloads out of the application log', () => {
    // docs/09: those belong in gateway_message, where they are access controlled.
    const output = captureLog((log) => {
      log.info({ payload: { Result: { ResultCode: 0 } }, body: 'raw' }, 'daraja');
    });
    expect(output).not.toContain('ResultCode');
  });
});

describe('scrubString', () => {
  it('masks every accepted MSISDN form', () => {
    expect(scrubString('254712345678')).toBe('2547•••••678');
    expect(scrubString('+254712345678')).toBe('2547•••••678');
    expect(scrubString('0712345678')).toBe('2547•••••678');
  });

  it('masks several in one string', () => {
    const scrubbed = scrubString('paid 0712345678 and 0723456789');
    expect(scrubbed).not.toMatch(/\d{9}/);
    expect(scrubbed).toBe('paid 2547•••••678 and 2547•••••789');
  });

  it('leaves things that are not phone numbers alone', () => {
    // Correlation IDs, receipts and amounts must survive intact or the logs
    // become useless, which is its own kind of failure.
    expect(scrubString('QK12ABC3DE')).toBe('QK12ABC3DE');
    expect(scrubString('amountMinor=150000')).toBe('amountMinor=150000');
    expect(scrubString('9f2c1b40-8e3a-4c11-9f0e-1a2b3c4d5e6f')).toBe(
      '9f2c1b40-8e3a-4c11-9f0e-1a2b3c4d5e6f',
    );
  });

  it('does not chew into a longer digit run', () => {
    expect(scrubString('12547123456789012')).toBe('12547123456789012');
  });
});
