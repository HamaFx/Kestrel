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

// Paper Trading position tools.
//
// Confirmation policy (D-02):
//   * Personal Demo (mode 'confirm') — order placement and risk changes need
//     the Mastra approval card before execution.
//   * AI Agent Sandbox (mode 'autonomous_sandbox') — agents may place, trail
//     and close trades without approval.
// Closing a position and cancelling a pending order are always risk-reducing,
// so they never block on approval.

import type { PluginToolRegistration } from '@kestrel/plugin-sdk';
import type { z } from 'zod';

import {
  ClosePositionInputSchema,
  ClosePositionOutputSchema,
  GetPositionInputSchema,
  GetPositionOutputSchema,
  ListPositionsInputSchema,
  ListPositionsOutputSchema,
  ModifyPositionInputSchema,
  ModifyPositionOutputSchema,
} from '../schemas';
import { resolvePaperAccount } from '../services/accounts';
import {
  accountModeForPosition,
  closePositionForUser,
  getPositionView,
  listPositionViews,
  modifyPositionForUser,
} from '../services/trading';
import { normaliseSettings } from '../settings';

export const listPositionsTool: PluginToolRegistration<
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

export const getPositionTool: PluginToolRegistration<
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

export const closePositionTool: PluginToolRegistration<
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

export const modifyPositionTool: PluginToolRegistration<
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
