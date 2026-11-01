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

// Tool: replay_setup.
//
// Lightweight rule replay over recent candles. Two rule kinds today:
// `ema_cross` and `rsi_threshold`. Stop and target are expressed in ATR
// multiples (default) or fixed pips. Trades exit on the first bar that
// touches stop/target, or after `maxBars` (forced exit at close). No
// look-ahead.
//
// R8 (audit 2026-10-31): a trade whose entry-to-stop distance is zero cannot
// be scored, so its R is null and it is excluded from hit rate / avg R /
// total R rather than counted as a fabricated 0R. The same applies to the
// aggregates when no trade could be scored. Counts stay real integers.

import { getCandlesUnchecked } from '@kestrel/data';
import { atr, ema, rsi } from '@kestrel/indicators';
import {
  pipSize,
  ReplaySetupInputSchema,
  type Candle,
  type ReplaySetupOutput,
  type ReplayTrade,
} from '@kestrel/shared';
import { tool, type Tool } from 'ai';
import type { z } from 'zod';

import { maybeGetToolContext } from '../runtime/tool-context';

const InputSchema = ReplaySetupInputSchema;

declare module '@kestrel/shared' {
  interface ToolIOMap {
    replay_setup: { input: z.infer<typeof InputSchema> };
  }
}

export const replaySetupTool: Tool<z.infer<typeof InputSchema>, ReplaySetupOutput> = tool({
  description:
    "Replay a closed-set rule over recent candles and return per-trade entries/exits + win-rate / avg R / total R. Two rule kinds: `ema_cross` (fast/slow EMA crossover) and `rsi_threshold` (RSI crossing a level). Stop and target are ATR multiples (default 1.5 / 2 RR) or fixed pips. Use when the user describes a setup ('does an EMA50 cross with RSI > 60 actually work on EURUSD 1H'). Returns thin=true when fewer than 5 trades fired. hitRate / avgR / totalR are null when no trade had a measurable risk distance; never read those nulls as 0.",
  inputSchema: InputSchema,
  execute: async (input, options?: { abortSignal?: AbortSignal }): Promise<ReplaySetupOutput> => {
    const signal = options?.abortSignal ?? maybeGetToolContext()?.signal ?? undefined;
    const { symbol, tf, windowBars, rule, exit } = input;
    const need = Math.min(windowBars + 50, 2000);
    const candles = await getCandlesUnchecked(symbol, tf, {
      count: need,
      ...(signal ? { signal } : {}),
    });

    const ruleLabel = describeRule(rule);
    if (candles.length < 30) {
      return emptyResult(symbol, tf, ruleLabel);
    }

    const atrSeries = atr(candles, 14);
    const signals = computeSignals(rule, candles);

    const trades: ReplayTrade[] = [];
    for (const sig of signals) {
      const trade = simulateTrade({
        candles,
        atrSeries,
        index: sig.index,
        side: sig.side,
        entryPrice: candles[sig.index]!.c,
        symbol,
        exit,
      });
      if (trade) trades.push(trade);
    }

    const scored = trades.filter((t): t is ReplayTrade & { rMultiple: number } => {
      return t.rMultiple !== null;
    });
    const wins = scored.filter((t) => t.rMultiple > 0.05).length;
    const losses = scored.filter((t) => t.rMultiple < -0.05).length;
    const totalR = scored.length === 0 ? null : scored.reduce((s, t) => s + t.rMultiple, 0);
    // R8 (audit 2026-10-31): hit rate / avg R over zero scored trades are
    // not 0, they are unmeasured. `count` stays a real integer.
    const avgR = totalR === null ? null : totalR / scored.length;
    const hitRate = scored.length === 0 ? null : wins / scored.length;

    return {
      symbol,
      tf,
      asOf: Date.now(),
      ruleLabel,
      trades: trades.slice(-20),
      count: trades.length,
      wins,
      losses,
      hitRate,
      avgR,
      totalR,
      thin: trades.length < 5,
      notes: buildNotes({
        count: trades.length,
        scoredCount: scored.length,
        wins,
        losses,
        avgR,
        totalR,
      }),
    };
  },
});

// ---------------------------------------------------------------------------
// signals
// ---------------------------------------------------------------------------

interface Signal {
  index: number;
  side: 'long' | 'short';
}

function computeSignals(rule: z.infer<typeof InputSchema>['rule'], candles: Candle[]): Signal[] {
  if (rule.kind === 'ema_cross') {
    const fastSeries = ema(candles, rule.fast);
    const slowSeries = ema(candles, rule.slow);
    const out: Signal[] = [];
    for (let i = Math.max(rule.slow, rule.fast) + 1; i < candles.length - 1; i += 1) {
      const fNow = fastSeries[i];
      const sNow = slowSeries[i];
      const fPrev = fastSeries[i - 1];
      const sPrev = slowSeries[i - 1];
      if (fNow == null || sNow == null || fPrev == null || sPrev == null) continue;
      if (rule.side === 'long' && fPrev <= sPrev && fNow > sNow)
        out.push({ index: i, side: 'long' });
      if (rule.side === 'short' && fPrev >= sPrev && fNow < sNow)
        out.push({ index: i, side: 'short' });
    }
    return out;
  }

  // rsi_threshold
  const rsiSeries = rsi(candles, rule.period);
  const out: Signal[] = [];
  for (let i = rule.period + 1; i < candles.length - 1; i += 1) {
    const now = rsiSeries[i];
    const prev = rsiSeries[i - 1];
    if (now == null || prev == null) continue;
    if (rule.side === 'long' && prev <= rule.threshold && now > rule.threshold) {
      out.push({ index: i, side: 'long' });
    }
    if (rule.side === 'short' && prev >= rule.threshold && now < rule.threshold) {
      out.push({ index: i, side: 'short' });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// trade simulation
// ---------------------------------------------------------------------------

interface SimulateArgs {
  candles: Candle[];
  atrSeries: (number | null)[];
  index: number;
  side: 'long' | 'short';
  entryPrice: number;
  symbol: z.infer<typeof InputSchema>['symbol'];
  exit: z.infer<typeof InputSchema>['exit'];
}

function simulateTrade(args: SimulateArgs): ReplayTrade | null {
  const { candles, atrSeries, index, side, entryPrice, symbol, exit } = args;

  let stopOffset: number;
  let targetOffset: number;
  if (exit.unit === 'atr') {
    const atrAtEntry = atrSeries[index];
    if (atrAtEntry === null || atrAtEntry === undefined || !Number.isFinite(atrAtEntry)) {
      return null;
    }
    stopOffset = atrAtEntry * exit.stopMult;
    targetOffset = atrAtEntry * exit.targetMult;
  } else {
    if (exit.stopPips == null || exit.targetPips == null) return null;
    const pip = pipSize(symbol);
    stopOffset = exit.stopPips * pip;
    targetOffset = exit.targetPips * pip;
  }

  const stop = side === 'long' ? entryPrice - stopOffset : entryPrice + stopOffset;
  const target = side === 'long' ? entryPrice + targetOffset : entryPrice - targetOffset;
  const entryAt = candles[index]!.t;
  const at = (bar: Candle, exitPrice: number, reason: ReplayTrade['reason'], bars: number) =>
    makeTrade({
      entryAt,
      exitAt: bar.t,
      side,
      entry: entryPrice,
      exit: exitPrice,
      stop,
      target,
      reason,
      barsInTrade: bars,
    });

  const lastBarIdx = Math.min(index + exit.maxBars, candles.length - 1);
  for (let j = index + 1; j <= lastBarIdx; j += 1) {
    const bar = candles[j]!;
    if (side === 'long') {
      // Tie-break: assume stop fills before target if both touched in the same bar.
      if (bar.l <= stop) return at(bar, stop, 'sl', j - index);
      if (bar.h >= target) return at(bar, target, 'tp', j - index);
    } else {
      if (bar.h >= stop) return at(bar, stop, 'sl', j - index);
      if (bar.l <= target) return at(bar, target, 'tp', j - index);
    }
  }

  // maxBars hit — exit at the last bar's close.
  const last = candles[lastBarIdx]!;
  return at(last, last.c, 'time', lastBarIdx - index);
}

interface MakeTradeArgs {
  entryAt: number;
  exitAt: number;
  side: 'long' | 'short';
  entry: number;
  exit: number;
  stop: number;
  target: number;
  reason: 'tp' | 'sl' | 'time';
  barsInTrade: number;
}

function makeTrade(args: MakeTradeArgs): ReplayTrade {
  const risk = Math.abs(args.entry - args.stop);
  const pnl = args.side === 'long' ? args.exit - args.entry : args.entry - args.exit;
  // R8 (audit 2026-10-31): zero (or non-finite) risk distance means the R is
  // undefined. Null keeps the trade out of the R statistics instead of
  // recording a fabricated 0R.
  const rMultiple = Number.isFinite(risk) && risk > 0 ? pnl / risk : null;
  return {
    entryAt: args.entryAt,
    exitAt: args.exitAt,
    side: args.side,
    entry: args.entry,
    exit: args.exit,
    stop: args.stop,
    target: args.target,
    reason: args.reason,
    rMultiple,
    barsInTrade: args.barsInTrade,
  };
}

// ---------------------------------------------------------------------------
// labels + notes + empty
// ---------------------------------------------------------------------------

function describeRule(rule: z.infer<typeof InputSchema>['rule']): string {
  if (rule.kind === 'ema_cross') {
    return `${rule.side === 'long' ? 'Long' : 'Short'} EMA${rule.fast}/${rule.slow} cross`;
  }
  return `${rule.side === 'long' ? 'Long' : 'Short'} RSI(${rule.period}) crossing ${rule.threshold}`;
}

function buildNotes(args: {
  count: number;
  scoredCount: number;
  wins: number;
  losses: number;
  avgR: number | null;
  totalR: number | null;
}): string {
  if (args.count === 0) return 'No signals fired in the window.';
  if (args.avgR === null || args.totalR === null) {
    return `${args.count} trade${args.count === 1 ? '' : 's'} fired, but none had a measurable risk distance, so hit rate / avg R / total R are unavailable.`;
  }
  const unscored = args.count - args.scoredCount;
  const skipped =
    unscored > 0
      ? ` ${unscored} trade${unscored === 1 ? '' : 's'} had no measurable risk distance and ${unscored === 1 ? 'was' : 'were'} excluded from the R statistics.`
      : '';
  return `${args.count} trade${args.count === 1 ? '' : 's'} (${args.wins}W / ${args.losses}L) · avg ${args.avgR.toFixed(2)}R · total ${args.totalR.toFixed(2)}R.${skipped}`;
}

function emptyResult(
  symbol: z.infer<typeof InputSchema>['symbol'],
  tf: z.infer<typeof InputSchema>['tf'],
  ruleLabel: string,
): ReplaySetupOutput {
  return {
    symbol,
    tf,
    asOf: Date.now(),
    ruleLabel,
    trades: [],
    count: 0,
    wins: 0,
    losses: 0,
    // R8 (audit 2026-10-31): no trades means no measured 0% hit rate or 0R.
    hitRate: null,
    avgR: null,
    totalR: null,
    thin: true,
    notes: 'Insufficient candles to replay.',
  };
}
