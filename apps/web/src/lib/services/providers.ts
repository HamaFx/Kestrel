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

import { testProviderKey, validateProviderConfig } from '@kestrel/ai';
import { readUserByokState, recordProviderTestResult } from '@kestrel/db';
import type { ProviderId } from '@kestrel/shared';

export { computeUsage } from '@kestrel/ai';
export { getUserApiKeys } from '@kestrel/db';

export type ProviderTestOutcome = { ok: true } | { ok: false; error: string; statusCode: number };

function failed(error: string, statusCode: number): ProviderTestOutcome {
  return { ok: false, error, statusCode };
}

/**
 * Test a provider key and persist the health result.
 *
 * When no plaintext key is supplied the stored vault value is resolved,
 * matching the write-only settings UI. The health row is written through the
 * shared `recordProviderTestResult` so this path cannot drift from the bulk
 * check or the admin platform config.
 */
export async function testProviderService(
  userId: string,
  provider: ProviderId,
  apiKey?: string,
): Promise<ProviderTestOutcome> {
  let key = apiKey;
  if (!key) {
    const state = await readUserByokState(userId);
    key = state.keys[provider];
    if (!key) return failed('No stored key for this provider', 400);
  }

  const validation = validateProviderConfig(provider, key);
  if (!validation.ok) {
    return failed(validation.reason ?? 'Invalid provider configuration', 400);
  }

  const result = await testProviderKey(provider, key);
  await recordProviderTestResult(userId, {
    providerId: provider,
    ok: result.ok,
    error: result.ok ? null : result.error,
  });

  return result.ok ? { ok: true } : failed(result.error, 400);
}
