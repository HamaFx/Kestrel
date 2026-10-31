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

// Deployment lifecycle for paper strategy runs.

import { getBacktestRun, getBacktestStrategy } from '@kestrel/plugin-backtesting/server';
import type { Symbol, Timeframe } from '@kestrel/shared';

import {
  deleteStrategyRun,
  getStrategyRun,
  insertStrategyRun,
  listStrategyRuns,
  updateStrategyRun,
} from '../db/queries';
import type { DeployStrategyRunInput, StrategyRunView } from '../schemas';
import type { PaperSettings } from '../settings';
import { resolvePaperAccount } from './accounts';
import { strategyRunView } from './views';

export class StrategyRunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StrategyRunError';
  }
}

interface ResolvedDeployInput {
  name: string;
  strategyId: string | null;
  symbol: Symbol;
  timeframe: Timeframe;
  source: string;
  params: Record<string, unknown>;
  riskPct: number;
}

/**
 * Resolve a deploy request against the Backtesting Lab.
 *
 * The model may reference a saved strategy (`strategyId` as id or slug) or a
 * completed backtest run (`strategyId` as run id) instead of re-emitting the
 * JavaScript source. Saved strategies carry no symbol/timeframe, so those must
 * still be supplied for that path; a completed run carries everything.
 */
async function resolveDeployInput(
  userId: string,
  input: DeployStrategyRunInput,
): Promise<ResolvedDeployInput> {
  if (input.source) {
    return {
      name: input.name!,
      strategyId: input.strategyId ?? null,
      symbol: input.symbol!,
      timeframe: input.timeframe!,
      source: input.source,
      params: input.params ?? {},
      riskPct: input.riskPct,
    };
  }

  const reference = input.strategyId!;
  const strategy = await getBacktestStrategy(userId, reference);
  if (strategy) {
    if (!input.symbol || !input.timeframe) {
      throw new StrategyRunError(
        `Saved strategy "${strategy.name}" has no symbol or timeframe; pass both when deploying it.`,
      );
    }
    return {
      name: input.name ?? strategy.name,
      strategyId: strategy.slug,
      symbol: input.symbol,
      timeframe: input.timeframe,
      source: strategy.source,
      params: input.params ?? strategy.params,
      riskPct: input.riskPct,
    };
  }

  const run = await getBacktestRun(userId, reference);
  if (run) {
    return {
      name: input.name ?? run.name,
      strategyId: run.id,
      symbol: input.symbol ?? (run.symbol as Symbol),
      timeframe: input.timeframe ?? (run.timeframe as Timeframe),
      source: run.source,
      params: input.params ?? run.params,
      riskPct: input.riskPct,
    };
  }

  throw new StrategyRunError(
    `No saved strategy or backtest run matches "${reference}". Pass inline source to deploy a new strategy.`,
  );
}

export async function deployStrategyRunForUser(args: {
  userId: string;
  input: DeployStrategyRunInput;
  settings: PaperSettings;
}): Promise<StrategyRunView> {
  const account = await resolvePaperAccount(args.userId, 'sandbox', args.settings);
  if (account.mode !== 'autonomous_sandbox') {
    throw new StrategyRunError('Deployed strategies can only run in the AI Agent Sandbox account.');
  }
  const resolved = await resolveDeployInput(args.userId, args.input);
  const run = await insertStrategyRun({
    userId: args.userId,
    accountId: account.id,
    name: resolved.name.trim(),
    strategyId: resolved.strategyId,
    symbol: resolved.symbol,
    timeframe: resolved.timeframe,
    source: resolved.source,
    params: resolved.params,
    riskPct: resolved.riskPct,
    status: 'active',
  });
  return strategyRunView(run);
}

export async function listStrategyRunViews(userId: string): Promise<StrategyRunView[]> {
  const runs = await listStrategyRuns(userId);
  return runs.map(strategyRunView);
}

export async function setStrategyRunStatus(
  userId: string,
  strategyRunId: string,
  action: 'pause' | 'resume' | 'stop',
): Promise<StrategyRunView | null> {
  const existing = await getStrategyRun(userId, strategyRunId);
  if (!existing) return null;
  const status = action === 'pause' ? 'paused' : action === 'resume' ? 'active' : 'stopped';
  const updated = await updateStrategyRun(userId, strategyRunId, {
    status,
    lastError: null,
  });
  return updated ? strategyRunView(updated) : null;
}

export async function deleteStrategyRunForUser(
  userId: string,
  strategyRunId: string,
): Promise<boolean> {
  return deleteStrategyRun(userId, strategyRunId);
}
