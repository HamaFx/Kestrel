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

// Paper Trading account tools.
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
  GetAccountsInputSchema,
  GetAccountsOutputSchema,
  ResetAccountInputSchema,
  ResetAccountOutputSchema,
  UpdateAccountInputSchema,
  UpdateAccountOutputSchema,
} from '../schemas';
import { listAccountViews, resetAccountForUser, updateAccountForUser } from '../services/accounts';
import { normaliseSettings } from '../settings';

export const getAccountsTool: PluginToolRegistration<
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

export const updateAccountTool: PluginToolRegistration<
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

export const resetAccountTool: PluginToolRegistration<
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
