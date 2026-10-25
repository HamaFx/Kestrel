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

// RAG layer barrel (DEC-05 split of rag.ts). Phase 7b upgrade:
//
//   - Dense cosine over `news_embeddings` (existing).
//   - Lexical Postgres FTS over `news_articles.title || summary` (new).
//   - Reciprocal-rank fusion combines the two — robust to either signal
//     being weak on its own ("FOMC minutes" needs lexical, "macro
//     volatility tonight" needs dense).
//   - Time-decay multiplier: similarity *= exp(-ageDays / halflifeDays).
//   - Optional memory expansion: when `kinds` includes journal /
//     briefing / thread_synopsis, results from `memory_embeddings` are
//     RRF-fused into the same ranked list.
//
// `search_knowledge` callers pass the existing news-only signature; the
// hybrid path is opt-in via the new `memoryKinds` argument so existing
// behaviour stays bit-stable when the agent doesn't ask for memory.
//
//   - types.ts       — row/query contracts + halflife constants
//   - queries.ts     — dense (HNSW) + lexical (FTS) primitives
//   - fusion.ts      — RRF fusion + time decay (pure, tested)
//   - search.ts      — hybrid news retrieval
//   - memory.ts      — journal/briefing/synopsis recall
//   - adapters.ts    — row → `SearchKnowledgeItem` mapping
//   - embed-query.ts — query embedding with the corpus model id

export { type RagRow, type RunMemoryQueryArgs, type RunRagQueryArgs } from './types';
export { runRagQuery } from './search';
export { decayRow, rrfFuse } from './fusion';
export { runMemoryQuery } from './memory';
export { countEmbeddings, memoryRowToItem, ragRowToItem } from './adapters';
export { embedQuery } from './embed-query';
