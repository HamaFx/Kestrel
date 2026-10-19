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

// Credit billing — pre-authorisation ledger, parallel to
// `ai_budget_reservations` but with credit semantics and a different lifecycle.

import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { organization, users } from './auth';

export type CreditReservationStatus = 'reserved' | 'reconciled' | 'released';

export const creditReservations = pgTable(
  'credit_reservations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id')
      .notNull()
      .default(sql`current_setting('app.current_tenant', true)`)
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id'),
    traceId: text('trace_id'),
    runId: text('run_id'),
    jobId: text('job_id'),
    reservedCredits: bigint('reserved_credits', { mode: 'number' }).notNull(),
    actualCredits: bigint('actual_credits', { mode: 'number' }),
    status: text('status').$type<CreditReservationStatus>().notNull().default('reserved'),
    /** Shadow row: recorded for burn analysis without debiting the wallet. */
    shadow: boolean('shadow').notNull().default(false),
    /** Chat turn / job key. Nullable for manual reservations. */
    idempotencyKey: text('idempotency_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    lastError: text('last_error'),
  },
  (t) => [
    uniqueIndex('credit_reservations_idempotency_uk')
      .on(t.tenantId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL`),
    index('credit_reservations_user_idx').on(t.userId, t.status),
    index('credit_reservations_status_idx').on(t.status, t.createdAt),
    index('credit_reservations_run_idx').on(t.runId),
  ],
);

export type CreditReservationRow = typeof creditReservations.$inferSelect;
export type CreditReservationInsert = typeof creditReservations.$inferInsert;
