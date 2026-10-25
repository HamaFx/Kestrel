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

// Evaluator state written back onto a rule (crossing detection).

import { requireTenantIdForUser, schema } from '@kestrel/db';
import { AlertRuleSchema, type AlertRule } from '@kestrel/shared';
import { and, eq } from 'drizzle-orm';

import { getDb } from '../../runtime/db';

/**
 * Update the cached `previousValue` on an indicatorCross rule so the next
 * evaluator tick can detect crossings. The full rule is rewritten to
 * preserve the discriminated-union shape — Drizzle's JSONB column doesn't
 * support partial paths.
 */
export async function setRulePreviousValue(
  userId: string,
  id: string,
  rule: AlertRule,
  value: number,
  tenantId?: string,
): Promise<void> {
  if (rule.type !== 'indicatorCross') return;
  const next = { ...rule, previousValue: value };
  // Re-validate: if the rule was edited concurrently, the in-memory copy
  // we patched may be stale, but the schema check still keeps malformed
  // shapes from landing in the DB.
  const validated = AlertRuleSchema.parse(next);
  const db = getDb();
  // Callers that evaluate many alerts per tick resolve the membership once
  // and pass it in; the fallback keeps every other caller unchanged.
  const tenant = tenantId ?? (await requireTenantIdForUser(userId, db));
  await db
    .update(schema.alerts)
    .set({ rule: validated })
    .where(
      and(
        eq(schema.alerts.id, id),
        eq(schema.alerts.userId, userId),
        eq(schema.alerts.tenantId, tenant),
      ),
    );
}
