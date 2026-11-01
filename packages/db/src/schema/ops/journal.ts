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

import { sql } from 'drizzle-orm';
import { check, index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { organization, users } from '../core/auth';

export const journalEntries = pgTable(
  'journal_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Phase A — multi-user. References the NextAuth users table. */
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    /** "XAUUSD" | "EURUSD" | "GBPUSD". */
    symbol: text('symbol').notNull(),
    tenantId: text('tenant_id')
      .notNull()
      .default(sql`current_setting('app.current_tenant', true)`)
      .references(() => organization.id, { onDelete: 'cascade' }),
    /** "long" | "short". */
    side: text('side').notNull(),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    entry: numeric('entry', { precision: 20, scale: 8, mode: 'number' }).notNull(),
    stop: numeric('stop', { precision: 20, scale: 8, mode: 'number' }),
    target: numeric('target', { precision: 20, scale: 8, mode: 'number' }),
    exit: numeric('exit', { precision: 20, scale: 8, mode: 'number' }),
    /** Position size in lots (nullable — many users journal without sizing). */
    size: numeric('size', { precision: 20, scale: 8, mode: 'number' }),
    /** "win" | "loss" | "breakeven" | "open". */
    outcome: text('outcome').notNull().default('open'),
    rMultiple: numeric('r_multiple', { precision: 20, scale: 8, mode: 'number' }),
    notes: text('notes'),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Uploaded chart screenshot URL. */
    screenshotUrl: text('screenshot_url'),
    /** Storage paths; use Supabase Storage if/when we wire it. */
    attachments: text('attachments')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Phase 8 §41 — soft-delete support. Null = active. */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('journal_entries_tenant_opened_idx').on(t.tenantId, t.openedAt),
    index('journal_symbol_idx').on(t.symbol),
    index('journal_opened_idx').on(t.openedAt),
    // Phase 2 (0032) — soft-delete index, absent from the TypeScript schema.
    index('journal_entries_deleted_at_idx').on(t.deletedAt),
    // Phase 2 (0098) — listEntries(user_id, opened_at DESC) predicate.
    // Covers journal_entries_user_id_idx (dropped in 0122).
    index('journal_entries_user_opened_idx').on(t.userId, t.openedAt),
    // Phase 2 (0028) — outcome/closedAt consistency CHECK.
    check(
      'journal_outcome_closed_consistency',
      sql`(${t.outcome} = 'open' AND ${t.closedAt} IS NULL) OR (${t.outcome} IN ('win', 'loss', 'breakeven') AND ${t.closedAt} IS NOT NULL)`,
    ),
  ],
);
