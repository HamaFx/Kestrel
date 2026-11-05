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

// Macro provider fetches: every source is best-effort and settles internally,
// so a dead provider becomes a typed gap in the assembler instead of a failure.

import { fetchNews, fetchUpcomingEvents } from '@kestrel/data';
import { fetchObservations, fetchResonanceInputs } from '@kestrel/data/providers/fred';
import {
  tryGetSymbolDefinition,
  type CoTSample,
  type EconomicEvent,
  type NewsArticle,
  type Symbol,
} from '@kestrel/shared';

import { listCoTSamples } from '@ai/cot/persistence';

import {
  CALENDAR_WINDOW_DAYS,
  DAY_MS,
  GENERIC_MACRO_COT_WEEKS,
  GENERIC_MACRO_NEWS_LIMIT,
  MACRO_WINDOW_DAYS,
  MACRO_NEWS_LIMIT,
} from './limits';

type FredObservations = Awaited<ReturnType<typeof fetchObservations>>;
type FredResonance = Awaited<ReturnType<typeof fetchResonanceInputs>>;

export interface MacroFetchResult {
  news: PromiseSettledResult<NewsArticle[]>;
  events: PromiseSettledResult<EconomicEvent[]>;
  cot: PromiseSettledResult<CoTSample[]>;
  /** Present only for gold and USD-quoted instruments. */
  dollarIndex?: PromiseSettledResult<FredObservations>;
  resonance?: PromiseSettledResult<FredResonance>;
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function providerError(message: string): Error {
  const error = new Error(message);
  error.name = 'MacroProviderUnavailable';
  return error;
}

function wantsFredSeries(symbol: Symbol): boolean {
  const definition = tryGetSymbolDefinition(symbol);
  return definition?.category === 'gold' || definition?.quoteCurrency === 'USD';
}

/**
 * Collect every optional macro input for one symbol in parallel. Calendar,
 * COT, and FRED are skipped for instruments that do not support them; the
 * caller treats an omitted series as "not applicable", not as a gap.
 */
export async function fetchMacroData(
  symbol: Symbol,
  signal?: AbortSignal,
): Promise<MacroFetchResult> {
  const definition = tryGetSymbolDefinition(symbol);
  const now = Date.now();
  const newsLimit = symbol === 'XAUUSD' ? MACRO_NEWS_LIMIT : GENERIC_MACRO_NEWS_LIMIT;

  const eventsPromise: Promise<EconomicEvent[]> =
    definition && !definition.capabilities.supportsEconomicCalendar
      ? Promise.resolve([])
      : fetchUpcomingEvents({
          fromMs: now,
          toMs: now + CALENDAR_WINDOW_DAYS * DAY_MS,
          ...(signal ? { signal } : {}),
        });
  const cotPromise =
    definition && !definition.capabilities.supportsCftc
      ? Promise.resolve([])
      : listCoTSamples({ symbol, weeks: GENERIC_MACRO_COT_WEEKS });

  const [news, events, cot] = await Promise.allSettled([
    fetchNews({ symbol, limit: newsLimit, ...(signal ? { signal } : {}) }),
    eventsPromise,
    cotPromise,
  ]);

  if (!wantsFredSeries(symbol)) return { news, events, cot };

  const fredKey = process.env.FRED_API_KEY ?? '';
  const start = isoDate(now - MACRO_WINDOW_DAYS * DAY_MS);
  const end = isoDate(now);
  const [dollarIndex, resonance] = await Promise.allSettled([
    fredKey
      ? fetchObservations({
          apiKey: fredKey,
          seriesId: 'DTWEXBGS',
          start,
          end,
          ...(signal ? { signal } : {}),
        })
      : Promise.reject(providerError('FRED_API_KEY is not configured')),
    fredKey
      ? fetchResonanceInputs({ apiKey: fredKey, start, end, ...(signal ? { signal } : {}) })
      : Promise.reject(providerError('FRED_API_KEY is not configured')),
  ]);

  return { news, events, cot, dollarIndex, resonance };
}
