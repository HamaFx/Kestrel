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

// Billing — provider-agnostic webhook event registry.
//
// Stripe retries deliveries and can deliver the same event twice. This table
// is the claim/lease ledger that makes processing exactly-once at the
// application level. NOWPayments keeps its richer `ipn_events` table for
// payload-level dedup; Stripe uses this registry.

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export type BillingEventStatus = 'processing' | 'processed' | 'failed';

export const billingEvents = pgTable(
  'billing_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: text('provider').notNull(),
    eventId: text('event_id').notNull(),
    eventType: text('event_type').notNull(),
    status: text('status').$type<BillingEventStatus>().notNull().default('processing'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    error: text('error'),
    attempts: integer('attempts').notNull().default(1),
    processing: boolean('processing').notNull().default(true),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('billing_events_provider_event_uk').on(t.provider, t.eventId),
    index('billing_events_status_idx').on(t.status, t.receivedAt),
  ],
);

export type BillingEventRow = typeof billingEvents.$inferSelect;
export type BillingEventInsert = typeof billingEvents.$inferInsert;
