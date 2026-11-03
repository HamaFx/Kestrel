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

// Typed client for /api/market/*. Used by hooks and AI tools.
// Phase B/P2 hardening: delegates to `api-client.ts` so market requests
// share the same timeout, CSRF, and error handling as the rest of the
// app. The old `MarketApiError` / `fetchWithTimeout` duplication is gone;
// `ApiError` from `api-client` is re-exported for backward compatibility.

import type { Symbol, Tick } from '@kestrel/shared';

import { apiFetch } from '../http/api-client';

export interface FetchOptions {
  signal?: AbortSignal;
}

/** GET /api/market/price?symbol=...&symbol=... */
export async function fetchPrices(
  symbols: readonly Symbol[],
  opts: FetchOptions = {},
): Promise<Tick[]> {
  const params = new URLSearchParams();
  for (const s of symbols) params.append('symbol', s);
  const body = await apiFetch<{ ticks: Tick[] }>(`/api/market/price?${params.toString()}`, {
    cache: 'no-store',
    ...(opts.signal ? { signal: opts.signal } : {}),
    retries: 2,
  });
  return body.ticks;
}
