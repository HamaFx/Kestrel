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

// Backtesting persistence helpers.
//
// Every query is scoped by `user_id` and relies on the tenant RLS policy set
// by the caller's `withTenantDb` scope (chat tools, plugin API routes, and
// install hooks all run inside one).
//
// This barrel keeps the previous `db/queries` import path working; the run
// queries live in `runs.ts`, the strategy library in `strategies.ts` and the
// sweep queries in `sweeps.ts`.

export * from './runs';
export * from './strategies';
export * from './sweeps';
