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

// Durable paper-strategy runner.
//
// Each active deployment is evaluated once per new closed bar. The exact same
// QuickJS sandbox and feature matrix as the Backtesting Lab produce the
// signal; this module only turns the latest bar's signal into a virtual order
// and reconciles the sandbox position.
//
// Signal parity (Phase 3, roadmap Phase 4): the runner translates every field
// of `StrategySignal` — limit `entry`, `validBars` expiry, `maxBars` time
// stops, `breakEvenAtR`, `trailing` (`atr` | `percent` | `fixed`), `flip` and
// `exit` — into the same behaviour as `plugin-backtesting`.

import { candlesAgeSeconds, getCandles } from '@kestrel/data';
import {
  buildFeatureMatrix,
  runStrategySandbox,
  type StrategySignal,
} from '@kestrel/plugin-backtesting/engine';
import { msPerTimeframe, type Symbol, type Timeframe } from '@kestrel/shared';

import {
  getPosition,
  listOpenPositionsForSymbol,
  listOrders,
  listStrategyRuns,
  updateStrategyRun,
  type StrategyRunPatch,
} from './db/queries';
import type { PaperPositionRow, PaperStrategyRunRow } from '@kestrel/db';
import { cancelOrderForUser, closePositionForUser, placeOrderForUser } from './services/trading';
import type { PaperSettings } from './settings';
import {
  findRunPosition,
  isStrategyOrderForRun,
  maxBarsFromNotes,
  resolveMaxBars,
  resolveTrailingDistance,
  resolveValidBars,
  strategyNotes,
} from './strategy-parity';

const STRATEGY_LOOKBACK_BARS = 500;

interface LatestStrategySignal {
  barTime: number;
  candleCount: number;
  signal: StrategySignal | null;
  logs: string[];
  /** Latest ATR(14); feeds `trailing: { type: 'atr' }` translation. */
  latestAtr: number | null;
  /** Latest closed bar's close; feeds `trailing: { type: 'percent' }`. */
  latestClose: number;
}

/** Evaluate a strategy's latest closed bar in the same engine as a backtest. */
async function evaluateLatestStrategySignal(args: {
  symbol: string;
  timeframe: string;
  source: string;
  params: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<LatestStrategySignal> {
  const symbol = args.symbol as Symbol;
  const timeframe = args.timeframe as Timeframe;
  // R8 (audit 2026-10-31): a strategy signal computed over a stale-while-
  // revalidate window may be driven by missing recent bars, and it can open a
  // paper position. Refuse rather than trade on it.
  const candlesResult = await getCandles(symbol, timeframe, {
    count: STRATEGY_LOOKBACK_BARS,
    includeOpenBar: false,
    ...(args.signal ? { signal: args.signal } : {}),
  });
  if (candlesResult.stale) {
    throw new Error(
      `The ${symbol} ${timeframe} candle window was served from a stale cache after an upstream ` +
        `failure (age ${candlesAgeSeconds(candlesResult)}s); the strategy signal was not evaluated.`,
    );
  }
  const candles = candlesResult.candles;
  const barMs = msPerTimeframe(timeframe);
  const closed = candles
    .filter((candle) => candle.t + barMs <= Date.now())
    .sort((a, b) => a.t - b.t);
  if (closed.length < 60) {
    throw new Error(
      `Only ${closed.length} closed ${timeframe} candles are available for ${symbol}.`,
    );
  }

  const matrix = buildFeatureMatrix({ symbol, timeframe, candles: closed });
  const sandbox = await runStrategySandbox({
    source: args.source,
    matrix,
    symbol,
    timeframe,
    params: args.params,
    ...(args.signal ? { signal: args.signal } : {}),
  });

  const lastIndex = closed.length - 1;
  const signal = sandbox.signals.filter((entry) => entry.signalIndex === lastIndex).at(-1) ?? null;
  return {
    barTime: closed[lastIndex]!.t,
    candleCount: closed.length,
    signal,
    logs: sandbox.logs,
    latestAtr: matrix.series.atr14[lastIndex] ?? null,
    latestClose: closed[lastIndex]!.c,
  };
}

export interface StrategyRunnerResult {
  evaluated: number;
  entered: number;
  closed: number;
  errors: number;
}

/**
 * Run every active deployment for one user. Errors are isolated per run so one
 * bad strategy cannot stop the rest of the user's sandbox.
 */
export async function runStrategyRunsForUser(
  userId: string,
  settings: PaperSettings,
  signal?: AbortSignal,
): Promise<StrategyRunnerResult> {
  const runs = await listStrategyRuns(userId, 'active');
  const result: StrategyRunnerResult = { evaluated: 0, entered: 0, closed: 0, errors: 0 };

  for (const run of runs) {
    if (signal?.aborted) break;
    try {
      const outcome = await runOneStrategy(userId, run, settings, signal);
      result.evaluated += 1;
      result.entered += outcome.entered;
      result.closed += outcome.closed;
    } catch (err) {
      result.evaluated += 1;
      result.errors += 1;
      await updateStrategyRun(userId, run.id, {
        lastError: err instanceof Error ? err.message : String(err),
      }).catch(() => undefined);
    }
  }
  return result;
}

async function runOneStrategy(
  userId: string,
  run: PaperStrategyRunRow,
  settings: PaperSettings,
  signal?: AbortSignal,
): Promise<{ entered: number; closed: number }> {
  let evaluation: LatestStrategySignal;
  try {
    evaluation = await evaluateLatestStrategySignal({
      symbol: run.symbol,
      timeframe: run.timeframe,
      source: run.source,
      params: run.params,
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    await updateStrategyRun(userId, run.id, {
      lastError: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  if (run.lastBarTime && run.lastBarTime.getTime() === evaluation.barTime) {
    return { entered: 0, closed: 0 };
  }

  const barMs = msPerTimeframe(run.timeframe as Timeframe);
  const existing = run.positionId
    ? await getPosition(userId, run.positionId)
    : findRunPosition(await listOpenPositionsForSymbol(userId, run.symbol), run);
  let openPosition: PaperPositionRow | undefined =
    existing?.status === 'open' ? existing : undefined;
  let entered = 0;
  let closed = 0;
  let positionId = openPosition?.id ?? null;
  const patch: StrategyRunPatch = {
    lastBarTime: new Date(evaluation.barTime),
    lastError: null,
    ...(positionId !== run.positionId ? { positionId } : {}),
  };

  const closeOpenPosition = async (reason: 'max_bars' | 'manual'): Promise<void> => {
    if (!openPosition) return;
    const result = await closePositionForUser({
      userId,
      positionId: openPosition.id,
      closeReason: reason,
      settings,
      source: 'strategy',
      ...(signal ? { signal } : {}),
    });
    if (result.outcome === 'not_closed') {
      // A concurrent evaluator changed the row first; never count or report a
      // close that was not applied. If it flat-closed, drop the local handle;
      // otherwise the position is still open and talking to it stays valid.
      if (result.position.status === 'closed') {
        openPosition = undefined;
        positionId = null;
        patch.positionId = null;
      }
      return;
    }
    openPosition = undefined;
    positionId = null;
    patch.positionId = null;
    closed += 1;
  };

  try {
    // Time stop: mirror the backtester's `index - entryIndex >= maxBars`.
    if (openPosition) {
      const barsHeld = Math.floor((evaluation.barTime - openPosition.entryTime.getTime()) / barMs);
      if (barsHeld >= maxBarsFromNotes(openPosition.notes)) {
        await closeOpenPosition('max_bars');
      }
    }

    const strategySignal = evaluation.signal;
    if (strategySignal) {
      patch.lastSignal = strategySignal.side;
      patch.lastSignalAt = new Date(evaluation.barTime);
      patch.signalCount = run.signalCount + 1;

      let shouldEnter = !openPosition;
      if (openPosition) {
        // Same rule as the simulator: an open position blocks a new signal
        // unless the signal explicitly exits (same side) or flips (opposite).
        if (strategySignal.exit === true && strategySignal.side === openPosition.side) {
          await closeOpenPosition('manual');
          shouldEnter = false;
        } else if (strategySignal.flip === true && strategySignal.side !== openPosition.side) {
          await closeOpenPosition('manual');
          shouldEnter = true;
        }
      }

      if (shouldEnter) {
        const entry = strategySignal.entry ?? 'market';
        const trailingDistance = resolveTrailingDistance(
          strategySignal,
          evaluation.latestAtr,
          evaluation.latestClose,
        );
        const maxBars = resolveMaxBars(strategySignal.maxBars);
        const notes = strategyNotes(run, maxBars);
        const sharedInput = {
          account: run.accountId,
          symbol: run.symbol as Symbol,
          side: strategySignal.side === 'long' ? ('buy' as const) : ('sell' as const),
          riskPct: strategySignal.riskPct ?? run.riskPct,
          stopLoss: strategySignal.stop,
          ...(strategySignal.target !== undefined ? { takeProfit: strategySignal.target } : {}),
          ...(trailingDistance !== undefined ? { trailingStop: trailingDistance } : {}),
          ...(strategySignal.breakEvenAtR !== undefined
            ? { breakEvenAtR: strategySignal.breakEvenAtR }
            : {}),
          timeInForce: 'gtc' as const,
          notes,
        };

        if (entry === 'market') {
          const order = await placeOrderForUser({
            userId,
            settings,
            source: 'strategy',
            ...(signal ? { signal } : {}),
            input: { ...sharedInput, type: 'market' },
          });
          if (order.position) {
            positionId = order.position.id;
            patch.positionId = order.position.id;
            patch.orderCount = run.orderCount + 1;
            entered += 1;
          }
        } else {
          // Cancel this run's stale resting entry first: the backtester allows
          // only one pending limit at a time.
          const pending = await listOrders(userId, {
            accountId: run.accountId,
            symbol: run.symbol,
            status: 'pending',
            limit: 100,
          });
          for (const order of pending) {
            if (!isStrategyOrderForRun(order.notes, run)) continue;
            await cancelOrderForUser({ userId, orderId: order.id });
          }

          const expiresAt = new Date(
            evaluation.barTime + resolveValidBars(strategySignal.validBars) * barMs,
          );
          const order = await placeOrderForUser({
            userId,
            settings,
            source: 'strategy',
            expiresAt,
            ...(signal ? { signal } : {}),
            input: { ...sharedInput, type: 'limit', price: entry },
          });
          if (order.order) {
            patch.orderCount = run.orderCount + 1;
            entered += 1;
          }
        }
      }
    }
  } catch (err) {
    // Record the bar even when the order is rejected so the same signal is
    // not retried every minute until the next bar.
    await updateStrategyRun(userId, run.id, {
      ...patch,
      lastError: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  await updateStrategyRun(userId, run.id, patch);
  return { entered, closed };
}
