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

// PF-01 — Alert count query used by the Telegram bot's account summary.
//
// Alert CRUD (create/list/get/update/delete/fire) is owned by
// `@kestrel/ai` (`src/alerts/persistence/crud.ts`), which validates rules
// with `AlertRuleSchema` before insert. Do not re-implement it here.

import { and, eq, sql } from 'drizzle-orm';

import { getDb, schema } from '../client';

/** Count active alerts for a tenant. */
export async function countActiveAlerts(tenantId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.alerts)
    .where(and(eq(schema.alerts.tenantId, tenantId), eq(schema.alerts.active, true)));
  return row?.count ?? 0;
}
