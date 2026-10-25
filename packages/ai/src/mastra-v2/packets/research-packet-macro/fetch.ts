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
import { tryGetSymbolDefinition, type EconomicEvent, type Symbol } from '@kestrel/shared';

import { listCoTSamples } from '@ai/cot/persistence';

import { XAUUSD } from '../../shared/types';
import {
  CALENDAR_WINDOW_DAYS,
  DAY_MS,
  GENERIC_MACRO_COT_WEEKS,
  GENERIC_MACRO_NEWS_LIMIT,
  MACRO_WINDOW_DAYS,
} from './limits';

export interface GenericMacroFetchResult {
  news: PromiseSettledResult<Awaited<ReturnType<typeof fetchNews>>>;
  events: PromiseSettledResult<Awaited<ReturnType<typeof fetchUpcomingEvents>>>;
  cot: PromiseSettledResult<Awaited<ReturnType<typeof listCoTSamples>>>;
}

export interface XauusdMacroFetchResult {
  news: PromiseSettledResult<Awaited<ReturnType<typeof fetchNews>>>;
  events: PromiseSettledResult<Awaited<ReturnType<typeof fetchUpcomingEvents>>>;
  dollarIndex: PromiseSettledResult<Awaited<ReturnType<typeof fetchObservations>>>;
  resonance: PromiseSettledResult<Awaited<ReturnType<typeof fetchResonanceInputs>>>;
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function providerError(message: string): Error {
  const error = new Error(message);
  error.name = 'MacroProviderUnavailable';
  return error;
}

/** Collect optional macro inputs in parallel; missing providers remain typed gaps. */
export async function fetchXauusdMacroData(signal?: AbortSignal): Promise<XauusdMacroFetchResult> {
  const now = Date.now();
  const fredKey = process.env.FRED_API_KEY ?? '';
  const start = isoDate(now - MACRO_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const end = isoDate(now);

  const [news, events, dollarIndex, resonance] = await Promise.allSettled([
    fetchNews({
      symbol: XAUUSD,
      limit: 8,
      publishedAfter: `${start}T00:00:00.000Z`,
      ...(signal ? { signal } : {}),
    }),
    fetchUpcomingEvents({
      fromMs: now,
      toMs: now + CALENDAR_WINDOW_DAYS * 24 * 60 * 60 * 1000,
      ...(signal ? { signal } : {}),
    }),
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

  return { news, events, dollarIndex, resonance };
}

/**
 * M-02 — collect the generic macro inputs for a non-XAUUSD symbol in
 * parallel. Every source is best-effort: a rejected provider becomes a typed
 * gap in `assembleGenericMacroExtension` and never fails the packet.
 * Instruments without an economic-calendar or CFTC pipeline (crypto) resolve
 * an empty list instead of querying irrelevant providers.
 */
export async function fetchGenericMacroData(
  symbol: Symbol,
  signal?: AbortSignal,
): Promise<GenericMacroFetchResult> {
  const definition = tryGetSymbolDefinition(symbol);
  const now = Date.now();

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
    fetchNews({ symbol, limit: GENERIC_MACRO_NEWS_LIMIT, ...(signal ? { signal } : {}) }),
    eventsPromise,
    cotPromise,
  ]);
  return { news, events, cot };
}
