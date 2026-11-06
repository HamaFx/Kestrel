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

import type { relations } from '../schema/relations';

/**
 * The application client type.
 *
 * Drizzle v1 parameterises `PostgresJsDatabase` by the relations config, and
 * `defineRelations()` is what carries every table plus its query relations.
 * `ReturnType<typeof drizzle>` would resolve the default (empty) relations and
 * erase both table and query types workspace-wide.
 */
export type DbClient = PostgresJsDatabase<typeof relations>;

export interface TenantDbScopeOptions {
  userId?: string;
}
