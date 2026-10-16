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

// News adapter — public surface for "fetch latest articles".
//
// Provider priority:
//   1. Finnhub (when FINNHUB_API_KEY is set — 60 req/min free, forex category)
//   2. Marketaux (when MARKETAUX_API_KEY is set — entity tagging + sentiment)
//   3. BiQuote `/api/news/market` (always available — zero-key 15,000 req/min REST)

import { createHash } from 'node:crypto';

import {
  NewsArticleSchema,
  SymbolSchema,
  type NewsArticle,
  type Symbol,
  type SymbolOrCurrencyTag,
} from '@kestrel/shared';

import { runWithFailover, type ProviderAttempt } from '../failover';
import * as biquote from '../providers/biquote';
import * as finnhub from '../providers/finnhub';
import * as marketaux from '../providers/marketaux';

export interface FetchNewsOptions {
  /** Limit per provider call. Default 50. */
  limit?: number;
  /** Server-side filter — pulls only articles published after this ISO ts. */
  publishedAfter?: string;
  /** Restrict to articles tagged with this symbol after extraction. */
  symbol?: Symbol;
  signal?: AbortSignal;
  apiKeys?: Partial<{ finnhub: string; marketaux: string; biquoteBaseUrl: string }>;
}

function resolveKeys(opts: FetchNewsOptions) {
  return {
    finnhub: opts.apiKeys?.finnhub ?? process.env.FINNHUB_API_KEY ?? '',
    marketaux: opts.apiKeys?.marketaux ?? process.env.MARKETAUX_API_KEY ?? '',
    biquoteBaseUrl:
      opts.apiKeys?.biquoteBaseUrl ?? process.env.BIQUOTE_BASE_URL ?? 'https://biquote.io',
  };
}

/** Stable id derived from URL. We dedupe across providers using this. */
export function articleIdFromUrl(url: string): string {
  return createHash('sha1').update(url).digest('hex');
}

/**
 * Pull the latest news batch. Returns normalised `NewsArticle[]` ready to
 * upsert into `news_articles`. Caller handles the embedding step separately.
 *
 * Provider priority: Finnhub → Marketaux → BiQuote (zero-key automatic fallback).
 */
export async function fetchNews(opts: FetchNewsOptions = {}): Promise<NewsArticle[]> {
  const keys = resolveKeys(opts);
  if (opts.symbol !== undefined) SymbolSchema.parse(opts.symbol);

  const attempts: ProviderAttempt<NewsArticle[]>[] = [];

  // TIER 1: Finnhub — 60 req/min, dedicated forex category, high volume
  if (keys.finnhub) {
    attempts.push({
      name: 'finnhub',
      run: async () => {
        const raw = await finnhub.fetchNews({
          apiKey: keys.finnhub,
          category: 'forex',
          ...(opts.signal ? { signal: opts.signal } : {}),
        });

        let filtered = raw;
        if (opts.publishedAfter) {
          const cutoff = Date.parse(opts.publishedAfter);
          if (!Number.isNaN(cutoff)) {
            filtered = raw.filter((a) => a.datetime * 1000 >= cutoff);
          }
        }

        const limited = opts.limit ? filtered.slice(0, opts.limit) : filtered;

        return limited.map((a) => {
          const symbols = extractSymbolsFromText(a.headline, a.summary, a.related);
          return NewsArticleSchema.parse({
            id: articleIdFromUrl(a.url),
            title: a.headline,
            summary: a.summary || null,
            url: a.url,
            source: 'finnhub',
            publisher: a.source || null,
            publishedAt: a.datetime * 1000,
            symbols,
            sentiment: null,
            sentimentScore: null,
            topics: [],
          });
        });
      },
    });
  }

  // TIER 2: Marketaux — 100 req/day, entity tagging + sentiment
  if (keys.marketaux) {
    attempts.push({
      name: 'marketaux',
      run: async () => {
        const raw = await marketaux.fetchLatest({
          apiKey: keys.marketaux,
          ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
          ...(opts.publishedAfter ? { publishedAfter: opts.publishedAfter } : {}),
          ...(opts.signal ? { signal: opts.signal } : {}),
        });
        return raw.map((a) => {
          const symbols = marketaux.extractSymbols({
            entities: a.entities,
            title: a.title,
            snippet: a.snippet ?? null,
          });
          const sentiment = marketaux.aggregateSentiment(a.entities);
          return NewsArticleSchema.parse({
            id: articleIdFromUrl(a.url),
            title: a.title,
            summary: a.description ?? a.snippet ?? null,
            url: a.url,
            source: 'marketaux',
            publisher: a.source ?? null,
            publishedAt: Date.parse(a.published_at),
            symbols,
            sentiment: sentiment?.label ?? null,
            sentimentScore: sentiment?.score ?? null,
            topics: [],
          });
        });
      },
    });
  }

  // TIER 3 (Zero-Key Primary/Fallback): BiQuote `/api/news/market`
  attempts.push({
    name: 'biquote',
    run: async () => {
      const raw = await biquote.fetchMarketNews({
        ...(opts.symbol ? { symbol: opts.symbol } : {}),
        maxResults: Math.min(opts.limit ?? 25, 50),
        baseUrl: keys.biquoteBaseUrl,
        ...(opts.signal ? { signal: opts.signal } : {}),
      });

      let filtered = raw;
      if (opts.publishedAfter) {
        const cutoff = Date.parse(opts.publishedAfter);
        if (!Number.isNaN(cutoff)) {
          filtered = raw.filter((a) => Date.parse(a.publishedDate) >= cutoff);
        }
      }

      const limited = opts.limit ? filtered.slice(0, opts.limit) : filtered;

      return limited.map((a) => {
        const extracted = extractSymbolsFromText(a.title, a.description ?? '', opts.symbol);
        const symbols = opts.symbol
          ? [...new Set<SymbolOrCurrencyTag>([opts.symbol, ...extracted])]
          : extracted;
        const publishedAt = Date.parse(a.publishedDate);
        return NewsArticleSchema.parse({
          id: articleIdFromUrl(a.url),
          title: a.title,
          summary: a.description || null,
          url: a.url,
          source: 'biquote',
          publisher: a.publisher || null,
          publishedAt: Number.isNaN(publishedAt) ? Date.now() : publishedAt,
          symbols,
          sentiment: null,
          sentimentScore: null,
          topics: a.category ? [a.category] : [],
        });
      });
    },
  });

  const { value } = await runWithFailover(attempts);

  // Optional symbol filter applied AFTER mapping so we still benefit from
  // dedupe across symbols within a single fetch.
  if (opts.symbol) {
    return value.filter(
      (a) => a.symbols.includes(opts.symbol as Symbol) || a.symbols.includes('XAU'),
    );
  }
  return value;
}

// -----------------------------------------------------------------------------
// Text-based symbol extraction (Finnhub & BiQuote)
// -----------------------------------------------------------------------------

/** Keywords that map to our supported symbols/currencies. */
const SYMBOL_KEYWORDS: Array<[RegExp, SymbolOrCurrencyTag]> = [
  [/\b(XAU|gold|XAUUSD)\b/i, 'XAUUSD'],
  [/\b(EUR\/USD|EURUSD|euro)\b/i, 'EURUSD'],
  [/\b(GBP\/USD|GBPUSD|sterling|pound)\b/i, 'GBPUSD'],
  [/\b(USD\/JPY|USDJPY|yen)\b/i, 'USDJPY'],
  [/\b(AUD\/USD|AUDUSD|aussie)\b/i, 'AUDUSD'],
  [/\b(USD\/CAD|USDCAD|loonie)\b/i, 'USDCAD'],
  [/\b(NZD\/USD|NZDUSD|kiwi)\b/i, 'NZDUSD'],
  [/\b(USD\/CHF|USDCHF|swissy|franc)\b/i, 'USDCHF'],
  [/\b(BTC|bitcoin|BTCUSDT)\b/i, 'BTCUSDT'],
  [/\b(ETH|ethereum|ETHUSDT)\b/i, 'ETHUSDT'],
  [/\b(USD|dollar|greenback|DXY)\b/i, 'USD'],
  [/\b(EUR|euro)\b/i, 'EUR'],
  [/\b(GBP|pound|sterling)\b/i, 'GBP'],
  [/\b(Fed|FOMC|NFP|CPI|PCE)\b/i, 'USD'],
  [/\b(ECB)\b/i, 'EUR'],
  [/\b(BoE|BOE)\b/i, 'GBP'],
];

function extractSymbolsFromText(
  headline: string,
  summary: string,
  related?: string,
): SymbolOrCurrencyTag[] {
  const text = `${headline} ${summary} ${related ?? ''}`;
  const found = new Set<SymbolOrCurrencyTag>();
  for (const [pattern, tag] of SYMBOL_KEYWORDS) {
    if (pattern.test(text)) found.add(tag);
  }
  return [...found];
}
