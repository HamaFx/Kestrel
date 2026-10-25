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

// Agent tools shipped by the Backtesting Lab.
//
// Strategy execution is a computation, not a financial mutation: the run tool
// is `read-only` and never needs an approval card. Library writes (saving a
// strategy or knowledge note) are `write` because they persist user data, but
// they explicitly opt out of confirmation — they cannot move money or touch
// the market.

import type { PluginToolRegistration } from '@kestrel/plugin-sdk';
import type { z } from 'zod';

import {
  deleteBacktestStrategy,
  getBacktestStrategy,
  listBacktestStrategies,
  upsertBacktestStrategy,
} from './db/queries';
import type { BacktestStrategyRow } from './db/tables';
import { deleteKnowledge, listKnowledge, readKnowledge, saveKnowledge } from './knowledge';
import {
  DeleteStrategyInputSchema,
  GetRunInputSchema,
  KnowledgeDeleteInputSchema,
  KnowledgeListInputSchema,
  KnowledgeListOutputSchema,
  KnowledgeReadInputSchema,
  KnowledgeReadOutputSchema,
  KnowledgeSaveInputSchema,
  KnowledgeSaveOutputSchema,
  ListRunsInputSchema,
  ListRunsOutputSchema,
  ListStrategiesInputSchema,
  ListStrategiesOutputSchema,
  OkOutputSchema,
  ReadStrategyInputSchema,
  ReadStrategyOutputSchema,
  RunBacktestInputSchema,
  RunDetailSchema,
  RunResultSchema,
  SaveStrategyInputSchema,
  SaveStrategyOutputSchema,
  slugifyName,
  type RunResult,
} from './schemas';
import { getRunDetail, listRunSummaries, runBacktestForUser } from './services/run-service';

function strategySummary(row: BacktestStrategyRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    tags: row.tags,
    favorite: row.favorite,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function compactRunForModel(output: RunResult): Record<string, unknown> {
  const m = output.metrics;
  const sample = output.trades.slice(-10).map((trade) => ({
    side: trade.side,
    entryTime: trade.entryTime,
    exitTime: trade.exitTime,
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice,
    pnl: trade.pnl,
    rMultiple: trade.rMultiple,
    exitReason: trade.exitReason,
    reason: trade.reason,
  }));
  return {
    runId: output.runId,
    symbol: output.symbol,
    timeframe: output.timeframe,
    name: output.name,
    bars: output.bars,
    trades: m.trades,
    winRatePct: m.winRate,
    profitFactor: m.profitFactor,
    netPnl: m.netPnl,
    returnPct: m.returnPct,
    expectancyR: m.expectancyR,
    totalR: m.totalR,
    maxDrawdownPct: m.maxDrawdownPct,
    maxDrawdown: m.maxDrawdown,
    sharpeRatio: m.sharpeRatio,
    sortinoRatio: m.sortinoRatio,
    averageBarsHeld: m.averageBarsHeld,
    exposurePct: m.exposurePct,
    longTrades: m.longTrades,
    shortTrades: m.shortTrades,
    longWinRate: m.longWinRate,
    shortWinRate: m.shortWinRate,
    consecutiveWins: m.consecutiveWins,
    consecutiveLosses: m.consecutiveLosses,
    feesPaid: m.feesPaid,
    finalEquity: m.finalEquity,
    rejectedSignals: output.rejectedSignals.length,
    warnings: output.warnings,
    truncated: output.truncated,
    recentTrades: sample,
    note:
      m.trades < 20
        ? 'Fewer than 20 trades — treat these metrics as anecdotal, not statistically meaningful.'
        : 'Sharpe/Sortino are per-trade scores scaled by sqrt(trades), not annualised fund ratios.',
  };
}

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

const saveStrategyTool: PluginToolRegistration<
  z.infer<typeof SaveStrategyInputSchema>,
  z.infer<typeof SaveStrategyOutputSchema>
> = {
  name: 'backtest_save_strategy',
  description:
    'Save (or update) a strategy in the user’s Backtesting Lab library so it can be reused by name/slug in later runs. Saving is idempotent per slug: sending the same slug updates the source and params instead of creating a duplicate.',
  inputSchema: SaveStrategyInputSchema,
  outputSchema: SaveStrategyOutputSchema,
  access: 'write',
  requiresConfirmation: false,
  attachTo: ['canonical-chat', 'technical'],
  execute: async (input, ctx) => {
    const slug = input.slug ?? slugifyName(input.name);
    if (!slug) throw new Error('Could not derive a slug from the strategy name.');
    const row = await upsertBacktestStrategy({
      userId: ctx.userId,
      name: input.name,
      slug,
      description: input.description ?? '',
      source: input.source,
      params: input.params ?? {},
      tags: input.tags ?? [],
      ...(input.favorite !== undefined ? { favorite: input.favorite } : {}),
    });
    return {
      ok: true,
      strategy: strategySummary(row),
      message: `Saved strategy "${row.name}" as ${row.slug}.`,
    };
  },
};

const listStrategiesTool: PluginToolRegistration<
  z.infer<typeof ListStrategiesInputSchema>,
  z.infer<typeof ListStrategiesOutputSchema>
> = {
  name: 'backtest_list_strategies',
  description:
    'List strategies saved in the user’s Backtesting Lab library. Use the returned slug with backtest_run_strategy({ strategyId }) or backtest_read_strategy to inspect its source.',
  inputSchema: ListStrategiesInputSchema,
  outputSchema: ListStrategiesOutputSchema,
  access: 'read-only',
  attachTo: ['canonical-chat', 'technical'],
  execute: async (input, ctx) => {
    const rows = await listBacktestStrategies(ctx.userId, { limit: input.limit });
    return { strategies: rows.map(strategySummary) };
  },
};

const readStrategyTool: PluginToolRegistration<
  z.infer<typeof ReadStrategyInputSchema>,
  z.infer<typeof ReadStrategyOutputSchema>
> = {
  name: 'backtest_read_strategy',
  description:
    'Read a saved strategy’s exact JavaScript source and default params by id or slug, so you can review, explain or fork it.',
  inputSchema: ReadStrategyInputSchema,
  outputSchema: ReadStrategyOutputSchema,
  access: 'read-only',
  attachTo: ['canonical-chat', 'technical'],
  execute: async (input, ctx) => {
    const row = await getBacktestStrategy(ctx.userId, input.strategyId);
    if (!row) throw new Error(`Saved strategy "${input.strategyId}" was not found.`);
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      source: row.source,
      params: row.params,
      tags: row.tags,
    };
  },
};

const deleteStrategyTool: PluginToolRegistration<
  z.infer<typeof DeleteStrategyInputSchema>,
  z.infer<typeof OkOutputSchema>
> = {
  name: 'backtest_delete_strategy',
  description: 'Delete a strategy from the user’s Backtesting Lab library by id or slug.',
  inputSchema: DeleteStrategyInputSchema,
  outputSchema: OkOutputSchema,
  access: 'write',
  requiresConfirmation: false,
  attachTo: ['canonical-chat'],
  execute: async (input, ctx) => {
    const deleted = await deleteBacktestStrategy(ctx.userId, input.strategyId);
    return {
      ok: deleted,
      message: deleted ? 'Strategy deleted.' : 'No such strategy was found.',
    };
  },
};

const listKnowledgeTool: PluginToolRegistration<
  z.infer<typeof KnowledgeListInputSchema>,
  z.infer<typeof KnowledgeListOutputSchema>
> = {
  name: 'backtest_knowledge_list',
  description:
    'List the user’s private strategy knowledge documents (their own playbooks, notes, and research). Check this before designing a strategy that should follow the user’s own rules.',
  inputSchema: KnowledgeListInputSchema,
  outputSchema: KnowledgeListOutputSchema,
  access: 'read-only',
  attachTo: ['canonical-chat', 'technical', 'fundamental', 'risk', 'sentiment'],
  execute: async (_input, ctx) => ({ documents: await listKnowledge(ctx) }),
};

const readKnowledgeTool: PluginToolRegistration<
  z.infer<typeof KnowledgeReadInputSchema>,
  z.infer<typeof KnowledgeReadOutputSchema>
> = {
  name: 'backtest_knowledge_read',
  description:
    'Read one private strategy knowledge document by key. Use it when the user references their own playbook or when you need their exact entry/exit rules.',
  inputSchema: KnowledgeReadInputSchema,
  outputSchema: KnowledgeReadOutputSchema,
  access: 'read-only',
  attachTo: ['canonical-chat', 'technical', 'fundamental', 'risk', 'sentiment'],
  execute: async (input, ctx) => {
    const document = await readKnowledge(ctx, input.key);
    if (!document) throw new Error(`Knowledge document "${input.key}" was not found.`);
    return document;
  },
};

const saveKnowledgeTool: PluginToolRegistration<
  z.infer<typeof KnowledgeSaveInputSchema>,
  z.infer<typeof KnowledgeSaveOutputSchema>
> = {
  name: 'backtest_knowledge_save',
  description:
    'Save or update a private strategy knowledge document (Markdown). Use this when the user dictates rules or asks you to remember a playbook for future backtests.',
  inputSchema: KnowledgeSaveInputSchema,
  outputSchema: KnowledgeSaveOutputSchema,
  access: 'write',
  requiresConfirmation: false,
  attachTo: ['canonical-chat', 'technical'],
  execute: async (input, ctx) => {
    const saved = await saveKnowledge(ctx, input);
    return {
      ok: true,
      key: saved.key,
      title: saved.title,
      message: `Saved "${saved.title}" as ${saved.key}.`,
    };
  },
};

const deleteKnowledgeTool: PluginToolRegistration<
  z.infer<typeof KnowledgeDeleteInputSchema>,
  z.infer<typeof OkOutputSchema>
> = {
  name: 'backtest_knowledge_delete',
  description: 'Delete one private strategy knowledge document by key.',
  inputSchema: KnowledgeDeleteInputSchema,
  outputSchema: OkOutputSchema,
  access: 'write',
  requiresConfirmation: false,
  attachTo: ['canonical-chat'],
  execute: async (input, ctx) => {
    const deleted = await deleteKnowledge(ctx, input.key);
    return {
      ok: deleted,
      message: deleted ? 'Knowledge document deleted.' : 'No such document was found.',
    };
  },
};

export const backtestingTools: readonly PluginToolRegistration[] = [
  runTool,
  listRunsTool,
  getRunTool,
  saveStrategyTool,
  listStrategiesTool,
  readStrategyTool,
  deleteStrategyTool,
  listKnowledgeTool,
  readKnowledgeTool,
  saveKnowledgeTool,
  deleteKnowledgeTool,
];
