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

import { randomUUID } from 'node:crypto';

import { getCandlesWithMeta, getPriceWithMeta } from '@kestrel/data';
import { computeIndicator } from '@kestrel/indicators';
import {
  CandleSchema,
  extractSymbolsFromText,
  IndicatorRequestSchema,
  IndicatorResultSchema,
  priceDecimals,
  readFeatureFlag,
  SymbolSchema,
  TickSchema,
  TimeframeSchema,
  type Candle,
  type IndicatorRequest,
  type Symbol,
  type Timeframe,
} from '@kestrel/shared';
import { z } from 'zod';

import { INJECTION_TERMS, isHighConfidenceMutationIntent } from '../../routing-keywords';
import {
  assembleGenericMacroExtension,
  assembleXauusdMacroEvidence,
  fetchGenericMacroData,
  fetchXauusdMacroData,
  GenericMacroExtensionSchema,
  type GenericMacroExtension,
  type GenericMacroFetchResult,
} from './research-packet-macro';

// M-02 — the generic macro extension is defined with the macro fetchers (no
// import cycle) and re-exported here alongside the packet type for callers.
export { GenericMacroExtensionSchema };
export type { GenericMacroExtension };

const RESEARCH_TIMEFRAMES: readonly { timeframe: Timeframe; count: number }[] = [
  { timeframe: '1d', count: 120 },
  { timeframe: '4h', count: 120 },
  { timeframe: '1h', count: 160 },
  { timeframe: '15m', count: 160 },
];

const RESEARCH_INDICATORS: readonly IndicatorRequest[] = [
  { kind: 'ema', params: { period: 20 } },
  { kind: 'ema', params: { period: 50 } },
  { kind: 'rsi', params: { period: 14 } },
  { kind: 'macd', params: { fast: 12, slow: 26, signal: 9 } },
  { kind: 'atr', params: { period: 14 } },
];

const EvidenceSchema = z.object({
  evidenceId: z.string().min(1),
  symbol: SymbolSchema,
  timeframe: TimeframeSchema,
  source: z.string().min(1),
  fetchedAt: z.iso.datetime(),
  dataAsOf: z.iso.datetime(),
  freshness: z.enum(['fresh', 'stale', 'unknown']),
  quality: z.enum(['complete', 'partial', 'degraded']),
  warnings: z.array(z.string()),
  candles: z.array(CandleSchema),
  indicators: z.array(IndicatorResultSchema),
});

export const MarketStructureSummarySchema = z.object({
  recentSwingHigh: z.number(),
  recentSwingLow: z.number(),
  rangeSize: z.number(),
});

export const XauusdExtensionSchema = z.object({
  evidenceId: z.string().min(1),
  dollarIndex: z.array(z.object({ asOf: z.string(), value: z.number() })).max(10),
  realYields: z.array(z.object({ asOf: z.string(), value: z.number() })).max(10),
  breakevenInflation: z.array(z.object({ asOf: z.string(), value: z.number() })).max(10),
  events: z
    .array(
      z.object({
        name: z.string().min(1),
        actual: z.number().nullable(),
        forecast: z.number().nullable(),
        previous: z.number().nullable(),
      }),
    )
    .max(10),
  newsCount: z.int().nonnegative(),
  newsHeadlines: z
    .array(
      z.object({
        title: z.string().min(1),
        source: z.string().optional(),
        publishedAt: z.string().optional(),
      }),
    )
    .max(8)
    .optional(),
  warnings: z.array(z.string()),
});

export const SymbolResearchPacketSchema = z.object({
  packetId: z.string().min(1),
  kind: z.literal('symbol_research_packet'),
  symbol: SymbolSchema,
  generatedAt: z.iso.datetime(),
  status: z.enum(['ready', 'blocked']),
  dataQuality: z.enum(['complete', 'partial', 'degraded']),
  price: z
    .object({
      evidenceId: z.string().min(1),
      symbol: SymbolSchema,
      source: z.string().min(1),
      fetchedAt: z.iso.datetime(),
      dataAsOf: z.iso.datetime(),
      freshness: z.enum(['fresh', 'stale', 'unknown']),
      quality: z.enum(['complete', 'partial', 'degraded']),
      warnings: z.array(z.string()),
      tick: TickSchema,
    })
    .nullable(),
  timeframes: z.array(EvidenceSchema),
  marketStructure: MarketStructureSummarySchema.optional(),
  xauusdExtension: XauusdExtensionSchema.optional(),
  /**
   * M-02 (audit 2026-10-18) — generic macro evidence (news, upcoming
   * calendar releases for the symbol's currencies, CFTC positioning where
   * supported) attached to non-XAUUSD packets when `ENABLE_GENERIC_MACRO`
   * is on. Gated by `optionalContext`; never set for XAUUSD (which keeps
   * `xauusdExtension`).
   */
  genericMacro: GenericMacroExtensionSchema.optional(),
  optionalContext: z.object({
    available: z.boolean(),
    reason: z.string().min(1),
  }),
  missingData: z.array(z.string()),
  warnings: z.array(z.string()),
});

export type SymbolResearchPacket = z.infer<typeof SymbolResearchPacketSchema>;
export type XauusdExtension = z.infer<typeof XauusdExtensionSchema>;
export type SymbolResearchEvidence = z.infer<typeof EvidenceSchema>;

export const SYMBOL_RESEARCH_TIMEFRAMES = RESEARCH_TIMEFRAMES;
export const SYMBOL_RESEARCH_INDICATORS = RESEARCH_INDICATORS;

const indicatorMemo = new Map<string, ReturnType<typeof computeIndicator>>();
const INDICATOR_MEMO_MAX = 512;

export function computeIndicatorMemo(args: {
  symbol: Symbol;
  tf: Timeframe;
  kind: IndicatorRequest['kind'];
  params: IndicatorRequest['params'];
  candles: Candle[];
  /**
   * B-06 (audit 2026-10-18) — staleness bit. Two collects can share length and
   * last candle timestamp but differ in whether the candles were served from
   * the stale-while-error cache; without this bit the memo would reuse a stale
   * computation as if it were fresh after a provider failover.
   */
  stale?: boolean;
  /**
   * I-01 (audit 2026-10-18) — data-fetch production time. Two collects within
   * an open candle can share length and last candle timestamp while the
   * candle's close (and therefore every indicator value) has moved; without
   * `producedAt` the memo returns the earlier computation. `producedAt`
   * changes whenever a new candle payload was actually produced, so the key
   * is exact for the same-length/same-bar case without hashing candle bodies.
   */
  producedAt?: number;
}): ReturnType<typeof computeIndicator> {
  const lastT = args.candles.at(-1)?.t ?? 0;
  const staleBit = args.stale ? 's' : 'f';
  const producedAtBit = args.producedAt ?? 0;
  const key = `${args.symbol}:${args.tf}:${String(args.kind)}:${JSON.stringify(args.params)}:${args.candles.length}:${lastT}:${staleBit}:${producedAtBit}`;
  const memoized = indicatorMemo.get(key);
  if (memoized) {
    indicatorMemo.delete(key);
    indicatorMemo.set(key, memoized);
    return memoized;
  }
  const computed = computeIndicator(args);
  indicatorMemo.set(key, computed);
  if (indicatorMemo.size > INDICATOR_MEMO_MAX) {
    const oldest = indicatorMemo.keys().next().value;
    if (oldest !== undefined) indicatorMemo.delete(oldest);
  }
  return computed;
}

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

function computeMarketStructureSummary(
  timeframes: readonly SymbolResearchEvidence[],
  symbol?: string,
): z.infer<typeof MarketStructureSummarySchema> | undefined {
  const preferred =
    timeframes.find((tf) => tf.timeframe === '1h' && tf.candles.length > 0) ??
    timeframes.find((tf) => tf.candles.length > 0);
  if (!preferred || preferred.candles.length === 0) return undefined;
  const window = preferred.candles.slice(-50);
  let recentSwingHigh = -Infinity;
  let recentSwingLow = Infinity;
  for (const c of window) {
    if (c.h > recentSwingHigh) recentSwingHigh = c.h;
    if (c.l < recentSwingLow) recentSwingLow = c.l;
  }
  if (!Number.isFinite(recentSwingHigh) || !Number.isFinite(recentSwingLow)) return undefined;
  const dec = symbol ? priceDecimals(symbol) : 5;
  return {
    recentSwingHigh,
    recentSwingLow,
    rangeSize: Number((recentSwingHigh - recentSwingLow).toFixed(dec)),
  };
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
  const [technicalSettled, macroExtension, genericMacroFetched] = await Promise.all([
    Promise.allSettled([
      getPriceWithMeta(symbol, signal ? { signal } : {}),
      ...RESEARCH_TIMEFRAMES.map(({ timeframe, count }) =>
        getCandlesWithMeta(symbol, timeframe, {
          count,
          ...(signal ? { signal } : {}),
        }),
      ),
    ]),
    wantsMacro ? collectXauusdExtension(packetId, generatedAt, signal) : null,
    wantsGenericMacro
      ? fetchGenericMacroData(symbol, signal).catch((): GenericMacroFetchResult | null => null)
      : null,
  ]);
  const [priceResult, ...candleResults] = technicalSettled;

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
  for (let index = 0; index < RESEARCH_TIMEFRAMES.length; index += 1) {
    const requested = RESEARCH_TIMEFRAMES[index]!;
    const result = candleResults[index];
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
  const genericMacro: GenericMacroExtension | undefined = genericMacroResult?.extension ?? undefined;
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

export function serializeSymbolResearchPacket(packet: SymbolResearchPacket): string {
  return JSON.stringify({
    ...packet,
    timeframes: packet.timeframes.map((evidence) => ({
      ...evidence,
      candles: evidence.candles.slice(-12),
      indicators: evidence.indicators.map((indicator) => ({
        ...indicator,
        values: indicator.values.slice(-3),
      })),
    })),
  });
}

export const SymbolResearchInputSchema = z.object({ symbol: SymbolSchema });
export const SymbolResearchIndicatorRequestSchema = IndicatorRequestSchema;

/** Extract one canonical symbol from a prompt, using the fallback only when no symbol is named. */
export function extractSymbolFromPrompt(prompt: string, fallback?: string): string | null {
  const matched = extractSymbolsFromText(prompt);
  if (matched.length > 1) return null;
  if (matched.length === 1) return matched[0] ?? null;
  if (fallback === undefined) return null;
  const parsed = SymbolSchema.safeParse(fallback);
  return parsed.success ? parsed.data : null;
}

/** Conservative server-side guard for the read-only generalized mode path. */
export function isSafeSymbolResearchPrompt(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (!trimmed) return false;
  if (INJECTION_TERMS.test(trimmed)) return false;
  if (isHighConfidenceMutationIntent(trimmed)) return false;
  return true;
}
