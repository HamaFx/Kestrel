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

// P2-3 — DI-backed getDb() wrapper.
//
// This accessor now stays private to `@kestrel/ai`: applications import
// `getDb` from `@kestrel/db`, which owns the RLS-aware scope resolution.
// The wrapper remains for tests that override the AI container's DB factory
// (`container.register(DB, ...)`) without touching the shared package.

import {
  getAdminDb as getRawAdminDb,
  getDb as getRawDb,
  hasAdminDbScope,
  hasTenantDbScope,
  type DbClient,
} from '@kestrel/db';
import { container } from '@kestrel/shared';

import { DB } from './tokens';

/**
 * Register the real DB factory exactly once. Called by
 * `ensureAiBootstrapped()` and lazily by `getDb()` so importing this module
 * has no side effects. Tests may override with container.register(DB, ...).
 */
export function ensureDbRegistered(): void {
  if (container.has(DB)) return;
  container.register(DB, () => getRawDb());
}

/**
 * Returns the singleton Drizzle database client via the DI container.
 */
export function getDb(): DbClient {
  ensureDbRegistered();
  // The container caches the process-wide fallback client. Never use that
  // cached instance inside a scoped database context: tenant requests must
  // run on the transaction carrying `app.current_tenant`, and explicit
  // `withAdminDb` scopes must run on the BYPASSRLS admin connection. Both
  // are resolved by the raw `getDb()` through AsyncLocalStorage.
  if (hasTenantDbScope() || hasAdminDbScope()) return getRawDb();
  // Worker/cron AI code performs cross-tenant work and must use the explicit
  // BYPASSRLS admin connection when shared mode is enabled.
  if (process.env.KESTREL_RUNTIME === 'worker' && process.env.ADMIN_DATABASE_URL) {
    return getRawAdminDb();
  }
  return container.resolve(DB);
}
