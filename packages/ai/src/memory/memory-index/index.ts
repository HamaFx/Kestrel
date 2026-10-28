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

// Phase 7b — unified memory index over journal entries, briefings, and
// thread synopses produced by `summarize_thread`. `news_embeddings`
// remains the dedicated index for news (its tighter schema buys cheaper
// reads on the noisier corpus); `memory_embeddings` covers everything
// else.
//
// Public surface:
//   - rememberJournalEntry({ entryId })          — call after createEntry/updateEntry
//   - rememberBriefing({ messageId, body })       — call from briefings/generate/
//   - rememberThreadSynopsis({ threadId, userId, synopsis }) — called by summarize_thread
//   - searchMemory({ embedding, kinds, ... })     — used by search_knowledge
//
// Each `remember*` is best-effort and idempotent — on duplicate sourceId
// we delete-then-insert so the embedding always reflects the latest body.
// All paths are guarded by the daily AI budget so a runaway agent loop
// can't burn embedding spend in a side-effect.
//
//   - types.ts                   — memory contracts
//   - upsert.ts                  — embed + upsert core
//   - remember-journal.ts        — journal writer (+ text composition)
//   - remember-briefing.ts       — briefing writer
//   - remember-thread-synopsis.ts— thread-synopsis writer
//   - remember-regime.ts         — JEPA-style market-regime writer (Phase 3)
//   - search.ts                  — cosine-similarity search
//   - count.ts                   — tenant-scoped corpus probe

export type { MemoryKind, MemoryRow } from './types';
export {
  rememberJournalEntry,
  composeJournalText,
  type RememberJournalArgs,
} from './remember-journal';
export { rememberBriefing, type RememberBriefingArgs } from './remember-briefing';
export {
  rememberThreadSynopsis,
  type RememberThreadSynopsisArgs,
} from './remember-thread-synopsis';
export {
  composeRegimeStateText,
  rememberMarketRegime,
  type RegimeOutcome,
  type RememberMarketRegimeArgs,
} from './remember-regime';
export { searchMemory, type SearchMemoryArgs } from './search';
export { countMemory } from './count';
