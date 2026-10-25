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

export async function deployStrategyRunForUser(args: {
  userId: string;
  input: DeployStrategyRunInput;
  settings: PaperSettings;
}): Promise<StrategyRunView> {
  const account = await resolvePaperAccount(args.userId, 'sandbox', args.settings);
  if (account.mode !== 'autonomous_sandbox') {
    throw new StrategyRunError('Deployed strategies can only run in the AI Agent Sandbox account.');
  }
  const run = await insertStrategyRun({
    userId: args.userId,
    accountId: account.id,
    name: args.input.name.trim(),
    strategyId: args.input.strategyId ?? null,
    symbol: args.input.symbol,
    timeframe: args.input.timeframe,
    source: args.input.source,
    params: args.input.params,
    riskPct: args.input.riskPct,
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
