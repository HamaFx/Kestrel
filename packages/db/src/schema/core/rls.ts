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

// Row-level security declarations for tenant-isolated tables.
//
// Every tenant table in Kestrel carries a `tenant_id` column defaulting from
// the request GUC `app.current_tenant`, and every one has the same
// `tenant_isolation` policy in SQL (migrations 0038, 0090, 0098, 0107–0113).
// Declaring the policy alongside the table keeps the TypeScript schema equal
// to the live `pg_policies` catalog: `drizzle-kit generate` no longer sees the
// policies as drift, and a table can never be added with RLS forgotten.
//
// Drizzle enables RLS automatically on tables that carry a policy, which is
// why the deprecated `.enableRLS()` chain is not used. The SQL migrations
// additionally run `FORCE ROW LEVEL SECURITY` so the table owner is subject
// to the policy as well.

import { sql } from 'drizzle-orm';
import { pgPolicy } from 'drizzle-orm/pg-core';

/**
 * The shared tenant-isolation policy.
 *
 * The GUC is read with `missing_ok = true` so an unset GUC yields NULL (no
 * rows) instead of raising. `withTenantDb*` sets it transaction-locally
 * before any statement runs.
 */
export function tenantIsolationPolicy() {
  return pgPolicy('tenant_isolation', {
    for: 'all',
    using: sql`tenant_id = current_setting('app.current_tenant', true)`,
    withCheck: sql`tenant_id = current_setting('app.current_tenant', true)`,
  });
}
