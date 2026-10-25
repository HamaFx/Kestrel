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

// Environment-derived search configuration: provider order, keys, and the
// bounds that keep a single turn from hammering the providers.

import type { WebSearchProvider } from '@kestrel/shared';

import { PROVIDERS, type SearchConfig } from './types';
import { stringValue } from './values';

export function readSearchConfig(env?: Record<string, unknown>): SearchConfig {
  const source = env ?? (process.env as Record<string, unknown>);
  const provider = asProvider(source.WEB_SEARCH_PROVIDER) ?? 'exa';
  const fallbacks = String(source.WEB_SEARCH_FALLBACK_PROVIDERS ?? 'tavily,brave')
    .split(',')
    .map((value) => asProvider(value.trim()))
    .filter((value): value is WebSearchProvider => value !== null);

  return {
    enabled: asBoolean(source.WEB_SEARCH_ENABLED),
    provider,
    fallbacks,
    keys: {
      exa: stringValue(source.EXA_API_KEY),
      tavily: stringValue(source.TAVILY_API_KEY),
      brave: stringValue(source.BRAVE_SEARCH_API_KEY),
    },
    maxResults: asNumber(source.WEB_SEARCH_MAX_RESULTS, 6, 1, 10),
    maxCallsPerTurn: asNumber(source.WEB_SEARCH_MAX_CALLS_PER_TURN, 2, 1, 4),
    cacheTtlMs: asNumber(source.WEB_SEARCH_CACHE_TTL_SECONDS, 600, 30, 3600) * 1000,
    timeoutMs: asNumber(source.WEB_SEARCH_TIMEOUT_MS, 8000, 2000, 20000),
  };
}

export function orderedConfiguredProviders(config: SearchConfig): WebSearchProvider[] {
  const requested = [config.provider, ...config.fallbacks];
  const seen = new Set<WebSearchProvider>();
  return requested.filter((provider) => {
    if (seen.has(provider) || !config.keys[provider]) return false;
    seen.add(provider);
    return true;
  });
}

function asProvider(value: unknown): WebSearchProvider | null {
  return typeof value === 'string' && PROVIDERS.includes(value as WebSearchProvider)
    ? (value as WebSearchProvider)
    : null;
}

function asBoolean(value: unknown): boolean {
  return value === true || value === '1' || value === 'true';
}

function asNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.trunc(parsed))) : fallback;
}
