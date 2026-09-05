/**
 * Configuration loading.
 *
 * These are worth having because the whole point of the module is to fail, and
 * a validator nobody tests tends to accept everything. The cases that matter
 * are the ones where accepting a bad value silently would be expensive later:
 * a short master key that makes ciphertext unrecoverable, and a development
 * process holding production payment credentials.
 */
import { describe, expect, it } from 'vitest';
import { loadConfig, describeConfig, redactUrl, type Env } from '@platform/config';
import { ConfigError } from '@domain/errors';

const KEY = 'a'.repeat(64);

const base: Env = {
  DATABASE_URL: 'postgresql://vantage:vantage@localhost:5433/vantage',
  REDIS_URL: 'redis://localhost:6380',
  VANTAGE_MASTER_KEY_ID: 'test-1',
  VANTAGE_MASTER_KEY: KEY,
};

const load = (overrides: Env = {}): ReturnType<typeof loadConfig> =>
  loadConfig({ ...base, ...overrides });

/** The message of the ConfigError a load throws, or '' if it did not throw. */
function problemsFrom(env: Env): string {
  try {
    loadConfig(env);
    return '';
  } catch (error) {
    if (error instanceof ConfigError) return error.message;
    throw error;
  }
}

describe('a usable environment', () => {
  it('loads', () => {
    const config = load();
    expect(config.nodeEnv).toBe('development');
    expect(config.port).toBe(3000);
    expect(config.masterKey.key).toHaveLength(32);
  });

  it('leaves daraja off when none of its values are set', () => {
    expect(load().daraja).toBeNull();
  });

  it('binds to localhost unless told otherwise', () => {
    // A payments process that binds 0.0.0.0 by accident on a laptop is on the
    // network of whatever cafe it is sitting in.
    expect(load().host).toBe('127.0.0.1');
  });
});

describe('what it refuses', () => {
  it('reports every problem at once rather than one per run', () => {
    const message = problemsFrom({});
    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('REDIS_URL');
    expect(message).toContain('VANTAGE_MASTER_KEY');
  });

  it('counts the problems in words that match the number of them', () => {
    expect(problemsFrom({ ...base, DATABASE_URL: '' })).toContain('1 configuration problem:');
    expect(problemsFrom({})).toMatch(/configuration problems:/);
  });

  it('rejects a master key that is not 32 bytes', () => {
    // The dangerous case. Some AES paths accept a short key and produce
    // ciphertext that cannot be decrypted later, and erasure depends on these
    // keys, so an unrecoverable key is a compliance failure and not a bug.
    const message = problemsFrom({ ...base, VANTAGE_MASTER_KEY: 'abcd' });
    expect(message).toContain('64 hex characters');
    expect(message).toContain('4 characters');
  });

  it('rejects a master key that is the right length but not hex', () => {
    expect(problemsFrom({ ...base, VANTAGE_MASTER_KEY: 'z'.repeat(64) })).toContain('hex');
  });

  it('rejects an unknown NODE_ENV instead of guessing', () => {
    expect(problemsFrom({ ...base, NODE_ENV: 'staging' })).toContain('NODE_ENV is "staging"');
  });

  it('rejects a port that is not a number', () => {
    expect(problemsFrom({ ...base, PORT: '80a0' })).toContain('whole number');
  });
});

describe('daraja', () => {
  const daraja: Env = {
    DARAJA_ENV: 'sandbox',
    DARAJA_BASE_URL: 'https://sandbox.safaricom.co.ke',
    DARAJA_CONSUMER_KEY: 'key',
    DARAJA_CONSUMER_SECRET: 'secret',
  };

  it('loads when every value is present', () => {
    expect(load(daraja).daraja?.env).toBe('sandbox');
  });

  it('trims a trailing slash off the base url', () => {
    // Otherwise every request path ends up with a double slash, which some
    // gateways treat as a different route.
    const config = load({ ...daraja, DARAJA_BASE_URL: 'https://sandbox.safaricom.co.ke/' });
    expect(config.daraja?.baseUrl).toBe('https://sandbox.safaricom.co.ke');
  });

  it('refuses a partly configured daraja and names what is missing', () => {
    const message = problemsFrom({ ...base, ...daraja, DARAJA_CONSUMER_SECRET: '' });
    expect(message).toContain('DARAJA_CONSUMER_SECRET');
    expect(message).toContain('all of');
  });

  it('refuses production credentials in a non-production process', () => {
    // docs/09 sandbox discipline. This is the check that stops somebody paying
    // two hundred real people from a laptop.
    const message = problemsFrom({
      ...base,
      ...daraja,
      DARAJA_ENV: 'production',
      NODE_ENV: 'development',
    });
    expect(message).toContain('must never hold production payment credentials');
  });

  it('allows production credentials when the process really is production', () => {
    const config = load({ ...daraja, DARAJA_ENV: 'production', NODE_ENV: 'production' });
    expect(config.daraja?.env).toBe('production');
  });

  it('refuses a base url that is not https', () => {
    expect(
      problemsFrom({ ...base, ...daraja, DARAJA_BASE_URL: 'http://sandbox.safaricom.co.ke' }),
    ).toContain('must be https');
  });
});

describe('what it is safe to log', () => {
  it('keeps the host and drops the credentials from a url', () => {
    expect(redactUrl('postgresql://user:hunter2@db.example.com:5432/vantage?schema=public')).toBe(
      'postgresql://db.example.com:5432/vantage',
    );
  });

  it('says so rather than throwing when a url will not parse', () => {
    expect(redactUrl('not a url')).toBe('[unparseable]');
  });

  it('never puts a secret in the start-up line', () => {
    const config = load({
      DARAJA_ENV: 'sandbox',
      DARAJA_BASE_URL: 'https://sandbox.safaricom.co.ke',
      DARAJA_CONSUMER_KEY: 'fake key for a test',
      DARAJA_CONSUMER_SECRET: 'fake secret for a test',
      DATABASE_URL: 'postgresql://vantage:fake pass@localhost:5433/vantage',
    });
    const line = describeConfig(config);

    expect(line).not.toContain('fake key for a test');
    expect(line).not.toContain('fake secret for a test');
    expect(line).not.toContain('fake pass');
    expect(line).not.toContain(KEY);
    // The key id is not a secret and is the thing you need in order to work out
    // which ciphertext a process can read.
    expect(line).toContain('masterKey=test-1');
    expect(line).toContain('daraja=sandbox');
  });
});
