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

// P1 — Thread persistence (SRP split from persistence.ts).
// Thread CRUD + fork logic + the memory state a delete must clear. Messages
// and telemetry live in their own modules.
//
//   - types.ts          — DbThread, ThreadCursor, fork contracts, tx alias
//   - rows.ts           — row → DTO mapping
//   - cursor.ts         — pagination cursor encode/decode + validation error
//   - crud.ts           — list/get/create/update threads
//   - memory-cleanup.ts — derived memory rows + best-effort Mastra cleanup
//   - delete.ts         — single-thread and user-wide deletion
//   - fork.ts           — fork from an edited user message

export {
  type DbThread,
  type ThreadCursor,
  type ForkThreadInput,
  type ForkThreadResult,
} from './types';
export { InvalidThreadCursorError } from './cursor';
export {
  listThreads,
  getThread,
  createThread,
  updateThreadTitle,
  updateThreadPinnedSymbol,
  updateThreadAnalysisMode,
} from './crud';
export { deleteThread, deleteAllThreads } from './delete';
export { deriveForkedTitle, forkThread } from './fork';
