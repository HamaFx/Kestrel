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

// Drizzle client. Node runtime only — postgres-js does not work on Edge.
// Routes that touch this module must export `runtime = 'nodejs'`.
//
// Implementation lives in `./connection/`: physical pools (`pools.ts`),
// tenant/RLS scope resolution (`scope.ts`), retry (`retry.ts`), and the
// health probe (`health.ts`).

import * as schema from './schema/index';

export { closeAdminDb, closeDb, closeReplicaDb, getPrimaryDb } from './connection/pools';
export {
  getAdminDb,
  getDb,
  getDbRO,
  getTenantDbScope,
  hasTenantDbScope,
  isRlsEnabled,
  withAdminDb,
  withTenantDb,
  withTenantDbFresh,
  withTenantDbRO,
} from './connection/scope';
export { withDbRetry } from './connection/retry';
export { checkDbHealth } from './connection/health';
export type { DbClient, TenantDbScopeOptions } from './connection/types';

export { schema };
