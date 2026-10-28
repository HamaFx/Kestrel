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

// SPDX-License-Identifier: Apache-2.0

/**
 * Per-call memory wiring for Kestrel Mastra agents (Phase 1).
 *
 * - `memoryCallOptions()` — the per-call `memory: { thread, resource }` shape
 *   (resource = userId, strict user scoping).
 * - `seedWorkingMemoryFromSettings()` — one-time migration that writes
 *   Drizzle userSettings (defaultSymbol, language, timezone, chat model,
 *   per-domain default models, embedding model) into Mastra working memory.
 *   Idempotent: only writes when no working memory exists yet.
 * - `backfillThreadHistoryIfNeeded()` — one-time, per-thread copy of recent
 *   Drizzle chat history into Mastra storage so threads that predate the
 *   migration keep their context when the agent loads `lastMessages`.
 *
 * The old `loadMastraMemoryContext`/`serializeMastraMemoryContext` path in
 * `mastra/memory-context.ts` is replaced by native Mastra memory.
 *
 *   - call-options.ts        — per-call thread/resource shape
 *   - working-memory-seed.ts — Drizzle → working-memory seed
 *   - backfill.ts            — pre-migration thread-history backfill
 *   - prepare.ts             — combined per-request preparation
 *   - log.ts                 — categorized logger
 */

export { memoryCallOptions, type MemoryCallOptionsArgs } from './call-options';
export {
  seedWorkingMemoryFromSettings,
  mergeTraderProfileIntoWorkingMemory,
  syncTraderProfileToWorkingMemory,
  TRADER_PROFILE_HEADING,
  TRADER_PROFILE_MAX_CHARS,
  type SyncTraderProfileArgs,
  type TraderProfileSummary,
  type WorkingMemorySeedArgs,
  type WorkingMemorySeedResult,
} from './working-memory-seed';
export { backfillThreadHistoryIfNeeded } from './backfill';
export {
  prepareKestrelMemory,
  type PrepareKestrelMemoryArgs,
  type PreparedKestrelMemory,
} from './prepare';
