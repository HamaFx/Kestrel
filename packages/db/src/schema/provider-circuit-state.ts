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

// Audit plan §1.6 (P1-4) — shared LLM provider circuit state.
//
// `packages/ai/src/model-circuit-breaker.ts` keeps an in-memory Map as an L1
// cache, but each serverless isolate used to own its own breaker, so a
// globally degraded provider kept receiving traffic from fresh isolates.
// This table is the cross-instance source of truth: failures write through
// (fire-and-forget) and readers merge DB state into L1 with a short TTL.

import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const providerCircuitState = pgTable('provider_circuit_state', {
  /** Model id (provider-prefixed) or bare provider id. */
  modelId: text('model_id').primaryKey(),
  /** Consecutive failures across all instances. */
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  /** When this circuit last transitioned to open (ms epoch). */
  openedAt: timestamp('opened_at', { withTimezone: true }),
  /** Last time this row was updated. */
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ProviderCircuitStateRow = typeof providerCircuitState.$inferSelect;
export type ProviderCircuitStateInsert = typeof providerCircuitState.$inferInsert;
