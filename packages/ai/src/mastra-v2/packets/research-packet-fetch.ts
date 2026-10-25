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

import { getPriceWithMeta } from '@kestrel/data';

import { XAUUSD } from '../shared/types';
import { fetchPacketCandles, type PacketCandleResult } from './candle-fetcher';
import { XAUUSD_RESEARCH_WINDOWS } from './research-config';
import { fetchXauusdMacroData, type XauusdMacroFetchResult } from './research-packet-macro';

export interface XauusdResearchFetchResult {
  price: PromiseSettledResult<Awaited<ReturnType<typeof getPriceWithMeta>>>;
  candles: readonly PromiseSettledResult<PacketCandleResult>[];
  macro: XauusdMacroFetchResult;
}

function abortError(): Error {
  const error = new Error('XAUUSD research was cancelled');
  error.name = 'AbortError';
  return error;
}

/**
 * Fetch technical and optional macro evidence concurrently.
 *
 * P2-02: candles ride the shared `fetchPacketCandles` call site (same helper
 * as the committee packet); the window table stays in `research-config.ts`.
 */
export async function fetchXauusdResearchData(
  signal?: AbortSignal,
): Promise<XauusdResearchFetchResult> {
  if (signal?.aborted) throw signal.reason ?? abortError();

  const [priceResults, candleResults, macro] = await Promise.all([
    Promise.allSettled([getPriceWithMeta(XAUUSD, signal ? { signal } : {})]),
    fetchPacketCandles(
      XAUUSD,
      XAUUSD_RESEARCH_WINDOWS.map(({ timeframe, candleCount }) => ({
        timeframe,
        count: candleCount,
      })),
      signal,
    ),
    fetchXauusdMacroData(signal),
  ]);

  if (signal?.aborted) throw signal.reason ?? abortError();

  const price = priceResults[0];
  if (!price) throw new Error('XAUUSD research price fetch did not produce a result');

  return {
    price: price as XauusdResearchFetchResult['price'],
    // Index order matches XAUUSD_RESEARCH_WINDOWS, which the assembler zips.
    candles: XAUUSD_RESEARCH_WINDOWS.map(({ timeframe }) =>
      candleResults.get(timeframe)!,
    ) as XauusdResearchFetchResult['candles'],
    macro,
  };
}
