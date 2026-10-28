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

// Phase 3 (Jev roadmap) — JEPA-inspired market regime memory.
//
// A JEPA-style world model learns by predicting the *representation* of future
// states rather than raw prices. Kestrel's analogue is a deterministic latent
// descriptor composed from the `SymbolResearchPacket` numerics (price, swing
// structure, per-timeframe indicator values, and the DXY / real-yield macro
// series) plus the realized forward outcome when it has resolved. Storing that
// descriptor in `memory_embeddings` under `kind: 'market_regime'` lets later
// recalls ask "what did this kind of regime look like, and how did it
// resolve?" — a compact, deterministic "state" analogue.
//
// Security invariant: only deterministic numeric/structural fields are
// composed — never `newsHeadlines` or any other free-form external prose.

import type { Symbol } from '@kestrel/shared';

import type { SymbolResearchPacket } from '../../mastra-v2/packets/symbol-research';
import type { EmbedEnv, EmbedUserSettings } from './types';
import { upsertMemory } from './upsert';

/** Resolved forward outcome of the regime window. */
export interface RegimeOutcome {
  /** 4-hour directional resolution. */
  resolution4h?: 'bullish' | 'bearish' | 'range';
  /** Max favorable excursion, percent (e.g. 0.85 = +0.85%). */
  mfePct?: number;
  /** Max adverse excursion, percent (e.g. -0.15 = -0.15%). */
  maePct?: number;
}

/** Format with up to 2 decimals and no trailing zeros (`64.20` → `64.2`). */
function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return 'n/a';
  return String(Number(value.toFixed(2)));
}

/** Signed percent for excursion values (`0.85` → `+0.85%`). */
function formatSignedPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${formatNumber(value)}%`;
}

function latestSeriesValue(
  series: readonly { asOf: string; value: number }[] | undefined,
): number | null {
  if (!Array.isArray(series) || series.length === 0) return null;
  const latest = series[series.length - 1];
  return latest && Number.isFinite(latest.value) ? latest.value : null;
}

/** Latest value of the first indicator of `kind` on a timeframe, if present. */
function latestIndicatorValue(indicators: unknown, kind: string): number | null {
  if (!Array.isArray(indicators)) return null;
  for (const indicator of indicators as Array<{ kind?: unknown; values?: unknown }>) {
    if (indicator?.kind !== kind || !Array.isArray(indicator.values)) continue;
    const values = indicator.values as number[];
    const latest = values[values.length - 1];
    if (typeof latest === 'number' && Number.isFinite(latest)) return latest;
  }
  return null;
}

function timeframeDescriptor(timeframe: {
  timeframe?: unknown;
  indicators?: unknown;
}): string | null {
  if (typeof timeframe?.timeframe !== 'string') return null;
  const parts: string[] = [];
  const rsi = latestIndicatorValue(timeframe.indicators, 'rsi');
  if (rsi !== null) parts.push(`RSI=${formatNumber(rsi)}`);
  const atr = latestIndicatorValue(timeframe.indicators, 'atr');
  if (atr !== null) parts.push(`ATR=${formatNumber(atr)}`);
  if (parts.length === 0) return null;
  return `${timeframe.timeframe}:${parts.join(',')}`;
}

/**
 * Deterministic latent regime descriptor for one packet:
 *
 * ```
 * REGIME[XAUUSD] PRICE=2750 | STRUCTURE:HIGH=2765,LOW=2720,RANGE=45
 * TF 1h:RSI=64.2,ATR=12.5
 * MACRO:DXY=103.8,REALYIELD=1.95,BREAKEVEN=2.31
 * OUTCOME_4H=bullish(MFE=+0.85%,MAE=-0.15%)
 * ```
 *
 * Only deterministic numerics are included; news prose is never read.
 */
export function composeRegimeStateText(
  packet: SymbolResearchPacket,
  outcome?: RegimeOutcome,
): string {
  const lines: string[] = [];

  const price = packet.price?.tick?.mid;
  const pricePart =
    typeof price === 'number' && Number.isFinite(price) ? ` PRICE=${formatNumber(price)}` : '';
  const structure = packet.marketStructure;
  const structurePart = structure
    ? ` | STRUCTURE:HIGH=${formatNumber(structure.recentSwingHigh)},LOW=${formatNumber(structure.recentSwingLow)},RANGE=${formatNumber(structure.rangeSize)}`
    : '';
  lines.push(`REGIME[${packet.symbol}]${pricePart}${structurePart}`);

  for (const timeframe of packet.timeframes ?? []) {
    const descriptor = timeframeDescriptor(
      timeframe as { timeframe?: unknown; indicators?: unknown },
    );
    if (descriptor) lines.push(`TF ${descriptor}`);
  }

  const macro = packet.xauusdExtension;
  if (macro) {
    const macroParts: string[] = [];
    const dxy = latestSeriesValue(macro.dollarIndex);
    if (dxy !== null) macroParts.push(`DXY=${formatNumber(dxy)}`);
    const realYield = latestSeriesValue(macro.realYields);
    if (realYield !== null) macroParts.push(`REALYIELD=${formatNumber(realYield)}`);
    const breakeven = latestSeriesValue(macro.breakevenInflation);
    if (breakeven !== null) macroParts.push(`BREAKEVEN=${formatNumber(breakeven)}`);
    if (macroParts.length > 0) lines.push(`MACRO:${macroParts.join(',')}`);
  }

  if (outcome?.resolution4h || outcome?.mfePct !== undefined || outcome?.maePct !== undefined) {
    const excursions: string[] = [];
    if (outcome.mfePct !== undefined) excursions.push(`MFE=${formatSignedPercent(outcome.mfePct)}`);
    if (outcome.maePct !== undefined) excursions.push(`MAE=${formatSignedPercent(outcome.maePct)}`);
    const resolution = outcome.resolution4h ? `=${outcome.resolution4h}` : '';
    const excursionPart = excursions.length > 0 ? `(${excursions.join(',')})` : '';
    lines.push(`OUTCOME_4H${resolution}${excursionPart}`);
  }

  return lines.join('\n');
}

export interface RememberMarketRegimeArgs {
  packet: SymbolResearchPacket;
  userId: string;
  /** Resolved forward outcome, when the window has closed. */
  outcome?: RegimeOutcome;
  env?: Partial<EmbedEnv>;
  userSettings?: EmbedUserSettings;
  signal?: AbortSignal | null;
  /** Originating timestamp; defaults to the packet's `generatedAt`. */
  occurredAt?: Date;
}

/**
 * Persist a market-regime descriptor into `memory_embeddings`
 * (`kind: 'market_regime'`). Idempotent on `(userId, kind, packetId)`, so
 * re-recording the same packet with a resolved outcome refreshes the row with
 * the same embedding space (`upsertMemory` records the exact `model` and
 * search must filter by it).
 */
export async function rememberMarketRegime(
  args: RememberMarketRegimeArgs,
): Promise<{ stored: boolean; reason?: string }> {
  const text = composeRegimeStateText(args.packet, args.outcome);
  const generatedAt = args.occurredAt ?? new Date(args.packet.generatedAt);
  const occurredAt = Number.isFinite(generatedAt.getTime()) ? generatedAt : new Date();
  return upsertMemory({
    kind: 'market_regime',
    sourceId: args.packet.packetId,
    symbol: args.packet.symbol as Symbol,
    text,
    meta: {
      dataQuality: args.packet.dataQuality,
      outcome: args.outcome ?? null,
    },
    occurredAt,
    userId: args.userId,
    ...(args.env ? { env: args.env } : {}),
    ...(args.userSettings ? { userSettings: args.userSettings } : {}),
    ...(args.signal ? { signal: args.signal } : {}),
  });
}
