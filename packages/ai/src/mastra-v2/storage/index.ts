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

// SPDX-License-Identifier: Apache-2.0

/**
 * Mastra runtime storage for the Kestrel Mastra instance (Phase 0).
 *
 * Mastra owns a namespaced set of runtime tables (threads, messages, workflow
 * snapshots, scores, datasets, experiments, background tasks, schedule
 * triggers, thread state) that live beside Kestrel's Drizzle business schema.
 * They are intentionally NOT part of the Drizzle migration chain: Mastra
 * initializes its own schema on first use (idempotent DDL), and PostgresStore
 * supports a `schemaName` so every runtime table stays under one `mastra`
 * namespace and can never collide with or be dropped by Drizzle migrations.
 *
 * Observability is deliberately NOT routed to this storage: Kestrel exports
 * traces to Langfuse (see `./instrumentation.ts`), so the high-volume
 * `observability` domain is not backed by Postgres.
 *
 *   - types.ts      — storage contracts (kind + result)
 *   - log.ts        — categorized logger
 *   - connection.ts — connection strings, TLS policy, storage-kind selection
 *   - retention.ts  — age-based retention policy
 *   - create.ts     — store construction
 *   - shared.ts     — globalThis-cached maintenance storage
 *   - lifecycle.ts  — schema init + retention pruning
 */

export {
  ensureLibsqlParent,
  mastraDirectConnectionString,
  mastraRuntimeConnectionString,
  mastraSslOptions,
  resolveMastraStorageKind,
} from './connection';
export { createMastraStorage } from './create';
export { _resetMastraStorageCache, closeMastraStorage, getSharedMastraStorage } from './shared';
export { initializeMastraStorage, pruneMastraStorage } from './lifecycle';
export type { MastraStorageKind, MastraStorageResult } from './types';
