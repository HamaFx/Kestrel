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

import { getCandlesWithMeta, getPriceWithMeta } from '@kestrel/data';

import { XAUUSD_RESEARCH_WINDOWS } from './research-config';
import { fetchXauusdMacroData, type XauusdMacroFetchResult } from './research-packet-macro';
import { XAUUSD } from './types';

export interface XauusdResearchFetchResult {
  price: PromiseSettledResult<Awaited<ReturnType<typeof getPriceWithMeta>>>;
  candles: readonly PromiseSettledResult<Awaited<ReturnType<typeof getCandlesWithMeta>>>[];
  macro: XauusdMacroFetchResult;
}

function abortError(): Error {
  const error = new Error('XAUUSD research was cancelled');
  error.name = 'AbortError';
  return error;
}

/** Fetch technical and optional macro evidence concurrently. */
export async function fetchXauusdResearchData(
  signal?: AbortSignal,
): Promise<XauusdResearchFetchResult> {
  if (signal?.aborted) throw signal.reason ?? abortError();

  const [technicalResults, macro] = await Promise.all([
    Promise.allSettled([
      getPriceWithMeta(XAUUSD, signal ? { signal } : {}),
      ...XAUUSD_RESEARCH_WINDOWS.map(({ timeframe, candleCount }) =>
        getCandlesWithMeta(XAUUSD, timeframe, {
          count: candleCount,
          ...(signal ? { signal } : {}),
        }),
      ),
    ]),
    fetchXauusdMacroData(signal),
  ]);

  if (signal?.aborted) throw signal.reason ?? abortError();

  const [price, ...candles] = technicalResults;
  if (!price) throw new Error('XAUUSD research price fetch did not produce a result');

  return {
    price: price as XauusdResearchFetchResult['price'],
    candles: candles as XauusdResearchFetchResult['candles'],
    macro,
  };
}
