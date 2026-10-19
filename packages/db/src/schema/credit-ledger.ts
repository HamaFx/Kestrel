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

// Credit billing — append-only double-entry-style ledger.
//
// Every money movement writes exactly one row. `(tenant_id, idempotency_key)`
// is unique, so replaying a webhook or a retried turn is a no-op.

import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { organization, users } from './auth';

export const CREDIT_LEDGER_KINDS = [
  'subscription_grant',
  'topup_grant',
  'promo_grant',
  'admin_adjustment',
  'consumption',
  'refund',
  'expiration',
  'reservation',
  'release',
  'reconcile',
] as const;

export type CreditLedgerKind = (typeof CREDIT_LEDGER_KINDS)[number];

export const creditLedger = pgTable(
  'credit_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id')
      .notNull()
      .default(sql`current_setting('app.current_tenant', true)`)
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<CreditLedgerKind>().notNull(),
    /** Positive = grant, negative = consumption/expiration. */
    amountCredits: bigint('amount_credits', { mode: 'number' }).notNull(),
    /** Denormalised balance after this movement; null when the claim was a no-op. */
    balanceAfter: bigint('balance_after', { mode: 'number' }),
    /** Shadow analytics row: not part of the authoritative money balance. */
    shadow: boolean('shadow').notNull().default(false),
    idempotencyKey: text('idempotency_key').notNull(),
    /** 'subscription' | 'payment' | 'reservation' | 'chat_turn' | 'manual' */
    referenceType: text('reference_type'),
    referenceId: text('reference_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('credit_ledger_idempotency_uk').on(t.tenantId, t.idempotencyKey),
    index('credit_ledger_user_created_idx').on(t.userId, t.createdAt),
    index('credit_ledger_kind_idx').on(t.kind),
    index('credit_ledger_tenant_created_idx').on(t.tenantId, t.createdAt),
  ],
);

export type CreditLedgerRow = typeof creditLedger.$inferSelect;
export type CreditLedgerInsert = typeof creditLedger.$inferInsert;
