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

// Provider adapters (Exa / Tavily / Brave). Each adapter is intentionally a
// small native-fetch call behind the shared `fetchJson` helper: no SDK, no
// extra dependency per optional provider.

import type { WebSearchProvider } from '@kestrel/shared';

import { fetchJson } from './http';
import { PROVIDER_LABELS, type ProviderItem, type SearchConfig, type SearchInput } from './types';
import { arrayValue } from './values';

export async function searchProvider(
  provider: WebSearchProvider,
  query: string,
  input: SearchInput,
  config: SearchConfig,
  signal?: AbortSignal,
): Promise<ProviderItem[]> {
  const apiKey = config.keys[provider];
  if (!apiKey) throw new Error(`${PROVIDER_LABELS[provider]} is not configured`);

  switch (provider) {
    case 'exa':
      return fetchExa(apiKey, query, input, config.timeoutMs, signal);
    case 'tavily':
      return fetchTavily(apiKey, query, input, config.timeoutMs, signal);
    case 'brave':
      return fetchBrave(apiKey, query, input, config.timeoutMs, signal);
  }
  throw new Error(`Unsupported web search provider: ${provider}`);
}

async function fetchExa(
  apiKey: string,
  query: string,
  input: SearchInput,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<ProviderItem[]> {
  const startPublishedDate = new Date(
    Date.now() - input.recencyDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const response = await fetchJson(
    'https://api.exa.ai/search',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        query,
        type: 'neural',
        numResults: input.maxResults,
        startPublishedDate,
        ...(input.domains?.length ? { includeDomains: input.domains } : {}),
        contents: { highlights: { maxCharacters: 1800 } },
      }),
    },
    timeoutMs,
    signal,
  );
  return arrayValue(response.results).map((item) => ({
    ...item,
    content:
      item.content ?? item.highlights ?? (item as ProviderItem & { highlight?: unknown }).highlight,
    publishedAt: item.publishedDate,
  }));
}

async function fetchTavily(
  apiKey: string,
  query: string,
  input: SearchInput,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<ProviderItem[]> {
  const response = await fetchJson(
    'https://api.tavily.com/search',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'advanced',
        topic: 'general',
        max_results: input.maxResults,
        days: input.recencyDays,
        include_answer: false,
        include_raw_content: false,
        ...(input.domains?.length ? { include_domains: input.domains } : {}),
      }),
    },
    timeoutMs,
    signal,
  );
  return arrayValue(response.results).map((item) => ({
    ...item,
    snippet: item.snippet ?? item.content,
    content: item.content,
    publishedAt: item.published_date,
  }));
}

async function fetchBrave(
  apiKey: string,
  query: string,
  input: SearchInput,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<ProviderItem[]> {
  const effectiveQuery = input.domains?.length
    ? `${query} ${input.domains.map((domain) => `site:${domain}`).join(' OR ')}`
    : query;
  const freshness = input.recencyDays <= 1 ? 'pd' : input.recencyDays <= 7 ? 'pw' : 'pm';
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', effectiveQuery);
  url.searchParams.set('count', String(input.maxResults));
  url.searchParams.set('freshness', freshness);
  const response = await fetchJson(
    url.toString(),
    {
      headers: {
        accept: 'application/json',
        'x-subscription-token': apiKey,
      },
    },
    timeoutMs,
    signal,
  );
  return arrayValue((response.web as { results?: unknown } | undefined)?.results);
}
