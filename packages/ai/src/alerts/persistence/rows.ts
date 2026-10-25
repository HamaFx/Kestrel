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

// Alert row → DTO mapping.

import type { schema } from '@kestrel/db';
import { AlertChannelSchema, AlertRuleSchema, type Alert } from '@kestrel/shared';

export function rowToAlert(row: typeof schema.alerts.$inferSelect): Alert {
  return {
    id: row.id,
    rule: AlertRuleSchema.parse(row.rule),
    channels: ((row.channels ?? []) as string[])
      .map((c) => AlertChannelSchema.safeParse(c))
      .flatMap((r) => (r.success ? [r.data] : [])),
    note: row.note,
    active: row.active,
    firedAt: row.firedAt ? row.firedAt.getTime() : null,
    /**
     * Phase C — UX_UPGRADE_PLAN.md item 17. Pass through the
     * snooze state. `lastFiredAt` may be null on legacy rows
     * (the column was added in migration 0011); the schema
     * declares it optional so this is type-safe.
     */
    lastFiredAt: row.lastFiredAt ? row.lastFiredAt.getTime() : null,
    snoozeHours: row.snoozeHours ?? 0,
    userId: row.userId!,
    createdAt: row.createdAt.getTime(),
  };
}
