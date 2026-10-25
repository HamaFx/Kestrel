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

// PF-22 — Journal schemas and response DTOs.

import {
  SymbolSchema,
  TradeOutcomeSchema,
  TradeSideSchema,
  type JournalEntry,
} from '@kestrel/shared';
import { z } from 'zod';

// ── Schemas (shared between controller and tests) ──────────────────────────

export const JournalCreateSchema = z.object({
  symbol: SymbolSchema,
  side: TradeSideSchema,
  openedAt: z.int(),
  entry: z.number(),
  stop: z.number().nullable().optional(),
  target: z.number().nullable().optional(),
  size: z.number().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  tags: z.array(z.string().max(40)).max(10).optional(),
  screenshotUrl: z.string().nullable().optional(),
});

export const JournalPatchSchema = z.object({
  closedAt: z.int().nullable().optional(),
  exit: z.number().nullable().optional(),
  stop: z.number().nullable().optional(),
  target: z.number().nullable().optional(),
  size: z.number().nullable().optional(),
  outcome: TradeOutcomeSchema.optional(),
  notes: z.string().max(5000).nullable().optional(),
  tags: z.array(z.string().max(40)).max(10).optional(),
});

export type JournalCreateInput = z.infer<typeof JournalCreateSchema>;
export type JournalPatchInput = z.infer<typeof JournalPatchSchema>;

// ── DTOs ────────────────────────────────────────────────────────────────────

export interface EntryDTO {
  id: string;
  symbol: string;
  side: string;
  entry: number;
  exit: number | null;
  stop: number | null;
  target: number | null;
  size: number | null;
  notes: string | null;
  tags: string[];
  screenshotUrl: string | null;
  attachments: string[];
  openedAt: number;
  closedAt: number | null;
  outcome: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── DTO mappers ─────────────────────────────────────────────────────────────

/** Map domain JournalEntry → EntryDTO (number timestamps → Date objects). */
export function toEntryDTO(e: JournalEntry): EntryDTO {
  return {
    id: e.id,
    symbol: e.symbol,
    side: e.side,
    entry: e.entry,
    exit: e.exit,
    stop: e.stop,
    target: e.target,
    size: e.size,
    notes: e.notes,
    tags: e.tags,
    screenshotUrl: e.screenshotUrl ?? null,
    attachments: e.attachments ?? [],
    openedAt: e.openedAt,
    closedAt: e.closedAt,
    outcome: e.outcome,
    createdAt: new Date(e.createdAt),
    updatedAt: new Date(e.updatedAt),
  };
}
