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

// Credit billing — one-time top-up packs.

import { sql } from 'drizzle-orm';
import { bigint, boolean, check, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const creditTopupProducts = pgTable(
  'credit_topup_products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    credits: bigint('credits', { mode: 'number' }).notNull(),
    priceUsdCents: integer('price_usd_cents').notNull(),
    stripePriceId: text('stripe_price_id'),
    nowpaymentsCurrency: text('nowpayments_currency').default('usdt'),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('credit_topup_products_credits_positive', sql`${t.credits} > 0`),
    check('credit_topup_products_price_positive', sql`${t.priceUsdCents} > 0`),
  ],
);

export type CreditTopupProductRow = typeof creditTopupProducts.$inferSelect;
export type CreditTopupProductInsert = typeof creditTopupProducts.$inferInsert;
