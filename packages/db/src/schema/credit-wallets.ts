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

// Credit billing — the durable balance row.
//
// One wallet per user (not per organization) to align with the
// `daily_ai_spend` PK `(user_id, day)`. `tenant_id` still scopes the row for
// RLS and keeps the billing owner explicit for future team seats.

import { sql } from 'drizzle-orm';
import { bigint, check, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { organization, users } from './auth';

export const creditWallets = pgTable(
  'credit_wallets',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id')
      .notNull()
      .default(sql`current_setting('app.current_tenant', true)`)
      .references(() => organization.id, { onDelete: 'cascade' }),
    /** Spendable balance. 1 credit = $0.001. Never negative. */
    availableCredits: bigint('available_credits', { mode: 'number' }).notNull().default(0),
    lifetimeGranted: bigint('lifetime_granted', { mode: 'number' }).notNull().default(0),
    lifetimeConsumed: bigint('lifetime_consumed', { mode: 'number' }).notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('credit_wallets_tenant_idx').on(t.tenantId),
    check('credit_wallets_available_non_negative', sql`${t.availableCredits} >= 0`),
  ],
);

export type CreditWalletRow = typeof creditWallets.$inferSelect;
export type CreditWalletInsert = typeof creditWallets.$inferInsert;
