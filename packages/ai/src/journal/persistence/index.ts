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

// Journal CRUD + stats, scoped to the authenticated user and tenant.
//
// Stats math: realized R-multiple is computed at close time via
// `computeRMultiple(entry, stop, exit, side)` so the column is reliable.
// Open trades have rMultiple=null and don't contribute to avgR/winRate.
//
// Phase 7b: every successful create / update fires a best-effort
// re-embedding of the entry into the memory index so `search_knowledge`
// can recall journal context. The memory call is fire-and-forget — the
// CRUD response never waits on it.
//
//   - types.ts            — create/update input contracts
//   - rows.ts             — row → DTO mapping
//   - crud.ts             — create/get/list/update/delete entries
//   - stats/r-multiple.ts — R-multiple math
//   - stats/accumulate.ts — single-pass counters/groupings walk
//   - stats/summarize.ts  — stats contract assembly
//   - stats/query.ts      — tenant-scoped stats query

export type { CreateJournalInput, UpdateJournalInput } from './types';
export { listEntries, getEntry, createEntry, updateEntry, deleteEntry } from './crud';
export { computeRMultiple } from './stats/r-multiple';
export { summarize } from './stats/summarize';
export { computeStats } from './stats/query';
