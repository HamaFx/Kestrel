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

// Result normalization: provider records → the deduplicated, sanitized
// source contract sent to the model.

import { createHash } from 'node:crypto';

import type { WebSearchProvider, WebSearchSource } from '@kestrel/shared';

import {
  quarantineExternalText,
  sanitizeExternalUrl,
} from '../../mastra-v2/packets/external-content';
import type { ProviderItem, SearchInput } from './types';
import { stringValue, textValue } from './values';

/** Build the search phrase sent to providers from the user query + context. */
export function buildQuery(input: SearchInput): string {
  const context = [input.symbol, input.topic].filter(Boolean).join(' ');
  return context ? `${input.query} (${context})` : input.query;
}

/**
 * Normalize and deduplicate provider records into the contract sent to the
 * model. Web content remains explicitly marked as untrusted by the tool's
 * description and is stripped of markup/control characters here.
 */
export function normalizeWebSearchResults(
  provider: WebSearchProvider,
  items: readonly ProviderItem[],
  maxResults: number,
): WebSearchSource[] {
  const seen = new Set<string>();
  const sources: WebSearchSource[] = [];

  for (const item of items) {
    const rawUrl = stringValue(item.url);
    if (!rawUrl) continue;

    const url = sanitizeExternalUrl(rawUrl);
    if (!url) continue;
    const parsed = new URL(url);
    if (seen.has(url)) continue;
    seen.add(url);

    const titleResult = quarantineExternalText(stringValue(item.title) || parsed.hostname, 240);
    const contentResult = quarantineExternalText(
      stringValue(item.content) ||
        textValue(item.highlights) ||
        stringValue((item as ProviderItem & { highlight?: unknown }).highlight),
      1800,
    );
    const snippetResult = quarantineExternalText(
      stringValue(item.snippet) || contentResult.text,
      500,
    );
    const title = titleResult.text;
    const content = contentResult.text;
    const snippet = snippetResult.text;

    sources.push({
      id: `${provider}:${createHash('sha256').update(url).digest('hex').slice(0, 16)}`,
      title,
      url,
      domain: parsed.hostname,
      snippet,
      ...(content ? { content } : {}),
      publishedAt: stringValue(item.publishedAt) || null,
    });

    if (sources.length >= maxResults) break;
  }

  return sources;
}
