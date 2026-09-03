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

import type { CandlesResult, PriceResult } from '@kestrel/data';
import { computeIndicator } from '@kestrel/indicators';
import type { IndicatorRequest, Timeframe } from '@kestrel/shared';

import { createEvidenceId, freshnessFromAge, qualityFromWarnings } from './evidence';
import {
  XAUUSD,
  XauusdCandlesEvidenceSchema,
  XauusdIndicatorsEvidenceSchema,
  XauusdPriceEvidenceSchema,
  type XauusdCandlesEvidence,
  type XauusdIndicatorsEvidence,
  type XauusdPriceEvidence,
} from './types';

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

export function buildPriceEvidence(result: PriceResult): XauusdPriceEvidence {
  const { tick, ageMs } = result;
  const warnings = [
    ...(result.stale ? ['Price was served from stale-while-error cache'] : []),
    ...(ageMs !== null && ageMs > 10_000 ? ['Price is older than the fresh-data threshold'] : []),
  ];

  return XauusdPriceEvidenceSchema.parse({
    evidenceId: createEvidenceId('price', XAUUSD),
    kind: 'price',
    symbol: XAUUSD,
    source: tick.source,
    fetchedAt: iso(result.producedAt),
    dataAsOf: iso(tick.ts),
    freshness: result.stale ? 'stale' : freshnessFromAge(ageMs, 10_000),
    quality: qualityFromWarnings(warnings),
    warnings,
    trust: 'trusted-deterministic',
    data: { tick, stale: result.stale, ageMs },
  });
}

export function buildCandlesEvidence(
  timeframe: Timeframe,
  requestedCount: number,
  result: CandlesResult,
  maxOutput = 200,
): XauusdCandlesEvidence {
  const candles = result.candles.slice(-maxOutput);
  const latestCandle = candles.at(-1);
  const warnings = [
    ...(result.stale ? ['Candles were served from stale-while-error cache'] : []),
    ...(candles.length < requestedCount
      ? [`Only ${candles.length} candles were available; ${requestedCount} were requested`]
      : []),
    ...(!latestCandle ? ['No candles were returned'] : []),
  ];
  const fetchedAt = iso(result.producedAt);

  return XauusdCandlesEvidenceSchema.parse({
    evidenceId: createEvidenceId('candles', XAUUSD, timeframe),
    kind: 'candles',
    symbol: XAUUSD,
    timeframe,
    source: latestCandle?.source ?? 'unknown',
    fetchedAt,
    dataAsOf: latestCandle ? iso(latestCandle.t) : fetchedAt,
    freshness: result.stale ? 'stale' : 'fresh',
    quality: qualityFromWarnings(warnings),
    warnings,
    trust: 'trusted-deterministic',
    data: { candles, stale: result.stale, count: candles.length },
  });
}

export function buildIndicatorsEvidence(
  timeframe: Timeframe,
  requestedCount: number,
  result: CandlesResult,
  indicators: readonly IndicatorRequest[],
  maxCandleOutput = 200,
  maxIndicatorOutput = 30,
): XauusdIndicatorsEvidence {
  const candles = result.candles.slice(-maxCandleOutput);
  const results = indicators.map(({ kind, params }) => {
    const computed = computeIndicator({
      symbol: XAUUSD,
      tf: timeframe,
      kind,
      params,
      candles,
    });
    return { ...computed, values: computed.values.slice(-maxIndicatorOutput) };
  });
  const warnings = [
    ...(result.stale ? ['Indicator candles were served from stale-while-error cache'] : []),
    ...(candles.length < requestedCount
      ? [`Only ${candles.length} candles were available; ${requestedCount} were requested`]
      : []),
    ...(!candles.length ? ['No candles were returned; indicators may be empty'] : []),
  ];
  const latestCandle = candles.at(-1);
  const fetchedAt = iso(result.producedAt);

  return XauusdIndicatorsEvidenceSchema.parse({
    evidenceId: createEvidenceId('indicators', XAUUSD, timeframe),
    kind: 'indicators',
    symbol: XAUUSD,
    timeframe,
    source: latestCandle?.source ?? 'unknown',
    fetchedAt,
    dataAsOf: latestCandle ? iso(latestCandle.t) : fetchedAt,
    freshness: result.stale ? 'stale' : 'fresh',
    quality: qualityFromWarnings(warnings),
    warnings,
    trust: 'trusted-deterministic',
    data: {
      results,
      candleCount: candles.length,
      stale: result.stale,
    },
  });
}
