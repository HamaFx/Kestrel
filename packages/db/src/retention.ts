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

// Retention barrel: config + bounded delete helpers (`config.ts`, `batch.ts`),
// the cleanup job (`cleanup.ts`), and the vacuum pass (`vacuum.ts`).

export { getRetentionConfigFromEnv, resolveRetention } from './retention/config';
export type { RetentionConfig, RetentionResult } from './retention/config';
export { runRetentionCleanup } from './retention/cleanup';
export { runVacuumAnalyze } from './retention/vacuum';
