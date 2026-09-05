/**
 * The HTTP application.
 *
 * Built as a function taking its dependencies rather than reaching for module
 * globals, so a test can stand one up against a throwaway database without a
 * running process or a port.
 *
 * There is no authentication here yet, and that is a deliberate gap rather than
 * an oversight: docs/05 puts sessions, MFA and the maker-checker roles in their
 * own milestone, and a half-built auth layer is worse than an obviously absent
 * one. Until it lands, the organisation is resolved from configuration and the
 * server binds to localhost only.
 */
import Fastify, {
  type FastifyInstance,
  type RawReplyDefaultExpression,
  type RawRequestDefaultExpression,
  type RawServerDefault,
} from 'fastify';
import type { Logger } from 'pino';
import type { Config } from '@platform/config';
import type { Db } from '@platform/db';
import { errorHandler } from './errors.js';
import { healthRoutes } from './routes/health.js';
import { batchRoutes } from './routes/batches.js';

export interface AppDeps {
  readonly config: Config;
  readonly logger: Logger;
  readonly db: Db;
  /**
   * The single tenant this process serves, until sessions exist.
   * Phase 1 in docs/08 is explicitly one organisation with hardcoded config.
   */
  readonly organisationId: string;
}

/**
 * The application's own instance type.
 *
 * Handing Fastify a concrete pino logger specialises every generic on the
 * instance, so the bare `FastifyInstance` no longer describes it and route
 * modules stop matching. Naming the specialised type once is better than
 * casting the logger at the call site: a cast satisfies tsc and then eslint
 * correctly points out that it is redundant, which is how that ends up being
 * changed back and forth forever.
 */
export type App = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  Logger
>;

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
}

export async function buildApp(deps: AppDeps): Promise<App> {
  const app = Fastify({
    loggerInstance: deps.logger,
    // Fastify's default is to trust no proxy, which is right: an untrusted
    // X-Forwarded-For would let a caller forge the address in the audit log.
    trustProxy: false,
    // A batch of a few thousand rows is legitimately large, but not unbounded.
    bodyLimit: 12 * 1024 * 1024,
    disableRequestLogging: false,
  });

  app.decorate('deps', deps);
  app.setErrorHandler(errorHandler);

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      error: { code: 'not_found', message: `No route for ${request.method} ${request.url}.` },
    }),
  );

  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(batchRoutes, { prefix: '/api' });

  return app;
}
