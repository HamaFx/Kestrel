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

// VACUUM ANALYZE pass over the highest-churn operational tables.

import { sql } from 'drizzle-orm';

import { getDb } from '../client';

/** Run VACUUM ANALYZE on the highest-churn operational tables. */
export async function runVacuumAnalyze(signal?: AbortSignal): Promise<void> {
  const db = getDb();
  const tables = [
    'chat_telemetry',
    'chat_tool_telemetry',
    'rate_limits',
    'provider_daily_quota',
    'diagnostic_traces',
    'persistence_outbox',
    'ai_budget_reservations',
    'chat_messages',
  ];
  for (const table of tables) {
    if (signal?.aborted) break;
    await db.execute(sql.raw(`VACUUM ANALYZE "${table}"`));
  }
}
