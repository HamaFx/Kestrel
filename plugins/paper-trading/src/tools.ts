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

// Paper Trading agent tools.
//
// Confirmation policy (D-02):
//   * Personal Demo (mode 'confirm') — order placement and risk changes need
//     the Mastra approval card before execution.
//   * AI Agent Sandbox (mode 'autonomous_sandbox') — agents may place, trail
//     and close trades without approval.
// Closing a position and cancelling a pending order are always risk-reducing,
// so they never block on approval.

import type { PluginExecutionContext, PluginToolRegistration } from '@kestrel/plugin-sdk';
import type { z } from 'zod';

import {
  CancelOrderInputSchema,
  CancelOrderOutputSchema,
  ClosePositionInputSchema,
  ClosePositionOutputSchema,
  DeployStrategyRunInputSchema,
  DeployStrategyRunOutputSchema,
  GetAccountsInputSchema,
  GetAccountsOutputSchema,
  GetPositionInputSchema,
  GetPositionOutputSchema,
  ListOrdersInputSchema,
  ListOrdersOutputSchema,
  ListPositionsInputSchema,
  ListPositionsOutputSchema,
  ListStrategyRunsOutputSchema,
  ModifyPositionInputSchema,
  ModifyPositionOutputSchema,
  PlaceOrderInputSchema,
  PlaceOrderOutputSchema,
  ResetAccountInputSchema,
  ResetAccountOutputSchema,
  UpdateAccountInputSchema,
  UpdateAccountOutputSchema,
} from './schemas';
import {
  accountModeForRef,
  listAccountViews,
  resetAccountForUser,
  resolvePaperAccount,
  updateAccountForUser,
} from './services/accounts';
import { deployStrategyRunForUser, listStrategyRunViews } from './services/strategy-runs';
import {
  accountModeForPosition,
  cancelOrderForUser,
  closePositionForUser,
  getPositionView,
  listOrderViews,
  listPositionViews,
  modifyPositionForUser,
  placeOrderForUser,
} from './services/trading';
import { normaliseSettings } from './settings';

async function approvalForAccount(
  input: { account: string },
  ctx: PluginExecutionContext,
): Promise<boolean> {
  try {
    const settings = normaliseSettings(ctx.settings);
    const mode = await accountModeForRef(ctx.userId, input.account, settings);
    return mode === 'confirm';
  } catch {
    // Fail closed: an unknown account must not silently trade autonomously.
    return true;
  }
}

const getAccountsTool: PluginToolRegistration<
  z.infer<typeof GetAccountsInputSchema>,
  z.infer<typeof GetAccountsOutputSchema>
> = {
  name: 'paper_get_accounts',
  description:
    'Show the user’s two virtual paper accounts (Personal Demo and AI Agent Sandbox) with balance, equity, open P&L, margin usage and risk settings. Use before sizing a trade or when the user asks how their paper account is doing.',
  inputSchema: GetAccountsInputSchema,
  outputSchema: GetAccountsOutputSchema,
  access: 'read-only',
  attachTo: ['canonical-chat', 'technical', 'fundamental', 'risk', 'sentiment'],
  execute: async (_input, ctx) => {
    const settings = normaliseSettings(ctx.settings);
    const accounts = await listAccountViews(ctx.userId, settings);
    return {
      accounts,
      totalEquity:
        Math.round(accounts.reduce((sum, account) => sum + account.equity, 0) * 100) / 100,
      totalUnrealizedPnl:
        Math.round(accounts.reduce((sum, account) => sum + account.unrealizedPnl, 0) * 100) / 100,
    };
  },
};

const placeOrderTool: PluginToolRegistration<
  z.infer<typeof PlaceOrderInputSchema>,
  z.infer<typeof PlaceOrderOutputSchema>
> = {
  name: 'paper_place_order',
  description: [
    'Place a virtual order in a paper account. NOT a real broker order — no real money moves.',
    "account: 'personal' (approval card required) or 'sandbox' (autonomous agent sandbox).",
    'quantity is lots for FX/gold and coins for crypto. Omit it to size from riskPct (default: the account risk setting).',
    'Always pass a protective stopLoss. Limit/stop orders require a price. trailingStop is a price distance, not pips.',
    'The engine validates bracket geometry, max risk %, margin utilisation, and max open positions. A market order fills immediately at ask/bid + slippage; limit/stop orders rest until the tick bus or the minute watch job fills them.',
    'Prefer the sandbox for scheduled/autonomous strategies and the personal account when the user is present to approve.',
  ].join(' '),
  inputSchema: PlaceOrderInputSchema,
  outputSchema: PlaceOrderOutputSchema,
  access: 'write',
  requiresConfirmation: approvalForAccount,
  attachTo: ['canonical-chat', 'risk'],
  execute: async (input, ctx) => {
    const settings = normaliseSettings(ctx.settings);
    return placeOrderForUser({
      userId: ctx.userId,
      input,
      settings,
      source: 'agent',
      ...(ctx.signal ? { signal: ctx.signal } : {}),
    });
  },
};

const listPositionsTool: PluginToolRegistration<
  z.infer<typeof ListPositionsInputSchema>,
  z.infer<typeof ListPositionsOutputSchema>
> = {
  name: 'paper_list_positions',
  description:
    'List open, closed or all virtual positions with entry/exit, stop/target, unrealised P&L and R multiple. Use it before advising to hold, trail, take partials or close.',
  inputSchema: ListPositionsInputSchema,
  outputSchema: ListPositionsOutputSchema,
  access: 'read-only',
  attachTo: ['canonical-chat', 'technical', 'fundamental', 'risk', 'sentiment'],
  execute: async (input, ctx) => {
    const settings = normaliseSettings(ctx.settings);
    const account = input.account
      ? await resolvePaperAccount(ctx.userId, input.account, settings)
      : undefined;
    const positions = await listPositionViews(ctx.userId, {
      ...(account ? { accountId: account.id } : {}),
      ...(input.symbol ? { symbol: input.symbol } : {}),
      status: input.status,
      limit: input.limit,
    });
    return { positions, count: positions.length };
  },
};

const listOrdersTool: PluginToolRegistration<
  z.infer<typeof ListOrdersInputSchema>,
  z.infer<typeof ListOrdersOutputSchema>
> = {
  name: 'paper_list_orders',
  description:
    'List resting limit/stop orders (or filled/cancelled history) for the paper accounts.',
  inputSchema: ListOrdersInputSchema,
  outputSchema: ListOrdersOutputSchema,
  access: 'read-only',
  attachTo: ['canonical-chat', 'technical', 'risk'],
  execute: async (input, ctx) => {
    const settings = normaliseSettings(ctx.settings);
    const account = input.account
      ? await resolvePaperAccount(ctx.userId, input.account, settings)
      : undefined;
    const orders = await listOrderViews(ctx.userId, {
      ...(account ? { accountId: account.id } : {}),
      status: input.status,
      limit: input.limit,
    });
    return { orders, count: orders.length };
  },
};

const getPositionTool: PluginToolRegistration<
  z.infer<typeof GetPositionInputSchema>,
  z.infer<typeof GetPositionOutputSchema>
> = {
  name: 'paper_get_position',
  description: 'Fetch one paper position by id, including its full stop/target and P&L state.',
  inputSchema: GetPositionInputSchema,
  outputSchema: GetPositionOutputSchema,
  access: 'read-only',
  attachTo: ['canonical-chat', 'technical', 'risk'],
  execute: async (input, ctx) => ({
    position: await getPositionView(ctx.userId, input.positionId),
  }),
};

const cancelOrderTool: PluginToolRegistration<
  z.infer<typeof CancelOrderInputSchema>,
  z.infer<typeof CancelOrderOutputSchema>
> = {
  name: 'paper_cancel_order',
  description:
    'Cancel a resting paper limit/stop order. Risk-reducing, so it does not require an approval card.',
  inputSchema: CancelOrderInputSchema,
  outputSchema: CancelOrderOutputSchema,
  access: 'write',
  requiresConfirmation: false,
  attachTo: ['canonical-chat', 'risk'],
  execute: async (input, ctx) => {
    const result = await cancelOrderForUser({
      userId: ctx.userId,
      orderId: input.orderId,
    });
    return { ok: true, message: result.message, order: result.order };
  },
};

const closePositionTool: PluginToolRegistration<
  z.infer<typeof ClosePositionInputSchema>,
  z.infer<typeof ClosePositionOutputSchema>
> = {
  name: 'paper_close_position',
  description:
    'Close (or partially close) a paper position at the current bid/ask. Risk-reducing: no approval card is required, even on the Personal account. If a closed trade is journaled, the Journal entry is created automatically.',
  inputSchema: ClosePositionInputSchema,
  outputSchema: ClosePositionOutputSchema,
  access: 'write',
  requiresConfirmation: false,
  attachTo: ['canonical-chat', 'risk'],
  execute: async (input, ctx) => {
    const settings = normaliseSettings(ctx.settings);
    const result = await closePositionForUser({
      userId: ctx.userId,
      positionId: input.positionId,
      ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
      settings,
      source: 'agent',
      ...(ctx.signal ? { signal: ctx.signal } : {}),
      onJournalError: (err) =>
        ctx.log.warn('paper trade closed but journal sync failed', {
          err: err instanceof Error ? err.message : String(err),
        }),
    });
    const fullyClosed = result.position.status === 'closed';
    return {
      ok: true,
      message: fullyClosed
        ? `Closed ${result.position.initialQuantity} ${result.position.symbol} at ${result.position.closePrice}.`
        : `Partially closed ${input.quantity ?? 0} ${result.position.symbol}.`,
      ...result,
    };
  },
};

const modifyPositionTool: PluginToolRegistration<
  z.infer<typeof ModifyPositionInputSchema>,
  z.infer<typeof ModifyPositionOutputSchema>
> = {
  name: 'paper_modify_position',
  description:
    'Modify a paper position’s stop loss, take profit, trailing distance or breakeven threshold. The new bracket must be valid for the current price. Personal accounts require approval; the sandbox does not.',
  inputSchema: ModifyPositionInputSchema,
  outputSchema: ModifyPositionOutputSchema,
  access: 'write',
  requiresConfirmation: async (input, ctx) => {
    try {
      const mode = await accountModeForPosition(ctx.userId, input.positionId);
      return mode === 'confirm';
    } catch {
      return true;
    }
  },
  attachTo: ['canonical-chat', 'risk'],
  execute: async (input, ctx) => {
    const settings = normaliseSettings(ctx.settings);
    const result = await modifyPositionForUser({
      userId: ctx.userId,
      positionId: input.positionId,
      patch: {
        ...(input.stopLoss !== undefined ? { stopLoss: input.stopLoss } : {}),
        ...(input.takeProfit !== undefined ? { takeProfit: input.takeProfit } : {}),
        ...(input.trailingStop !== undefined ? { trailingStop: input.trailingStop } : {}),
        ...(input.breakEvenAtR !== undefined ? { breakEvenAtR: input.breakEvenAtR } : {}),
      },
      settings,
      ...(ctx.signal ? { signal: ctx.signal } : {}),
    });
    return {
      ok: true,
      message: 'Position protection updated.',
      position: result.position,
    };
  },
};

const updateAccountTool: PluginToolRegistration<
  z.infer<typeof UpdateAccountInputSchema>,
  z.infer<typeof UpdateAccountOutputSchema>
> = {
  name: 'paper_update_account',
  description:
    'Change a paper account’s default risk per trade and/or leverage. Always requires an approval card because it changes how future autonomous orders are sized.',
  inputSchema: UpdateAccountInputSchema,
  outputSchema: UpdateAccountOutputSchema,
  access: 'write',
  requiresConfirmation: true,
  attachTo: ['canonical-chat', 'risk'],
  execute: async (input, ctx) => {
    const settings = normaliseSettings(ctx.settings);
    const result = await updateAccountForUser(ctx.userId, input.account, settings, {
      ...(input.riskPerTradePct !== undefined ? { riskPerTradePct: input.riskPerTradePct } : {}),
      ...(input.leverage !== undefined ? { leverage: input.leverage } : {}),
    });
    return {
      ok: true,
      message: `Updated ${result.account.name}.`,
      account: result.view,
    };
  },
};

const resetAccountTool: PluginToolRegistration<
  z.infer<typeof ResetAccountInputSchema>,
  z.infer<typeof ResetAccountOutputSchema>
> = {
  name: 'paper_reset_account',
  description:
    'DESTRUCTIVE: wipe a paper account’s positions, orders and fills and restore its starting balance. Only do this when the user explicitly asks to reset the demo account.',
  inputSchema: ResetAccountInputSchema,
  outputSchema: ResetAccountOutputSchema,
  access: 'write',
  requiresConfirmation: true,
  attachTo: ['canonical-chat'],
  execute: async (input, ctx) => {
    const settings = normaliseSettings(ctx.settings);
    const account = await resetAccountForUser(ctx.userId, input.account, settings);
    return { ok: true, message: `Reset ${account.name} to its starting balance.`, account };
  },
};

const listStrategyRunsTool: PluginToolRegistration<
  z.infer<typeof GetAccountsInputSchema>,
  z.infer<typeof ListStrategyRunsOutputSchema>
> = {
  name: 'paper_list_strategy_runs',
  description:
    'List the user’s deployed backtest strategies in the AI Agent Sandbox with status, last signal, bar time and order counts.',
  inputSchema: GetAccountsInputSchema,
  outputSchema: ListStrategyRunsOutputSchema,
  access: 'read-only',
  attachTo: ['canonical-chat', 'technical', 'risk'],
  execute: async (_input, ctx) => {
    const runs = await listStrategyRunViews(ctx.userId);
    return { runs, count: runs.length };
  },
};

const deployStrategyTool: PluginToolRegistration<
  z.infer<typeof DeployStrategyRunInputSchema>,
  z.infer<typeof DeployStrategyRunOutputSchema>
> = {
  name: 'paper_deploy_strategy',
  description: [
    'Deploy an exact agent-authored or saved backtest strategy to the autonomous AI Agent Sandbox.',
    'Provide the strategy source and params (snapshot at deploy time), symbol, timeframe and a name.',
    'The runner evaluates getSignal(ctx) on every new closed bar and places virtual market orders with the signal stop/target; it never places a real trade.',
    'Use paper_list_strategy_runs to check status, and the Paper Trading page to pause, resume or stop.',
  ].join(' '),
  inputSchema: DeployStrategyRunInputSchema,
  outputSchema: DeployStrategyRunOutputSchema,
  access: 'write',
  requiresConfirmation: true,
  attachTo: ['canonical-chat', 'technical'],
  execute: async (input, ctx) => {
    const settings = normaliseSettings(ctx.settings);
    const run = await deployStrategyRunForUser({ userId: ctx.userId, input, settings });
    return {
      ok: true,
      message: `Deployed ${run.name} to the AI Agent Sandbox.`,
      run,
    };
  },
};

export const paperTradingTools: readonly PluginToolRegistration[] = [
  getAccountsTool,
  placeOrderTool,
  listPositionsTool,
  listOrdersTool,
  getPositionTool,
  cancelOrderTool,
  closePositionTool,
  modifyPositionTool,
  updateAccountTool,
  resetAccountTool,
  listStrategyRunsTool,
  deployStrategyTool,
];
