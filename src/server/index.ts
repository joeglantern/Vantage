/**
 * The entry point.
 *
 * Order matters here. Configuration is validated before anything connects, the
 * database is reached before a port is bound, and the port is bound last. A
 * process that accepts a request it cannot serve is worse than one that never
 * started, because the first one looks healthy to whatever is watching it.
 *
 * Shutdown is equally deliberate. SIGTERM stops accepting new connections,
 * lets in-flight requests finish, then closes the pool. Killing a process
 * mid-transaction is survivable here because the database is the source of
 * truth, but a payout in flight deserves better than that on a routine deploy.
 */
import { loadConfig, describeConfig } from '@platform/config';
import { createLogger } from '@platform/logging';
import { createDb } from '@platform/db';
import { ConfigError } from '@domain/errors';
import { buildApp } from './app.js';

/** Until sessions exist this process serves exactly one organisation. */
const ORGANISATION_ID_VAR = 'VANTAGE_ORGANISATION_ID';

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const logger = createLogger({ level: config.logLevel });

  const organisationId = process.env[ORGANISATION_ID_VAR]?.trim() ?? '';
  if (organisationId === '') {
    throw new ConfigError(
      `${ORGANISATION_ID_VAR} is not set. This build serves one organisation ` +
        '(docs/08 phase 1). Run `npm run db:seed` to create one; it prints the id to set.',
    );
  }

  logger.info({ config: describeConfig(config) }, 'starting');

  const db = createDb(config, logger);
  try {
    await db.ping();
  } catch (error) {
    logger.error({ err: error }, 'cannot reach the database, refusing to start');
    await db.close();
    process.exitCode = 1;
    return;
  }

  const app = await buildApp({ config, logger, db, organisationId });

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    // A second signal during a slow drain should not start a second shutdown.
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    void (async () => {
      try {
        await app.close();
        await db.close();
        process.exitCode = 0;
      } catch (error) {
        logger.error({ err: error }, 'shutdown failed');
        process.exitCode = 1;
      }
    })();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await app.listen({ port: config.port, host: config.host });
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    // A configuration fault is for a person reading a terminal, not a log
    // aggregator, so it goes to stderr as plain text and skips the stack.
    process.stderr.write(`\n${error.message}\n\n`);
    process.exitCode = 1;
    return;
  }
  process.stderr.write(`\nFailed to start.\n${String(error)}\n\n`);
  process.exitCode = 1;
});
