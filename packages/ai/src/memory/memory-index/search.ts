/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Cosine-similarity search over `memory_embeddings`.

import { requireTenantIdForUser, withTenantDb } from '@kestrel/db';
import type { Symbol } from '@kestrel/shared';
import { sql } from 'drizzle-orm';

import { vectorLiteral } from '../../models/embeddings';
import type { MemoryKind, MemoryRow } from './types';

export interface SearchMemoryArgs {
  embedding: number[];
  limit: number;
  kinds?: MemoryKind[];
  symbol?: Symbol;
  /** ms epoch lower bound on occurredAt. */
  since?: number;
  /** Phase A — multi-tenant scope. Required unless explicitly skipping. */
  userId: string;
  /** Phase 3 — future org/workspace tenant boundary. Defaults to userId today. */
  tenantId?: string;
  /**
   * Embedding model id used to produce `embedding`. When set, only vectors
   * from the same embedding space are compared — otherwise cosine distance
   * across incompatible models yields meaningless similarity scores.
   */
  model?: string;
}

/**
 * Cosine-similarity search over `memory_embeddings`. Returns rows with
 * similarity in [0, 1]. Caller is responsible for any time-decay
 * post-processing.
 */
export async function searchMemory(args: SearchMemoryArgs): Promise<MemoryRow[]> {
  const { embedding, limit, kinds, symbol, since } = args;
  const tenantId = await requireTenantIdForUser(args.userId);
  if (args.tenantId !== undefined && args.tenantId !== tenantId) {
    throw new Error('Memory search tenant does not match the user membership.');
  }
  const vec = vectorLiteral(embedding);

  // Build dynamic WHERE clauses while keeping drizzle's parametrisation.
  const kindClause =
    kinds && kinds.length > 0
      ? sql`AND kind IN (${sql.join(
          kinds.map((k) => sql`${k}`),
          sql`, `,
        )})`
      : sql``;
  const symbolClause = symbol ? sql`AND symbol = ${symbol}` : sql``;
  const sinceClause = since !== undefined ? sql`AND occurred_at >= ${new Date(since)}` : sql``;
  const tenantClause = sql`AND tenant_id = ${tenantId}`;
  const userClause = sql`AND user_id = ${args.userId}`;
  const modelClause = args.model ? sql`AND model = ${args.model}` : sql``;

  const result = await withTenantDb(
    tenantId,
    async (db) => {
      await db.execute(sql`SET LOCAL hnsw.ef_search = 100`);
      await db.execute(sql`SET LOCAL hnsw.iterative_scan = 'relaxed_order'`);
      await db.execute(sql`SET LOCAL hnsw.max_scan_tuples = 20000`);

      return db.execute(sql`
      SELECT
        id,
        kind,
        source_id AS "sourceId",
        symbol,
        text,
        model,
        meta,
        occurred_at AS "occurredAt",
        1 - (embedding <=> ${vec}::vector) AS similarity
      FROM memory_embeddings
      WHERE 1 = 1
        ${kindClause}
        ${symbolClause}
        ${sinceClause}
        ${tenantClause}
        ${userClause}
        ${modelClause}
      ORDER BY embedding <=> ${vec}::vector
      LIMIT ${limit}
    `);
    },
    { userId: args.userId },
  );

  // db.execute() returns a RowList in drizzle-orm v0.40+.
  // Cast through unknown to access the underlying postgres-js result rows.
  const rows = result as unknown as MemoryRow[];
  return (rows as Array<MemoryRow & { occurredAt: Date | string }>).map((r) => {
    const occurredMs =
      r.occurredAt instanceof Date ? r.occurredAt.getTime() : Date.parse(String(r.occurredAt));
    return {
      id: r.id,
      kind: r.kind as MemoryKind,
      sourceId: r.sourceId,
      symbol: (r.symbol as Symbol | null) ?? null,
      text: r.text,
      model: r.model,
      meta: r.meta,
      similarity: Math.max(0, Math.min(1, Number(r.similarity))),
      occurredAtMs: Number.isFinite(occurredMs) ? occurredMs : Date.now(),
    };
  });
}
