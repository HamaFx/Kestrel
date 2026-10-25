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

import { decayRow, rrfFuse } from './fusion';
import { runDenseNewsQuery, runFtsNewsQuery } from './queries';
import { DEFAULT_HALFLIFE_DAYS_NEWS, type RagRow, type RunRagQueryArgs } from './types';

/**
 * Hybrid news retrieval (dense + FTS) with time-decay. Returns at most
 * `limit` rows, RRF-fused.
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
  return decayed.slice(0, args.limit);
}
