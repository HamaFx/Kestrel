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

// Phase 3 Task 4 — BYOK provider + usage service boundary.
//
// Provider key ownership, catalog validation, connection testing, and the
// usage summaries built from telemetry. Route handlers import these instead
// of reaching into `@kestrel/ai` directly.

import 'server-only';

export {
  BYOK_PROVIDERS,
  computeUsage,
  resolveProviderMode,
  testProviderKey,
  validateProviderConfig,
} from '@kestrel/ai';
export { getUserApiKeys } from '@kestrel/db';
