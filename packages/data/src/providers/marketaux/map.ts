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

// Marketaux entity ↔ internal symbol/currency tagging.
//
// Marketaux's entity model is stock-centric, but it does surface forex via
// `type=currency`. Symbol detection uses the shared 18-instrument catalog
// extractor so news coverage is not limited to three hardcoded pairs.

import {
  extractSymbolsFromText,
  isKnownSymbol,
  type CurrencyTag,
  type Symbol,
  type SymbolOrCurrencyTag,
} from '@kestrel/shared';

interface MarketauxEntity {
  symbol?: string | undefined;
  name?: string | undefined;
  type?: string | undefined;
  industry?: string | undefined;
  match_score?: number | undefined;
  sentiment_score?: number | undefined;
}

const FX_CURRENCY_TAGS: Record<string, CurrencyTag> = {
  USD: 'USD',
  EUR: 'EUR',
  GBP: 'GBP',
  // Marketaux occasionally reports gold/XAU as a "Commodities" entity rather
  // than a currency. We catch it via keyword detection in `extractSymbols`.
};

const GOLD_RE = /\b(gold|xau)\b/i;

/**
 * Derive symbol tags from a Marketaux article. We union:
 *   - explicit currency entities ($USD, $EUR, $GBP)
 *   - every catalog symbol mentioned in title/snippet (gold, FX, crypto)
 *   - the currency-style "XAU" tag for the currency filter
 *
 * Result is deduped; stocks and other non-catalog tickers fall out so the
 * news_articles.symbols column stays a tight, indexable set.
 */
export function extractSymbols(args: {
  entities: MarketauxEntity[];
  title: string;
  snippet: string | null;
}): SymbolOrCurrencyTag[] {
  const out = new Set<SymbolOrCurrencyTag>();

  // 1) Currency entities (Marketaux flags these explicitly).
  for (const e of args.entities) {
    if (e.type === 'currency' && e.symbol && FX_CURRENCY_TAGS[e.symbol]) {
      out.add(FX_CURRENCY_TAGS[e.symbol]!);
    }
  }

  const text = `${args.title} ${args.snippet ?? ''}`;

  // 2) Every catalog symbol mentioned in the article (all 18 instruments).
  for (const symbol of extractSymbolsFromText(text)) {
    if (isKnownSymbol(symbol)) out.add(symbol as Symbol);
  }

  // 3) Currency-style gold tag, so the currency filter also reaches gold news.
  if (GOLD_RE.test(text)) out.add('XAU');

  return [...out];
}

/**
 * Aggregate per-entity sentiment scores into a single article-level
 * (label, score). We weight by `match_score` so headlines that strongly
 * mention an entity dominate.
 *
 * Returns null if no entities had numeric sentiment — Marketaux occasionally
 * omits scores for less prominent stories.
 */
export function aggregateSentiment(
  entities: MarketauxEntity[],
): { label: 'positive' | 'negative' | 'neutral'; score: number } | null {
  let weightSum = 0;
  let weighted = 0;
  for (const e of entities) {
    if (typeof e.sentiment_score !== 'number') continue;
    const w = typeof e.match_score === 'number' ? Math.max(e.match_score, 0.001) : 1;
    weighted += e.sentiment_score * w;
    weightSum += w;
  }
  if (weightSum === 0) return null;
  const score = weighted / weightSum;
  const label = score > 0.15 ? 'positive' : score < -0.15 ? 'negative' : 'neutral';
  return { label, score };
}
