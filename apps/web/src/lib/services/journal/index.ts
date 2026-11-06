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

// Journal service layer.
//
// Separates business logic from HTTP handling. Route handlers (controllers)
// call these service functions instead of importing @kestrel/ai directly.
// The service layer handles:
//   - Input validation (re-exports Zod schemas)
//   - Authorization checks (scoped to userId)
//   - Error wrapping (converts domain errors to typed results)
//   - Response formatting (returns typed DTOs)
//
// gets its own service file. Controllers remain thin: parse request →
// call service → format Response.

export {
  JournalCreateSchema,
  JournalPatchSchema,
  type EntryDTO,
  type JournalCreateInput,
  type JournalPatchInput,
} from './schemas';
export {
  createJournalEntryService,
  deleteJournalEntryService,
  getJournalEntryService,
  listJournalEntriesService,
  updateJournalEntryService,
} from './entries';
export { importJournalEntriesService, JournalImportPayloadSchema } from './import';
export { getTradeSetupReplayService, type TradeSetupReplayDTO } from './replay';

// Phase 3 Task 4 — journal domain re-exports for route handlers.
export { getEntry, reviewTrade } from '@kestrel/ai';
