/**
 * Reading batches.
 *
 * Every amount crosses this boundary as a decimal string, never as a JSON
 * number. `BIGINT` minor units are exact and a double is not, and the moment a
 * total passes through a JS number it is one rounding away from a payout that
 * does not reconcile. docs/03 is unambiguous about this and it is the kind of
 * rule that only holds if it holds everywhere.
 *
 * The query does no tenant filtering of its own. That is not an omission: the
 * transaction runs as `vantage_app` with the organisation set, and row level
 * security does the filtering. A hand-written `WHERE organisation_id = ...`
 * here would work today and hide the day somebody forgets it.
 */
import type { App } from '../app.js';
import { Type } from '@sinclair/typebox';

const BatchSummary = Type.Object({
  reference: Type.String(),
  programme: Type.String(),
  status: Type.String(),
  items: Type.Integer(),
  /** Minor units, as a string. See the note at the top of this file. */
  totalMinor: Type.String(),
  currency: Type.String(),
  preparedBy: Type.String(),
  approvedBy: Type.Union([Type.String(), Type.Null()]),
  updatedAt: Type.String(),
});

const BatchListResponse = Type.Object({
  batches: Type.Array(BatchSummary),
});

/**
 * One row per batch with its item count and total.
 *
 * The aggregate is a lateral rather than a GROUP BY over a join, so a batch
 * with no items still appears with a count of zero instead of vanishing, and
 * the batch columns do not all have to be repeated in a grouping clause.
 *
 * COALESCE on the sum matters: SUM over no rows is NULL, and a batch that was
 * created but never populated would otherwise come back with a null total that
 * every caller has to special-case.
 */
const LIST_BATCHES = `
  SELECT
    b.reference,
    p.name                        AS programme,
    b.status,
    b.currency,
    agg.item_count                AS items,
    agg.total_minor               AS total_minor,
    prep.email                    AS prepared_by,
    appr.email                    AS approved_by,
    b.updated_at                  AS updated_at
  FROM payout_batch b
  JOIN programme p ON p.id = b.programme_id
  JOIN "user" prep ON prep.id = b.prepared_by
  LEFT JOIN "user" appr ON appr.id = b.approved_by
  CROSS JOIN LATERAL (
    SELECT
      COUNT(*)::int                        AS item_count,
      COALESCE(SUM(i.amount_minor), 0)     AS total_minor
    FROM payout_item i
    WHERE i.batch_id = b.id
  ) agg
  ORDER BY b.updated_at DESC
  LIMIT $1
`;

interface BatchRow {
  reference: string;
  programme: string;
  status: string;
  currency: string;
  items: number;
  /** node-postgres hands BIGINT and NUMERIC back as strings, which is what we want. */
  total_minor: string;
  prepared_by: string;
  approved_by: string | null;
  updated_at: Date;
}

export function batchRoutes(app: App): void {
  app.get(
    '/batches',
    {
      schema: {
        querystring: Type.Object({
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 50 })),
        }),
        response: { 200: BatchListResponse },
      },
    },
    async (request) => {
      const { limit = 50 } = request.query as { limit?: number };
      const { db, organisationId } = app.deps;

      const rows = await db.withOrganisation(organisationId, async (tx) => {
        const result = await tx.query<BatchRow>(LIST_BATCHES, [limit]);
        return result.rows;
      });

      return {
        batches: rows.map((row) => ({
          reference: row.reference,
          programme: row.programme,
          status: row.status,
          items: row.items,
          totalMinor: String(row.total_minor),
          currency: row.currency,
          preparedBy: row.prepared_by,
          approvedBy: row.approved_by,
          updatedAt: row.updated_at.toISOString(),
        })),
      };
    },
  );
}
