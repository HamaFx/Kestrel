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

// Paper Trading order tools.
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
  ListOrdersInputSchema,
  ListOrdersOutputSchema,
  PlaceOrderInputSchema,
  PlaceOrderOutputSchema,
} from '../schemas';
import { accountModeForRef, resolvePaperAccount } from '../services/accounts';
import { cancelOrderForUser, listOrderViews, placeOrderForUser } from '../services/trading';
import { normaliseSettings } from '../settings';

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

export const placeOrderTool: PluginToolRegistration<
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

export const listOrdersTool: PluginToolRegistration<
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

export const cancelOrderTool: PluginToolRegistration<
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
