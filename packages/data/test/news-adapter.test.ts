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

// E2E test for the news adapter covering Marketaux and zero-key BiQuote fallback.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { articleIdFromUrl, fetchNews } from '../src/adapters/news';
import { _resetThrottle } from '../src/cache/throttle';
import { _resetHealth } from '../src/health';

const ORIGINAL_FETCH = globalThis.fetch;

const SAMPLE_RESPONSE = {
  data: [
    {
      uuid: 'abc',
      title: 'Gold rallies on Fed dovish signals',
      description: 'XAU/USD surged after the Federal Reserve hinted at rate cuts.',
      snippet: null,
      url: 'https://example.com/gold-rally',
      source: 'Reuters',
      published_at: '2026-05-26T12:00:00Z',
      entities: [
        { type: 'currency', symbol: 'USD', sentiment_score: -0.4, match_score: 1 },
        { type: 'commodity', symbol: 'XAU', sentiment_score: 0.8, match_score: 1.5 },
      ],
    },
    {
      uuid: 'def',
      title: 'Apple unveils new iPhone',
      description: 'Stocks and consumer goods.',
      snippet: null,
      url: 'https://example.com/apple',
      source: 'Bloomberg',
      published_at: '2026-05-26T13:00:00Z',
      entities: [{ type: 'equity', symbol: 'AAPL' }],
    },
  ],
};

describe('fetchNews (marketaux & biquote zero-key fallback)', () => {
  beforeEach(() => {
    _resetThrottle();
    _resetHealth();
  });
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it('maps to NewsArticle shape with stable id and tags', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_RESPONSE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as unknown as typeof fetch;

    const articles = await fetchNews({ apiKeys: { marketaux: 'X' } });
    expect(articles).toHaveLength(2);

    const gold = articles[0]!;
    expect(gold.id).toBe(articleIdFromUrl('https://example.com/gold-rally'));
    expect(gold.title).toContain('Gold');
    expect(gold.publisher).toBe('Reuters');
    expect(gold.symbols).toEqual(expect.arrayContaining(['XAU', 'XAUUSD', 'USD']));
    expect(gold.sentiment).toBe('positive');
    expect(gold.sentimentScore).toBeGreaterThan(0);
  });

  it('filters by symbol when requested', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_RESPONSE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as unknown as typeof fetch;

    const articles = await fetchNews({
      symbol: 'XAUUSD',
      apiKeys: { marketaux: 'X' },
    });
    // Apple article filtered out.
    expect(articles.map((a) => a.title)).toEqual(['Gold rallies on Fed dovish signals']);
  });

  it('falls back to zero-key BiQuote /api/news/market when Finnhub and Marketaux keys are unset', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            title: 'Gold surges above $2,400 on safe-haven demand',
            description: 'XAUUSD rallied during the London session.',
            url: 'https://example.com/biquote-gold-news',
            publisher: 'Reuters',
            publishedDate: '2026-05-27T10:00:00Z',
            imageUrl: null,
            category: 'Commodities',
            language: 'en',
            country: 'US',
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ) as unknown as typeof fetch;

    const articles = await fetchNews({ apiKeys: {}, symbol: 'XAUUSD' });
    expect(articles).toHaveLength(1);
    expect(articles[0]).toMatchObject({
      id: articleIdFromUrl('https://example.com/biquote-gold-news'),
      title: 'Gold surges above $2,400 on safe-haven demand',
      summary: 'XAUUSD rallied during the London session.',
      source: 'biquote',
      publisher: 'Reuters',
    });
    expect(articles[0]?.symbols).toContain('XAUUSD');
  });
});
