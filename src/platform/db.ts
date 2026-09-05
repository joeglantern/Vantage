/**
 * Database access, and the tenancy boundary that sits on top of it.
 *
 * The integration tests in test/integration proved something uncomfortable
 * during M1.4: row level security is silently bypassed by a superuser no matter
 * how the policies are written, and the tests were passing for that reason
 * rather than because the policies worked. The fix there was a least privilege
 * `vantage_app` role. This module is where that fix becomes real in the running
 * process, because a policy nothing assumes the role under is decoration.
 *
 * Every query that touches tenant data goes through `withOrganisation`. It opens
 * a transaction, assumes the app role, sets the organisation for the duration,
 * and lets the database do the filtering. Application code never writes
 * `WHERE organisation_id = ...` for isolation, because the one time somebody
 * forgets is a cross-tenant leak, and in this product that means one charity
 * reading another charity's recipient list.
 */
import { Pool, type PoolClient } from 'pg';
import type { Logger } from 'pino';
import type { Config } from './config.js';

/**
 * The Postgres session variable the RLS policies read.
 *
 * Must stay the same string as the `current_org()` helper in the init
 * migration. If they drift, every policy quietly sees an unset tenant, which
 * fails closed to zero rows rather than opening a leak, but it is still an
 * outage nobody would immediately understand.
 */
export const ORGANISATION_SETTING = 'app.current_org';

/** The least privilege role every request runs as. Never the owner, never a superuser. */
export const APP_ROLE = 'vantage_app';

export interface Db {
  /**
   * Run `fn` inside a transaction scoped to one organisation, with RLS in force.
   *
   * The role is assumed with SET LOCAL, so it is released when the transaction
   * ends whatever happens, including on an error path. `set_config` is given
   * `true` for `is_local` for the same reason: a connection returned to the pool
   * must never carry another request's tenant with it.
   */
  withOrganisation<T>(organisationId: string, fn: (tx: PoolClient) => Promise<T>): Promise<T>;
  /**
   * Run `fn` with no tenant scope and without assuming the app role.
   *
   * For start-up checks and migrations only. It is named to be conspicuous in a
   * diff, because reaching for it to "just read one row" is how the boundary
   * above gets quietly undone.
   */
  unscoped<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

export function createDb(config: Config, logger: Logger): Db {
  const pool = new Pool({
    connectionString: config.database.url,
    max: config.database.poolSize,
    // A request that cannot get a connection should fail quickly and loudly
    // rather than pile up behind a saturated pool.
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });

  // An idle client that errors is a broken connection, not a broken request.
  // Without this handler the process dies on a Postgres restart.
  pool.on('error', (error) => {
    logger.error({ err: error }, 'idle database client errored');
  });

  async function transact<T>(
    fn: (client: PoolClient) => Promise<T>,
    prelude?: (client: PoolClient) => Promise<void>,
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (prelude !== undefined) await prelude(client);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        // The original error is the useful one; losing it to a rollback failure
        // would hide the actual cause.
        logger.error({ err: rollbackError }, 'rollback failed');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    async withOrganisation(organisationId, fn) {
      return transact(fn, async (client) => {
        await client.query(`SET LOCAL ROLE ${APP_ROLE}`);
        // Parameterised, not interpolated. The organisation id reaches here from
        // a session and must never be able to close a quote.
        await client.query('SELECT set_config($1, $2, true)', [
          ORGANISATION_SETTING,
          organisationId,
        ]);
      });
    },

    async unscoped(fn) {
      return transact(fn);
    },

    async ping() {
      const client = await pool.connect();
      try {
        await client.query('SELECT 1');
      } finally {
        client.release();
      }
    },

    async close() {
      await pool.end();
    },
  };
}
