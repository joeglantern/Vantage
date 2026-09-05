/**
 * Configuration, read once at start-up and validated before anything else runs.
 *
 * The rule here is that a misconfigured process must refuse to start rather
 * than discover the problem halfway through a disbursement. A missing master
 * key found at boot is an outage of a few seconds; the same key found missing
 * while a batch is in flight leaves payments in `unknown`, and docs/04 is clear
 * that `unknown` is the expensive state.
 *
 * Nothing here reads `process.env` lazily and nothing has a production default.
 * Defaults exist only for values that are genuinely local conveniences (a log
 * level, a port), never for credentials or for anything that decides where money
 * goes.
 */
import { ConfigError } from '@domain/errors';

export type NodeEnv = 'development' | 'test' | 'production';
export type DarajaEnv = 'sandbox' | 'production';

export interface DatabaseConfig {
  readonly url: string;
  /** Ceiling on pooled connections. Postgres, not the app, is the scarce side. */
  readonly poolSize: number;
}

export interface DarajaConfig {
  readonly env: DarajaEnv;
  readonly baseUrl: string;
  readonly consumerKey: string;
  readonly consumerSecret: string;
}

export interface MasterKeyConfig {
  /** Names the key so a rotation can be told apart in the ciphertext header. */
  readonly id: string;
  readonly key: Buffer;
}

export interface Config {
  readonly nodeEnv: NodeEnv;
  readonly logLevel: string;
  readonly port: number;
  readonly host: string;
  readonly database: DatabaseConfig;
  readonly redisUrl: string;
  readonly masterKey: MasterKeyConfig;
  /**
   * Absent until Daraja is configured. The server runs without it so the import
   * and review half of the product works; anything that would move money checks
   * for it and refuses rather than assuming a default shortcode.
   */
  readonly daraja: DarajaConfig | null;
}

export type Env = Readonly<Record<string, string | undefined>>;

/** Collected rather than thrown one at a time, so one boot reports every fault. */
class Problems {
  private readonly found: string[] = [];

  add(message: string): void {
    this.found.push(message);
  }

  require(env: Env, name: string, hint: string): string {
    const value = env[name]?.trim();
    if (value === undefined || value === '') {
      this.add(`${name} is not set. ${hint}`);
      return '';
    }
    return value;
  }

  throwIfAny(): void {
    if (this.found.length === 0) return;
    throw new ConfigError(
      `The process cannot start. ${this.found.length} configuration ${
        this.found.length === 1 ? 'problem' : 'problems'
      }:\n` + this.found.map((p) => `  - ${p}`).join('\n'),
    );
  }
}

const NODE_ENVS: readonly NodeEnv[] = ['development', 'test', 'production'];
const DARAJA_ENVS: readonly DarajaEnv[] = ['sandbox', 'production'];

function readNodeEnv(env: Env, problems: Problems): NodeEnv {
  const raw = env['NODE_ENV']?.trim();
  if (raw === undefined || raw === '') return 'development';
  if (!NODE_ENVS.includes(raw as NodeEnv)) {
    problems.add(`NODE_ENV is "${raw}". It must be one of ${NODE_ENVS.join(', ')}.`);
    return 'development';
  }
  return raw as NodeEnv;
}

function readPositiveInt(
  env: Env,
  name: string,
  fallback: number,
  problems: Problems,
): number {
  const raw = env[name]?.trim();
  if (raw === undefined || raw === '') return fallback;
  if (!/^[0-9]+$/.test(raw)) {
    problems.add(`${name} is "${raw}". It must be a whole number.`);
    return fallback;
  }
  const value = parseInt(raw, 10);
  if (value <= 0) {
    problems.add(`${name} is ${value}. It must be greater than zero.`);
    return fallback;
  }
  return value;
}

/**
 * The master key is 32 bytes of hex, and it is checked for length here because
 * a short key is accepted silently by some AES paths and produces ciphertext
 * nobody can decrypt later. Erasure depends on these keys, so a key that cannot
 * be reproduced is a compliance failure and not merely a bug (docs/06).
 */
function readMasterKey(env: Env, problems: Problems): MasterKeyConfig {
  const id = env['VANTAGE_MASTER_KEY_ID']?.trim() ?? '';
  if (id === '') {
    problems.add(
      'VANTAGE_MASTER_KEY_ID is not set. It names the key so ciphertext written ' +
        'under an older key can still be found after a rotation.',
    );
  }

  const raw = env['VANTAGE_MASTER_KEY']?.trim() ?? '';
  if (raw === '') {
    problems.add(
      'VANTAGE_MASTER_KEY is not set. Generate one for local use with: ' +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
    return { id, key: Buffer.alloc(0) };
  }

  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    problems.add(
      `VANTAGE_MASTER_KEY must be 64 hex characters, which is 32 bytes. It is ${raw.length} characters.`,
    );
    return { id, key: Buffer.alloc(0) };
  }

  return { id, key: Buffer.from(raw, 'hex') };
}

/**
 * Daraja is optional, but half-configured Daraja is not. Supplying some of the
 * values and not the rest is the shape of a mistake, so it is an error rather
 * than a silent fallback to disabled.
 */
function readDaraja(env: Env, nodeEnv: NodeEnv, problems: Problems): DarajaConfig | null {
  const keys = [
    'DARAJA_ENV',
    'DARAJA_BASE_URL',
    'DARAJA_CONSUMER_KEY',
    'DARAJA_CONSUMER_SECRET',
  ] as const;
  const present = keys.filter((k) => (env[k]?.trim() ?? '') !== '');
  if (present.length === 0) return null;

  if (present.length < keys.length) {
    const missing = keys.filter((k) => !present.includes(k));
    problems.add(
      `Daraja is partly configured. Set all of ${keys.join(', ')} or none of them. Missing: ${missing.join(', ')}.`,
    );
    return null;
  }

  const rawEnv = env['DARAJA_ENV']!.trim();
  if (!DARAJA_ENVS.includes(rawEnv as DarajaEnv)) {
    problems.add(`DARAJA_ENV is "${rawEnv}". It must be one of ${DARAJA_ENVS.join(', ')}.`);
  }

  // docs/09 sandbox discipline. Pointing a developer's machine at a production
  // shortcode is how somebody pays two hundred real people by accident.
  if (rawEnv === 'production' && nodeEnv !== 'production') {
    problems.add(
      `DARAJA_ENV is "production" while NODE_ENV is "${nodeEnv}". A non-production process must never hold production payment credentials.`,
    );
  }

  const baseUrl = env['DARAJA_BASE_URL']!.trim();
  if (!baseUrl.startsWith('https://')) {
    problems.add(`DARAJA_BASE_URL is "${baseUrl}". It must be https.`);
  }

  return {
    env: rawEnv as DarajaEnv,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    consumerKey: env['DARAJA_CONSUMER_KEY']!.trim(),
    consumerSecret: env['DARAJA_CONSUMER_SECRET']!.trim(),
  };
}

/**
 * Build the configuration, or throw a ConfigError naming every problem at once.
 *
 * Takes the environment as an argument rather than reaching for `process.env`,
 * so this is testable without mutating global state.
 */
export function loadConfig(env: Env): Config {
  const problems = new Problems();
  const nodeEnv = readNodeEnv(env, problems);

  const databaseUrl = problems.require(
    env,
    'DATABASE_URL',
    'Point it at Postgres. For local development, npm run dev:up starts one on port 5433.',
  );
  const redisUrl = problems.require(
    env,
    'REDIS_URL',
    'Point it at Redis. For local development, npm run dev:up starts one on port 6380.',
  );

  const masterKey = readMasterKey(env, problems);
  const daraja = readDaraja(env, nodeEnv, problems);

  const config: Config = {
    nodeEnv,
    logLevel: env['LOG_LEVEL']?.trim() ?? (nodeEnv === 'production' ? 'info' : 'debug'),
    port: readPositiveInt(env, 'PORT', 3000, problems),
    host: env['HOST']?.trim() ?? '127.0.0.1',
    database: {
      url: databaseUrl,
      poolSize: readPositiveInt(env, 'DATABASE_POOL_SIZE', 10, problems),
    },
    redisUrl,
    masterKey,
    daraja,
  };

  problems.throwIfAny();
  return config;
}

/**
 * A one-line summary safe to log at start-up.
 *
 * Deliberately hand-written rather than derived from the object, so a secret
 * added to Config later cannot leak into the logs by simply existing.
 */
export function describeConfig(config: Config): string {
  const daraja =
    config.daraja === null ? 'daraja=off' : `daraja=${config.daraja.env}`;
  return [
    `env=${config.nodeEnv}`,
    `listening=${config.host}:${config.port}`,
    `db=${redactUrl(config.database.url)}`,
    `redis=${redactUrl(config.redisUrl)}`,
    `masterKey=${config.masterKey.id}`,
    daraja,
  ].join(' ');
}

/** Keeps the host and database name, drops the credentials. */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    return parsed.toString();
  } catch {
    return '[unparseable]';
  }
}
