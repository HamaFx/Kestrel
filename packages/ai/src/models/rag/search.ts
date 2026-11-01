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
// Hybrid news retrieval (DEC-05 split of rag.ts): dense + lexical, fused.
// ---------------------------------------------------------------------------

import { quarantineAndRerankSnippets } from '../../jev/rag-quarantine';
import { decayRow, rrfFuse } from './fusion';
import { runDenseNewsQuery, runFtsNewsQuery } from './queries';
import { DEFAULT_HALFLIFE_DAYS_NEWS, type RagRow, type RunRagQueryArgs } from './types';

/**
 * Hybrid news retrieval (dense + FTS) with time-decay. Returns at most
 * `limit` rows, RRF-fused.
 *
 * Audit R15 — retrieved snippets pass through the indirect-injection screen
 * with the caller's posture:
 *
 *   - `strict`: never returns snippets the screen could not clear. If the
 *     model-backed screen is unavailable, nothing is returned.
 *   - `availability`: the deterministic screen still applies to every row; a
 *     degraded model screen keeps the input order and is reported.
 */
export async function runRagQuery(args: RunRagQueryArgs): Promise<RagRow[]> {
  const halflife = args.halflifeDays ?? DEFAULT_HALFLIFE_DAYS_NEWS;
  // PERF-11: Hard cap the pool to prevent runaway vector scans.
  // pool = min(limit * 4, MAX_POOL). At limit=50 this gives 200 rows —
  // enough for quality RRF fusion while keeping Postgres ANN scan O(1).
  const MAX_POOL = 200;
  const POOL = Math.min(Math.max(args.limit * 4, 16), MAX_POOL);

  const [dense, lexical] = await Promise.all([
    runDenseNewsQuery({ ...args, limit: POOL }),
    args.query !== undefined && args.query.trim().length > 0
      ? runFtsNewsQuery({ ...args, query: args.query, limit: POOL })
      : Promise.resolve<RagRow[]>([]),
  ]);

  const fused = rrfFuse([dense, lexical]);
  const decayed = fused.map((r) => decayRow(r, halflife));
  decayed.sort((a, b) => b.similarity - a.similarity);
  const top = decayed.slice(0, args.limit);
  if (top.length === 0) return top;

  // Availability + no Jev configuration at all: the deployer chose the
  // uncalibrated path. The strict posture never skips the screen.
  if (
    args.screenMode === 'availability' &&
    args.jevEnv === undefined &&
    args.jevSettings === undefined
  ) {
    return top;
  }

  const screened = await quarantineAndRerankSnippets({
    query: args.query ?? '',
    items: top.map((row) => ({
      id: row.id,
      text: [row.title, row.summary ?? ''].filter((part) => part.length > 0).join(' — '),
    })),
    mode: args.screenMode,
    settings: args.jevSettings ?? null,
    env: args.jevEnv ?? null,
    ...(args.jevSignal !== undefined ? { signal: args.jevSignal } : {}),
    ...(args.jevFetchImpl !== undefined ? { fetchImpl: args.jevFetchImpl } : {}),
    ledgerEntryId: 'rag-query',
    reportPath: 'rag',
    reportSink: args.reportSink ?? null,
  });
  if (screened.failedClosed) {
    // Strict posture: the screen could not clear these rows, so none of them
    // reach the model. The reason is recorded in the run report and metrics.
    return [];
  }
  const byId = new Map(top.map((row) => [row.id, row]));
  return screened.kept.flatMap((item) => {
    const row = byId.get(item.id);
    return row ? [row] : [];
  });
}
