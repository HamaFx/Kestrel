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

// In-process search-result cache. Keys are content-addressed over the
// provider + normalized query shape so a repeated call inside the TTL is
// served without touching a provider.

import { createHash } from 'node:crypto';

import type { WebSearchOutput, WebSearchProvider } from '@kestrel/shared';

import type { CacheEntry, SearchInput } from './types';

const CACHE_MAX_ENTRIES = 256;
const searchCache = new Map<string, CacheEntry>();

export function buildSearchCacheKey(input: SearchInput, provider: WebSearchProvider): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        provider,
        query: input.query.trim().toLowerCase(),
        symbol: input.symbol?.trim().toUpperCase() ?? null,
        topic: input.topic,
        recencyDays: input.recencyDays,
        maxResults: input.maxResults,
        domains: input.domains?.map((domain) => domain.toLowerCase()).sort() ?? [],
      }),
    )
    .digest('hex');
}

export function readCache(key: string): CacheEntry | null {
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    searchCache.delete(key);
    return null;
  }
  return entry;
}

export function writeCache(key: string, value: WebSearchOutput, ttlMs: number): void {
  if (searchCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = searchCache.keys().next().value;
    if (typeof oldest === 'string') searchCache.delete(oldest);
  }
  const cachedAt = Date.now();
  searchCache.set(key, { cachedAt, expiresAt: cachedAt + ttlMs, value });
}
