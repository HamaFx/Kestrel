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

// ---------------------------------------------------------------------------
// Dense + FTS query primitives (DEC-05 split of rag.ts).
// ---------------------------------------------------------------------------

import type { Symbol } from '@kestrel/shared';
import { sql } from 'drizzle-orm';

import { getDb } from '../../runtime/db';
import { vectorLiteral } from '../embeddings';
import type { RagRow } from './types';

interface SubQueryArgs {
  embedding: number[];
  limit: number;
  model: string;
  since?: number | undefined;
  symbol?: Symbol | undefined;
}

interface FtsSubQueryArgs extends SubQueryArgs {
  query: string;
}

export async function runDenseNewsQuery(args: SubQueryArgs): Promise<RagRow[]> {
  const { embedding, limit, since, symbol, model } = args;
  const vec = vectorLiteral(embedding);
  const sinceClause = since !== undefined ? sql`AND na.published_at >= ${new Date(since)}` : sql``;
  const symbolClause =
    symbol !== undefined ? sql`AND na.symbols && ARRAY[${symbol}]::text[]` : sql``;

  // HNSW ANN search must run inside a transaction so we can raise
  // `hnsw.ef_search` / enable iterative scan before the index scan. Without
  // `iterative_scan`, the default `ef_search = 40` truncates the candidate
  // set before the `news_articles` post-filter, silently starving dense RAG.
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL hnsw.ef_search = 200`);
    await tx.execute(sql`SET LOCAL hnsw.iterative_scan = 'relaxed_order'`);
    await tx.execute(sql`SET LOCAL hnsw.max_scan_tuples = 20000`);

    const result = await tx.execute(sql<RagRow>`
      SELECT
        na.id,
        na.title,
        na.summary,
        na.url,
        na.source,
        na.publisher,
        na.published_at AS "publishedAt",
        na.sentiment,
        na.sentiment_score AS "sentimentScore",
        1 - (ne.embedding <=> ${vec}::vector) AS similarity
      FROM news_embeddings ne
      JOIN news_articles na ON na.id = ne.article_id
      WHERE ne.model = ${model}
        ${sinceClause}
        ${symbolClause}
      ORDER BY ne.embedding <=> ${vec}::vector
      LIMIT ${limit}
    `);

    // db.execute() returns a RowList in drizzle-orm v0.40+.
    // Cast through unknown to access the underlying postgres-js result rows.
    const rows = result as unknown as RagRow[];
    return rows.map((r) => ({
      ...r,
      publishedAt: r.publishedAt instanceof Date ? r.publishedAt : new Date(r.publishedAt),
      similarity: Number(r.similarity),
    }));
  });
}

export async function runFtsNewsQuery(args: FtsSubQueryArgs): Promise<RagRow[]> {
  const { query, limit, since, symbol } = args;
  // websearch_to_tsquery is the right primitive: tolerates raw user
  // strings ("FOMC minutes hawkish") without requiring `&` joining.
  const tsq = sql`websearch_to_tsquery('english', ${query})`;
  const sinceClause = since !== undefined ? sql`AND na.published_at >= ${new Date(since)}` : sql``;
  const symbolClause =
    symbol !== undefined ? sql`AND na.symbols && ARRAY[${symbol}]::text[]` : sql``;

  const result = await getDb().execute(sql<RagRow>`
    SELECT
      na.id,
      na.title,
      na.summary,
      na.url,
      na.source,
      na.publisher,
      na.published_at AS "publishedAt",
      na.sentiment,
      na.sentiment_score AS "sentimentScore",
      ts_rank_cd(
        to_tsvector('english', coalesce(na.title, '') || ' ' || coalesce(na.summary, '')),
        ${tsq}
      ) AS "ftsRank"
    FROM news_articles na
    WHERE to_tsvector('english', coalesce(na.title, '') || ' ' || coalesce(na.summary, ''))
      @@ ${tsq}
      ${sinceClause}
      ${symbolClause}
    ORDER BY "ftsRank" DESC
    LIMIT ${limit}
  `);

  // db.execute() returns a RowList in drizzle-orm v0.40+.
  // Cast through unknown to access the underlying postgres-js result rows.
  const rows = result as unknown as RagRow[];
  return (rows as RagRow[]).map((r) => ({
    ...r,
    publishedAt: r.publishedAt instanceof Date ? r.publishedAt : new Date(r.publishedAt),
    // FTS rank → pseudo-similarity for downstream uniformity. We never
    // expose `ftsRank`-derived similarity raw to the user; it gets fused
    // into a final similarity value via RRF + decay below.
    similarity: 0,
    ftsRank: Number(r.ftsRank),
  }));
}
