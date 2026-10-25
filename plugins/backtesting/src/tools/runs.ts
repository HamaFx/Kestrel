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

// Run tools: execute a backtest, list saved runs and fetch one run's detail.

import type { PluginToolRegistration } from '@kestrel/plugin-sdk';
import type { z } from 'zod';

import {
  GetRunInputSchema,
  ListRunsInputSchema,
  ListRunsOutputSchema,
  RunBacktestInputSchema,
  RunDetailSchema,
  RunResultSchema,
} from '../schemas';
import { getRunDetail, listRunSummaries, runBacktestForUser } from '../services/run-service';
import { compactRunForModel } from './shared';

const runTool: PluginToolRegistration<
  z.infer<typeof RunBacktestInputSchema>,
  z.infer<typeof RunResultSchema>
> = {
  name: 'backtest_run_strategy',
  description: [
    'Run a deterministic, look-ahead-safe backtest of an agent-authored JavaScript strategy.',
    'The strategy must define `function getSignal(ctx)` and return null or { side, stop, target?, entry?, riskPct?, maxBars?, trailing?, breakEvenAtR?, reason?, tags? }.',
    'ctx exposes: i, bars, t, open/high/low/close/volume, params, price(offset), series(name, offset), smc { fvg, orderBlock, sweep, structure, swingHigh, swingLow, pdh, pdl, asianHigh, asianLow }, session, atr(offset).',
    'Series names: ema20, ema50, ema200, sma20, sma50, rsi14, atr14, adx14, macd, macdSignal, macdHistogram, bbUpper, bbMiddle, bbLower, bbWidth, stochK, stochD, stochRsi, supertrend, supertrendDirection, vwap, obv, cci20, williamsR14, psar, keltnerUpper, keltnerLower, donchianUpper, donchianLower, mfi14, roc12, volumeSma20, atrPercent.',
    'Accessors reject forward offsets (series(name, 1) throws). Signals are generated at a bar close and fill at the NEXT bar open (market) or at a later limit touch. If a bar touches both stop and target, the stop wins.',
    'Every signal must include a protective stop. Risk is sized from the stop distance and the run riskPct; leverage caps notional exposure.',
    'The full equity curve and trade list are streamed to the UI; you receive a compact scorecard. Iterate on the strategy only when metrics justify it — avoid overfitting to a single window.',
  ].join(' '),
  inputSchema: RunBacktestInputSchema,
  outputSchema: RunResultSchema,
  access: 'read-only',
  attachTo: ['canonical-chat', 'technical', 'risk'],
  toModelOutput: compactRunForModel,
  execute: async (input, ctx) => {
    const response = await runBacktestForUser({
      userId: ctx.userId,
      input,
      settings: ctx.settings,
      ...(ctx.signal ? { signal: ctx.signal } : {}),
    });
    return response.result;
  },
};

const listRunsTool: PluginToolRegistration<
  z.infer<typeof ListRunsInputSchema>,
  z.infer<typeof ListRunsOutputSchema>
> = {
  name: 'backtest_list_runs',
  description:
    'List the user’s recent backtest runs with a compact scorecard (trades, win rate, net P&L, return, max drawdown, profit factor, expectancy R). Use before referencing a run id or when the user asks "what did I test last?".',
  inputSchema: ListRunsInputSchema,
  outputSchema: ListRunsOutputSchema,
  access: 'read-only',
  attachTo: ['canonical-chat', 'technical', 'risk'],
  execute: async (input, ctx) => {
    const runs = await listRunSummaries(ctx.userId, {
      limit: input.limit,
      ...(input.symbol ? { symbol: input.symbol } : {}),
    });
    return { runs, totalReturned: runs.length };
  },
};

const getRunTool: PluginToolRegistration<
  z.infer<typeof GetRunInputSchema>,
  z.infer<typeof RunDetailSchema>
> = {
  name: 'backtest_get_run',
  description:
    'Fetch a saved backtest run by id, including its exact strategy source, params, full trade list (capped), equity curve, rejected signals and warnings. Use it to explain why a run behaved the way it did or to iterate on its code.',
  inputSchema: GetRunInputSchema,
  outputSchema: RunDetailSchema,
  access: 'read-only',
  attachTo: ['canonical-chat', 'technical', 'risk'],
  execute: async (input, ctx) => {
    const detail = await getRunDetail(ctx.userId, input.runId);
    if (!detail) throw new Error(`Backtest run "${input.runId}" was not found.`);
    return detail;
  },
};

export const runTools: readonly PluginToolRegistration[] = [runTool, listRunsTool, getRunTool];
