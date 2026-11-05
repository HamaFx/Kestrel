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

// Packet collection: price + candles + optional macro evidence folded into
// one provenance-bearing `SymbolResearchPacket`.

import { randomUUID } from 'node:crypto';

import { getPriceWithMeta } from '@kestrel/data';
import { readFeatureFlag, SymbolSchema, type Symbol } from '@kestrel/shared';

import { fetchPacketCandles } from '../candle-fetcher';
import {
  assembleMacroEvidence,
  fetchMacroData,
  type MacroFetchResult,
} from '../research-packet-macro';
import { computeIndicatorMemo } from './indicator-memo';
import { computeMarketStructureSummary } from './market-structure';
import {
  EvidenceSchema,
  SYMBOL_RESEARCH_INDICATORS,
  SYMBOL_RESEARCH_TIMEFRAMES,
  SymbolResearchPacketSchema,
  type SymbolResearchEvidence,
  type SymbolResearchPacket,
} from './schemas';

function abortError(): Error {
  const error = new Error('Symbol research was cancelled');
  error.name = 'AbortError';
  return error;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * Request macro context. Gold always attaches it; other symbols additionally
 * require the `ENABLE_GENERIC_MACRO` rollout flag.
 */
export interface CollectSymbolResearchPacketOptions {
  includeMacro?: boolean;
}

export async function collectSymbolResearchPacket(
  symbolInput: Symbol,
  signal?: AbortSignal,
  options?: CollectSymbolResearchPacketOptions,
): Promise<SymbolResearchPacket> {
  const symbol = SymbolSchema.parse(symbolInput);
  if (signal?.aborted) throw signal.reason ?? abortError();

  const generatedAt = new Date().toISOString();
  const packetId = `symbol-research-${symbol}-${randomUUID()}`;
  const wantsMacro =
    options?.includeMacro === true &&
    (symbol === 'XAUUSD' || readFeatureFlag('ENABLE_GENERIC_MACRO'));
  const [priceSettled, candleResults, macroFetched] = await Promise.all([
    Promise.allSettled([getPriceWithMeta(symbol, signal ? { signal } : {})]),
    fetchPacketCandles(symbol, SYMBOL_RESEARCH_TIMEFRAMES, signal),
    wantsMacro ? fetchMacroData(symbol, signal).catch((): MacroFetchResult | null => null) : null,
  ]);
  const priceResult = priceSettled[0];

  if (signal?.aborted) throw signal.reason ?? abortError();

  const missingData: string[] = [];
  const warnings: string[] = [];
  let price: SymbolResearchPacket['price'] = null;

  if (priceResult?.status === 'fulfilled') {
    const result = priceResult.value;
    const isMarketClosed = result.tick.marketState === 'closed';
    const priceWarnings = [
      ...(result.stale ? ['Price was served from stale-while-error cache'] : []),
      ...(!isMarketClosed && result.ageMs !== null && result.ageMs > 10_000
        ? ['Price is older than the fresh-data threshold']
        : []),
    ];
    price = {
      evidenceId: `price-${symbol}-${randomUUID()}`,
      symbol,
      source: result.tick.source,
      fetchedAt: iso(result.producedAt),
      dataAsOf: iso(result.tick.ts),
      freshness: result.stale
        ? 'stale'
        : isMarketClosed
          ? 'fresh'
          : result.ageMs !== null && result.ageMs > 10_000
            ? 'stale'
            : 'fresh',
      quality: priceWarnings.length === 0 ? 'complete' : 'degraded',
      warnings: priceWarnings,
      tick: result.tick,
    };
    warnings.push(...priceWarnings);
  } else {
    missingData.push(`Current ${symbol} price is unavailable.`);
    warnings.push(`Current ${symbol} price could not be collected.`);
  }

  const timeframes: SymbolResearchEvidence[] = [];
  for (const requested of SYMBOL_RESEARCH_TIMEFRAMES) {
    const result = candleResults.get(requested.timeframe);
    if (!result || result.status === 'rejected') {
      missingData.push(`${symbol} ${requested.timeframe} candles are unavailable.`);
      warnings.push(`${symbol} ${requested.timeframe} candle collection failed.`);
      continue;
    }

    const candles = result.value.candles;
    const latest = candles.at(-1);
    const timeframeWarnings = [
      ...(result.value.stale ? ['Candles were served from stale-while-error cache'] : []),
      ...(candles.length < requested.count
        ? [`Only ${candles.length} candles were available; ${requested.count} were requested`]
        : []),
      ...(!latest ? ['No candles were returned'] : []),
    ];
    const indicators = latest
      ? SYMBOL_RESEARCH_INDICATORS.map((request) => {
          const computed = computeIndicatorMemo({
            symbol,
            tf: requested.timeframe,
            kind: request.kind,
            params: request.params,
            candles,
            stale: result.value.stale,
            producedAt: result.value.producedAt,
          });
          return { ...computed, values: computed.values.slice(-8) };
        })
      : [];
    const evidence = EvidenceSchema.parse({
      evidenceId: `research-${symbol}-${requested.timeframe}-${randomUUID()}`,
      symbol,
      timeframe: requested.timeframe,
      source: latest?.source ?? 'unknown',
      fetchedAt: iso(result.value.producedAt),
      dataAsOf: latest ? iso(latest.t) : iso(result.value.producedAt),
      freshness: latest ? (result.value.stale ? 'stale' : 'fresh') : 'unknown',
      quality: timeframeWarnings.length === 0 ? 'complete' : 'degraded',
      warnings: timeframeWarnings,
      candles: candles.slice(-80),
      indicators,
    });
    timeframes.push(evidence);
    warnings.push(...timeframeWarnings);
    if (candles.length === 0)
      missingData.push(`${symbol} ${requested.timeframe} returned no candles.`);
  }

  const requiredTimeframesReady = SYMBOL_RESEARCH_TIMEFRAMES.every((window) =>
    timeframes.some(
      (evidence) => evidence.timeframe === window.timeframe && evidence.candles.length > 0,
    ),
  );
  const status = price !== null && requiredTimeframesReady ? 'ready' : 'blocked';

  // Assemble macro evidence after the technical evidence. A completely
  // unavailable macro fetch adds one packet-level warning (so the desks and
  // the UI disclose it); a partial fetch keeps its warnings inside `macro`.
  const macroResult = macroFetched
    ? assembleMacroEvidence({ symbol, packetId, generatedAt, fetched: macroFetched })
    : null;
  const macro = macroResult?.macro ?? undefined;
  if (macroResult && !macro) {
    warnings.push(...macroResult.warnings);
  }

  const dataQuality =
    status === 'blocked'
      ? 'degraded'
      : missingData.length > 0
        ? 'partial'
        : warnings.length > 0
          ? 'degraded'
          : 'complete';

  const marketStructure = computeMarketStructureSummary(timeframes, symbol);

  return SymbolResearchPacketSchema.parse({
    packetId,
    kind: 'symbol_research_packet',
    symbol,
    generatedAt,
    status,
    dataQuality,
    price,
    timeframes,
    ...(marketStructure ? { marketStructure } : {}),
    ...(macro ? { macro } : {}),
    optionalContext: {
      available: Boolean(macro),
      reason: macro
        ? `${symbol} macro context (news, economic calendar, COT where available, and rate series for USD-quoted instruments) is attached as the packet extension.`
        : wantsMacro
          ? `${symbol} macro context was requested but could not be collected for this run.`
          : `Fundamental context is not part of this ${symbol} packet; request macro context to attach it.`,
    },
    missingData: unique(missingData),
    warnings: unique(warnings),
  });
}
