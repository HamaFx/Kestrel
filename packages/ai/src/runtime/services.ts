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

// P2-3 — DI container service registration bootstrap.
//
// Registers core services into the global `container` so consumers
// can `container.resolve<DbClient>('db')` instead of calling `getDb()`
// directly. This enables test-time mocking (container.register('db',
// () => mockDb)) and centralizes singleton lifecycle management.
//
// Import this module once at application startup (e.g. in the chat
// route handler or server init). It is idempotent — repeated imports
// won't duplicate registrations.

import { ensureDbRegistered } from './db';

/**
 * Register the DB client in the DI container.
 *
 * Note: The DB client is registered by `./db.ts` on first import —
 * no need to register anything else here. This avoids a circular
 * dependency through the AI barrel.
 */
export function ensureAiBootstrapped(): void {
  ensureDbRegistered();
}
