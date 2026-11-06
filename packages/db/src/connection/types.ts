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

// Shared client types for the Drizzle connection layer.

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type * as schema from '../schema/index';

/**
 * The application client type.
 *
 * `ReturnType<typeof drizzle>` resolves the overload with its default type
 * arguments, which erases the schema and leaves `db.query` typed as `{}`
 * across the whole workspace. Naming the schema keeps table and query types
 * intact everywhere a `DbClient` is passed around.
 *
 * Drizzle v1 replaces the schema generic with a relations generic:
 * `PostgresJsDatabase<typeof relations>` after `defineRelations()` lands.
 */
export type DbClient = PostgresJsDatabase<typeof schema>;

export interface TenantDbScopeOptions {
  userId?: string;
}
