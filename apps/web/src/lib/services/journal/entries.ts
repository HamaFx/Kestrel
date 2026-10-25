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

// PF-22 — Journal CRUD service functions. Route handlers (controllers) call
// these instead of importing @kestrel/ai directly.

import {
  computeStats,
  createEntry,
  deleteEntry,
  getEntry,
  listEntries,
  updateEntry,
} from '@kestrel/ai';

import {
  toEntryDTO,
  type EntryDTO,
  type JournalCreateInput,
  type JournalPatchInput,
} from './schemas';

export async function listJournalEntriesService(
  userId: string,
  opts?: { symbol?: string },
): Promise<{ entries: EntryDTO[]; stats: Record<string, unknown> }> {
  const [entries, stats] = await Promise.all([listEntries(userId, opts), computeStats(userId)]);
  return { entries: entries.map(toEntryDTO), stats };
}

export async function createJournalEntryService(
  userId: string,
  input: JournalCreateInput,
): Promise<EntryDTO> {
  const entry = await createEntry({
    userId,
    symbol: input.symbol,
    side: input.side,
    openedAt: input.openedAt,
    entry: input.entry,
    stop: input.stop ?? null,
    target: input.target ?? null,
    size: input.size ?? null,
    notes: input.notes ?? null,
    tags: input.tags ?? [],
    screenshotUrl: input.screenshotUrl ?? null,
  });
  return toEntryDTO(entry);
}

export async function getJournalEntryService(userId: string, id: string): Promise<EntryDTO | null> {
  const entry = await getEntry(userId, id);
  return entry ? toEntryDTO(entry) : null;
}

export async function updateJournalEntryService(
  userId: string,
  id: string,
  input: JournalPatchInput,
): Promise<EntryDTO | null> {
  const entry = await updateEntry(userId, id, input);
  return entry ? toEntryDTO(entry) : null;
}

export async function deleteJournalEntryService(userId: string, id: string): Promise<boolean> {
  return deleteEntry(userId, id);
}
