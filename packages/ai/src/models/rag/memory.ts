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
// Memory-side hybrid search (DEC-05 split of rag.ts): journal / briefing /
// thread_synopsis recall from `memory_embeddings`, decayed the same way.
// ---------------------------------------------------------------------------

import { searchMemory, type MemoryRow } from '../../memory/memory-index';
import { DEFAULT_HALFLIFE_DAYS_MEMORY, type RunMemoryQueryArgs } from './types';

export async function runMemoryQuery(args: RunMemoryQueryArgs): Promise<MemoryRow[]> {
  const halflife = args.halflifeDays ?? DEFAULT_HALFLIFE_DAYS_MEMORY;
  const memArgs: Parameters<typeof searchMemory>[0] = {
    embedding: args.embedding,
    limit: args.limit,
    kinds: args.kinds,
    userId: args.userId,
  };
  if (args.symbol !== undefined) memArgs.symbol = args.symbol;
  if (args.since !== undefined) memArgs.since = args.since;
  if (args.model !== undefined) memArgs.model = args.model;
  const rows = await searchMemory(memArgs);
  return rows.map((r) => {
    const ageDays = Math.max(0, (Date.now() - r.occurredAtMs) / (24 * 60 * 60 * 1000));
    const factor = Math.exp(-Math.LN2 * (ageDays / halflife));
    return { ...r, similarity: r.similarity * factor };
  });
}
