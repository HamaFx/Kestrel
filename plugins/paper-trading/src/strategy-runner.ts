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

import { getCandles } from '@kestrel/data';
import {
  buildFeatureMatrix,
  runStrategySandbox,
  type StrategySignal,
} from '@kestrel/plugin-backtesting/engine';
import { msPerTimeframe, type Symbol, type Timeframe } from '@kestrel/shared';

import {
  getPosition,
  listStrategyRuns,
  updateStrategyRun,
  type StrategyRunPatch,
} from './db/queries';
import type { PaperStrategyRunRow } from './db/tables';
import { closePositionForUser, placeOrderForUser } from './services/trading';
import type { PaperSettings } from './settings';

const STRATEGY_LOOKBACK_BARS = 500;

export interface LatestStrategySignal {
  barTime: number;
  candleCount: number;
  signal: StrategySignal | null;
  logs: string[];
}

/** Evaluate a strategy's latest closed bar in the same engine as a backtest. */
export async function evaluateLatestStrategySignal(args: {
  symbol: string;
  timeframe: string;
  source: string;
  params: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<LatestStrategySignal> {
  const symbol = args.symbol as Symbol;
  const timeframe = args.timeframe as Timeframe;
  const candles = await getCandles(symbol, timeframe, {
    count: STRATEGY_LOOKBACK_BARS,
    includeOpenBar: false,
    ...(args.signal ? { signal: args.signal } : {}),
  });
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

  const existing = run.positionId ? await getPosition(userId, run.positionId) : undefined;
  const openPosition = existing?.status === 'open' ? existing : undefined;
  let entered = 0;
  let closed = 0;
  let positionId = openPosition?.id ?? null;
  const patch: StrategyRunPatch = {
    lastBarTime: new Date(evaluation.barTime),
    lastError: null,
    ...(positionId !== run.positionId ? { positionId } : {}),
  };

  try {
    if (evaluation.signal) {
      patch.lastSignal = evaluation.signal.side;
      patch.lastSignalAt = new Date(evaluation.barTime);
      patch.signalCount = run.signalCount + 1;

      if (openPosition && openPosition.side !== evaluation.signal.side) {
        await closePositionForUser({
          userId,
          positionId: openPosition.id,
          reason: 'strategy flip',
          settings,
          source: 'strategy',
          ...(signal ? { signal } : {}),
        });
        positionId = null;
        patch.positionId = null;
        closed += 1;
      } else if (!openPosition) {
        const order = await placeOrderForUser({
          userId,
          settings,
          source: 'strategy',
          ...(signal ? { signal } : {}),
          input: {
            account: run.accountId,
            symbol: run.symbol as Symbol,
            side: evaluation.signal.side === 'long' ? 'buy' : 'sell',
            type: 'market',
            riskPct: evaluation.signal.riskPct ?? run.riskPct,
            stopLoss: evaluation.signal.stop,
            ...(evaluation.signal.target !== undefined
              ? { takeProfit: evaluation.signal.target }
              : {}),
            timeInForce: 'gtc',
            notes: `Deployed strategy: ${run.name}${run.strategyId ? ` (${run.strategyId})` : ''}`,
          },
        });
        if (order.position) {
          positionId = order.position.id;
          patch.positionId = order.position.id;
          patch.orderCount = run.orderCount + 1;
          entered += 1;
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
