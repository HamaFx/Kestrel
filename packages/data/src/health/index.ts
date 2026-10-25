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

// Per-provider rolling health snapshot — barrel for the split modules.
//
// Split by dependency: the in-memory sample store in `./state`, the
// Postgres-backed cross-instance mirror in `./db`, sample recording in
// `./record`, and scoring/predicates in `./score`.
//
// Every name previously exported from `src/health.ts` is re-exported here so
// `./health`, `../health`, `../src/health` and `@kestrel/data` imports keep
// resolving — and the sample/DB-cache maps stay single instances.

export { _resetHealth } from './state';
export { recordFailure, recordSuccess } from './record';
export { getHealth, getScore, isHardDown, type HealthSnapshot } from './score';
