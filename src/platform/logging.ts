/**
 * Structured logging, with PII redaction that is enforced rather than trusted.
 *
 * docs/05 and docs/09 require that MSISDNs appear only as `2547•••••678`, and
 * that names, national IDs, credentials and session tokens never appear at all.
 * A redaction list alone would not be enough: it only covers paths somebody
 * remembered to name. So there are two layers here.
 *
 *   1. `REDACTED_PATHS`, pino's own redaction, for the fields we know about.
 *   2. `scrubValue`, a final sweep over everything actually emitted, which
 *      masks anything shaped like a Kenyan MSISDN wherever it appears,
 *      including inside a message string somebody interpolated by hand.
 *
 * Layer 2 exists because the failure this guards against is not malice, it is
 * a tired person writing `log.info(\`paying ${msisdn}\`)` at 2am.
 */
import { pino, type DestinationStream, type Logger, type LoggerOptions } from 'pino';

/**
 * Fields that must never reach a log line, whatever they contain. Wildcards
 * cover the nested shapes these appear in across modules.
 */
export const REDACTED_PATHS = [
  'msisdn',
  '*.msisdn',
  '*.*.msisdn',
  'phone',
  '*.phone',
  'fullName',
  '*.fullName',
  'full_name',
  '*.full_name',
  'registeredName',
  '*.registeredName',
  'registered_name',
  '*.registered_name',
  'nationalId',
  '*.nationalId',
  'national_id',
  '*.national_id',
  'nationalIdEnc',
  '*.nationalIdEnc',
  // Credentials. docs/05: the crown jewels, never logged, never in an error.
  'password',
  '*.password',
  'securityCredential',
  '*.securityCredential',
  'initiatorPassword',
  '*.initiatorPassword',
  'credentials',
  '*.credentials',
  'credentialsCiphertext',
  '*.credentialsCiphertext',
  'callbackSecret',
  '*.callbackSecret',
  'callback_secret',
  '*.callback_secret',
  'sessionToken',
  '*.sessionToken',
  'authorization',
  '*.authorization',
  'cookie',
  '*.cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  // Raw gateway payloads belong in gateway_message, where they are access
  // controlled, never in the application log (docs/09).
  'payload',
  '*.payload',
  'body',
  '*.body',
] as const;

export const REDACTION_PLACEHOLDER = '[redacted]';

/**
 * A Kenyan MSISDN in any of the forms that reach us, anchored so it does not
 * chew through unrelated long digit runs like a correlation ID.
 */
const MSISDN_PATTERN = /(?<![\d])(?:\+?254|0)(7\d{8})(?![\d])/g;

/** Replaces any MSISDN-shaped run with the masked form from docs/05. */
export function scrubString(value: string): string {
  return value.replace(MSISDN_PATTERN, (_match, subscriber: string) => {
    const full = `254${subscriber}`;
    return `${full.slice(0, 4)}${'•'.repeat(full.length - 7)}${full.slice(-3)}`;
  });
}

/** Recursively scrubs a value about to be logged. Depth-capped, cycle-safe. */
export function scrubValue(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (depth > 8) return '[depth-limit]';
  if (typeof value === 'string') return scrubString(value);
  if (typeof value === 'bigint') return value.toString();
  if (value === null || typeof value !== 'object') return value;

  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((entry) => scrubValue(entry, seen, depth + 1));
  }
  if (value instanceof Error) {
    return { name: value.name, message: scrubString(value.message) };
  }

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    output[key] = scrubValue(entry, seen, depth + 1);
  }
  return output;
}

export interface LoggerConfig {
  readonly level?: string;
  readonly name?: string;
}

export function buildLoggerOptions(config: LoggerConfig = {}): LoggerOptions {
  return {
    level: config.level ?? 'info',
    ...(config.name === undefined ? {} : { name: config.name }),
    redact: {
      paths: [...REDACTED_PATHS],
      censor: REDACTION_PLACEHOLDER,
    },
    formatters: {
      // Runs after pino's own redaction, over whatever survived it.
      log(object: Record<string, unknown>): Record<string, unknown> {
        return scrubValue(object) as Record<string, unknown>;
      },
    },
    hooks: {
      // Covers the message string, which `formatters.log` does not see.
      logMethod(args, method) {
        const scrubbed = args.map((arg) =>
          typeof arg === 'string' ? scrubString(arg) : arg,
        ) as typeof args;
        method.apply(this, scrubbed);
      },
    },
  };
}

export function createLogger(config: LoggerConfig = {}, destination?: DestinationStream): Logger {
  const options = buildLoggerOptions(config);
  return destination === undefined ? pino(options) : pino(options, destination);
}
