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

// Input contract, config shape, and provider records for the web_search tool.

import { type WebSearchOutput, type WebSearchProvider } from '@kestrel/shared';
import { z } from 'zod';

export const InputSchema = z.object({
  query: z.string().trim().min(3).max(500),
  symbol: z.string().trim().min(2).max(20).optional(),
  topic: z
    .enum(['macro', 'central_bank', 'geopolitics', 'commodities', 'forex', 'crypto', 'general'])
    .default('macro'),
  recencyDays: z.int().min(1).max(30).default(7),
  maxResults: z.int().min(1).max(10).default(6),
  domains: z.array(z.string().trim().min(3).max(120)).max(5).optional(),
});

export type SearchInput = z.infer<typeof InputSchema>;

export type SearchConfig = {
  enabled: boolean;
  provider: WebSearchProvider;
  fallbacks: WebSearchProvider[];
  keys: Partial<Record<WebSearchProvider, string>>;
  maxResults: number;
  maxCallsPerTurn: number;
  cacheTtlMs: number;
  timeoutMs: number;
};

export type ProviderItem = {
  title?: unknown;
  url?: unknown;
  snippet?: unknown;
  content?: unknown;
  highlights?: unknown;
  publishedAt?: unknown;
  publishedDate?: unknown;
  published_date?: unknown;
};

export type CacheEntry = { cachedAt: number; expiresAt: number; value: WebSearchOutput };
export type ProviderAttempt = NonNullable<WebSearchOutput['providerAttempts']>[number];

export const PROVIDERS: readonly WebSearchProvider[] = ['exa', 'tavily', 'brave'];

export const PROVIDER_LABELS: Record<WebSearchProvider, string> = {
  exa: 'Exa',
  tavily: 'Tavily',
  brave: 'Brave Search',
};

declare module '@kestrel/shared' {
  interface ToolIOMap {
    web_search: { input: SearchInput };
  }
}
