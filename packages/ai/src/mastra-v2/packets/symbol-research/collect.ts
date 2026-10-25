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
  assembleGenericMacroExtension,
  assembleXauusdMacroEvidence,
  fetchGenericMacroData,
  fetchXauusdMacroData,
  type GenericMacroExtension,
  type GenericMacroFetchResult,
} from '../research-packet-macro';
import { computeIndicatorMemo } from './indicator-memo';
import { computeMarketStructureSummary } from './market-structure';
import {
  EvidenceSchema,
  RESEARCH_INDICATORS,
  RESEARCH_TIMEFRAMES,
  SymbolResearchPacketSchema,
  type SymbolResearchEvidence,
  type SymbolResearchPacket,
  type XauusdExtension,
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

async function collectXauusdExtension(
  packetId: string,
  generatedAt: string,
  signal?: AbortSignal,
): Promise<XauusdExtension | null> {
  try {
    const fetched = await fetchXauusdMacroData(signal);
    const assembled = assembleXauusdMacroEvidence(packetId, generatedAt, fetched);
    if (!assembled.evidence) return null;
    const evidence = assembled.evidence;
    const data = evidence.data;
    return {
      evidenceId: evidence.evidenceId,
      dollarIndex: data.dollarIndex
        .slice(-10)
        .map((item) => ({ asOf: item.date, value: item.value })),
      realYields: data.realYields
        .slice(-10)
        .map((item) => ({ asOf: item.date, value: item.value })),
      breakevenInflation: data.breakevenInflation
        .slice(-10)
        .map((item) => ({ asOf: item.date, value: item.value })),
      events: data.events.slice(0, 10).map((event) => ({
        name: event.title,
        actual: event.actual ?? null,
        forecast: event.forecast ?? null,
        previous: event.previous ?? null,
      })),
      newsCount: data.news.length,
      newsHeadlines: data.news.slice(0, 8).map((article) => ({
        title: article.title,
        ...(article.source ? { source: article.source } : {}),
        publishedAt: new Date(article.publishedAt).toISOString(),
      })),
      warnings: evidence.warnings,
    };
  } catch {
    return null;
  }
}

export interface CollectSymbolResearchPacketOptions {
  /**
   * Request macro context. For XAUUSD this means the verified macro
   * extension (dollar index, real yields, USD events, news). For other
   * symbols it requests the M-02 generic extension (news, calendar, COT) and
   * is additionally gated by `ENABLE_GENERIC_MACRO`.
   */
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
  const wantsMacro = symbol === 'XAUUSD' && options?.includeMacro === true;
  // M-02: non-gold symbols can request the generic macro extension
  // (news + calendar + COT). Rollout-gated; a failed fetch can never fail the
  // packet (`fetchGenericMacroData` settles internally).
  const wantsGenericMacro =
    symbol !== 'XAUUSD' &&
    options?.includeMacro === true &&
    readFeatureFlag('ENABLE_GENERIC_MACRO');
  const [priceSettled, candleResults, macroExtension, genericMacroFetched] = await Promise.all([
    Promise.allSettled([getPriceWithMeta(symbol, signal ? { signal } : {})]),
    fetchPacketCandles(symbol, RESEARCH_TIMEFRAMES, signal),
    wantsMacro ? collectXauusdExtension(packetId, generatedAt, signal) : null,
    wantsGenericMacro
      ? fetchGenericMacroData(symbol, signal).catch((): GenericMacroFetchResult | null => null)
      : null,
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
  for (const requested of RESEARCH_TIMEFRAMES) {
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
      ? RESEARCH_INDICATORS.map((request) => {
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

  const requiredTimeframesReady = RESEARCH_TIMEFRAMES.every((window) =>
    timeframes.some(
      (evidence) => evidence.timeframe === window.timeframe && evidence.candles.length > 0,
    ),
  );
  const status = price !== null && requiredTimeframesReady ? 'ready' : 'blocked';

  // M-02: assemble the generic macro extension after the technical evidence.
  // A completely unavailable macro fetch adds one packet-level warning (so
  // the desks and the UI disclose it); a partial fetch keeps its warnings
  // inside the extension, mirroring the XAUUSD macro contract.
  const genericMacroResult = genericMacroFetched
    ? assembleGenericMacroExtension(symbol, genericMacroFetched)
    : null;
  const genericMacro: GenericMacroExtension | undefined =
    genericMacroResult?.extension ?? undefined;
  if (genericMacroResult && !genericMacroResult.extension) {
    warnings.push(...genericMacroResult.warnings);
  }

  const dataQuality =
    status === 'blocked'
      ? 'degraded'
      : missingData.length > 0
        ? 'partial'
        : warnings.length > 0
          ? 'degraded'
          : 'complete';

  const macro = macroExtension;
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
    ...(macro ? { xauusdExtension: macro } : {}),
    ...(genericMacro ? { genericMacro } : {}),
    optionalContext: {
      available: Boolean(macro) || Boolean(genericMacro),
      reason: macro
        ? 'XAUUSD macro context (dollar index, real yields, USD events, news) is attached as the packet extension.'
        : genericMacro
          ? `Generic ${symbol} macro context (news, economic calendar, COT where available) is attached as the packet extension.`
          : wantsMacro
            ? // B-05: the macro extension was requested but could not be collected
              // for this run — never imply it was checked.
              'XAUUSD macro context (dollar index, real yields, USD events, news) was requested but could not be collected for this run.'
            : wantsGenericMacro
              ? // M-02/B-05: the generic macro extension was requested but every
                // provider failed — never imply fundamental context was checked.
                `Generic ${symbol} macro context (news, economic calendar, COT) was requested but could not be collected for this run.`
              : `Fundamental context is not part of the generalized ${symbol} packet; use the XAUUSD fundamental workflow where applicable.`,
    },
    missingData: unique(missingData),
    warnings: unique(warnings),
  });
}
