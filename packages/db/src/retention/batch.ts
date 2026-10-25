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

// Bounded DELETE helpers for the retention job. Table names and predicates
// are internal constants only; callers must never pass user input here.

import { sql } from 'drizzle-orm';

import type { getDb } from '../client';

// A single invocation intentionally processes one bounded batch per table.
// The worker/cron schedule repeats daily, so large backlogs drain over time
// without allowing a serverless request to run unbounded DELETE loops.
export const MAX_BATCHES_PER_TABLE = 1;
export const BATCH_SIZE = 1_000;

/**
 * Delete rows from a table in bounded batches. Table names and predicates are
 * internal constants only; callers must never pass user input here.
 *
 * `schema` addresses tables outside the default schema (e.g. Mastra's runtime
 * `mastra` schema) without changing the bounded batching contract.
 */
export async function deleteBatchedWhere(
  db: ReturnType<typeof getDb>,
  tableName: string,
  predicate: string,
  batchSize = BATCH_SIZE,
  maxBatches = MAX_BATCHES_PER_TABLE,
  schema?: string,
): Promise<number> {
  const tableRef = schema ? `"${schema}"."${tableName}"` : `"${tableName}"`;
  let total = 0;
  let batches = 0;
  while (batches < maxBatches) {
    const result = await db.execute(
      sql.raw(
        `DELETE FROM ${tableRef} WHERE ctid IN (SELECT ctid FROM ${tableRef} WHERE ${predicate} LIMIT ${batchSize})`,
      ),
    );
    const count = Number((result as { count?: number | string }).count ?? 0);
    total += count;
    batches += 1;
    if (count < batchSize) return total;
  }
  return total;
}

/**
 * Existence check for tables this job does not own (Mastra runtime tables),
 * so a missing table never fails the whole retention run. Driver-shape
 * normalized: postgres-js (prod) returns a Result that extends Array.
 */
export async function pgTableExists(
  db: ReturnType<typeof getDb>,
  schema: string,
  table: string,
): Promise<boolean> {
  const rows = await db.execute<{ exists: boolean }>(
    sql`SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = ${schema} AND table_name = ${table}
    ) AS exists`,
  );
  const list = (
    Array.isArray(rows) ? rows : ((rows as { rows?: Array<{ exists: boolean }> }).rows ?? [])
  ) as Array<{ exists: boolean }>;
  return Boolean(list[0]?.exists);
}

export async function deleteBatched(
  db: ReturnType<typeof getDb>,
  tableName: string,
  whereColumn: string,
  cutoff: string,
  batchSize = BATCH_SIZE,
): Promise<number> {
  return deleteBatchedWhere(
    db,
    tableName,
    `"${whereColumn}" < '${cutoff}'`,
    batchSize,
    MAX_BATCHES_PER_TABLE,
  );
}
