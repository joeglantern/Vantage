/**
 * Liveness and readiness.
 *
 * They are separate on purpose. Liveness answers "is this process wedged", and
 * a restart is the only sensible response to a no. Readiness answers "can it
 * serve traffic right now", and the answer is legitimately no for a while
 * during a database failover, when restarting would make things worse.
 *
 * Conflating them is how a deployment restart-loops through an outage that
 * would have healed on its own.
 */
import type { App } from '../app.js';
import { Type } from '@sinclair/typebox';

const HealthResponse = Type.Object({
  status: Type.String(),
  uptimeSeconds: Type.Number(),
});

const ReadyResponse = Type.Object({
  status: Type.String(),
  checks: Type.Object({
    database: Type.String(),
  }),
});

export function healthRoutes(app: App): void {
  app.get(
    '/health',
    { schema: { response: { 200: HealthResponse } } },
    () => ({
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
    }),
  );

  app.get(
    '/ready',
    { schema: { response: { 200: ReadyResponse, 503: ReadyResponse } } },
    async (request, reply) => {
      try {
        await app.deps.db.ping();
        return { status: 'ready', checks: { database: 'ok' } };
      } catch (error) {
        request.log.error({ err: error }, 'readiness check failed');
        return reply
          .status(503)
          .send({ status: 'not_ready', checks: { database: 'unreachable' } });
      }
    },
  );
}
