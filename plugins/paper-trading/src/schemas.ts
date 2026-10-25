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

// Tool/API schemas for the Paper Trading broker.

import { SymbolSchema, TimeframeSchema } from '@kestrel/shared';
import { z } from 'zod';

export const AccountModeSchema = z.enum(['confirm', 'autonomous_sandbox']);
export const PositionSideSchema = z.enum(['long', 'short']);
export const OrderSideSchema = z.enum(['buy', 'sell']);
export const OrderTypeSchema = z.enum(['market', 'limit', 'stop']);
export const OrderStatusSchema = z.enum(['pending', 'filled', 'cancelled', 'rejected', 'expired']);
export const PositionStatusSchema = z.enum(['open', 'closed']);
export const CloseReasonSchema = z.enum([
  'manual',
  'stop_loss',
  'take_profit',
  'trailing_stop',
  'account_reset',
]);

export const AccountRefSchema = z
  .string()
  .min(1)
  .max(64)
  .describe("Account id, or 'personal' / 'sandbox'");

export const AccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  mode: AccountModeSchema,
  currency: z.string(),
  initialBalance: z.number(),
  balance: z.number(),
  equity: z.number(),
  unrealizedPnl: z.number(),
  marginUsed: z.number(),
  freeMargin: z.number(),
  marginUtilisationPct: z.number(),
  leverage: z.number(),
  riskPerTradePct: z.number(),
  openPositions: z.number().int(),
  createdAt: z.string(),
});

export type AccountView = z.infer<typeof AccountSchema>;

export const PositionSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  accountMode: AccountModeSchema,
  accountName: z.string(),
  symbol: z.string(),
  side: PositionSideSchema,
  status: PositionStatusSchema,
  quantity: z.number(),
  initialQuantity: z.number(),
  entryPrice: z.number(),
  entryTime: z.string(),
  stopLoss: z.number().nullable(),
  takeProfit: z.number().nullable(),
  trailingStopDistance: z.number().nullable(),
  trailingStopPrice: z.number().nullable(),
  breakEvenAtR: z.number().nullable(),
  initialRiskAmount: z.number(),
  unrealizedPnl: z.number(),
  realizedPnl: z.number(),
  pnl: z.number(),
  entryFee: z.number(),
  exitFee: z.number(),
  rMultiple: z.number(),
  closePrice: z.number().nullable(),
  closeTime: z.string().nullable(),
  closeReason: CloseReasonSchema.nullable(),
  source: z.string(),
  notes: z.string().nullable(),
});

export type PositionView = z.infer<typeof PositionSchema>;

export const OrderSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  symbol: z.string(),
  side: OrderSideSchema,
  type: OrderTypeSchema,
  status: OrderStatusSchema,
  quantity: z.number(),
  riskPct: z.number().nullable(),
  limitPrice: z.number().nullable(),
  stopPrice: z.number().nullable(),
  stopLoss: z.number().nullable(),
  takeProfit: z.number().nullable(),
  trailingStopDistance: z.number().nullable(),
  breakEvenAtR: z.number().nullable(),
  timeInForce: z.enum(['gtc', 'day']),
  filledPrice: z.number().nullable(),
  filledAt: z.string().nullable(),
  positionId: z.string().nullable(),
  reason: z.string().nullable(),
  notes: z.string().nullable(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
});

export type OrderView = z.infer<typeof OrderSchema>;

export const FillSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  positionId: z.string().nullable(),
  orderId: z.string().nullable(),
  kind: z.string(),
  price: z.number(),
  quantity: z.number(),
  pnl: z.number(),
  fees: z.number(),
  ts: z.string(),
});

export type FillView = z.infer<typeof FillSchema>;

// ── Tools ────────────────────────────────────────────────────────────────

export const GetAccountsInputSchema = z.object({});

export const GetAccountsOutputSchema = z.object({
  accounts: z.array(AccountSchema),
  totalEquity: z.number(),
  totalUnrealizedPnl: z.number(),
});

export const ListPositionsInputSchema = z.object({
  account: AccountRefSchema.optional(),
  symbol: SymbolSchema.optional(),
  status: z.enum(['open', 'closed', 'all']).default('open'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const ListPositionsOutputSchema = z.object({
  positions: z.array(PositionSchema),
  count: z.number().int(),
});

export const ListOrdersInputSchema = z.object({
  account: AccountRefSchema.optional(),
  status: z.enum(['pending', 'filled', 'cancelled', 'all']).default('pending'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const ListOrdersOutputSchema = z.object({
  orders: z.array(OrderSchema),
  count: z.number().int(),
});

export const GetPositionInputSchema = z.object({
  positionId: z.string().min(1),
});

export const GetPositionOutputSchema = z.object({
  position: PositionSchema,
});

export const PlaceOrderInputSchema = z
  .object({
    account: AccountRefSchema.default('personal'),
    symbol: SymbolSchema,
    side: OrderSideSchema,
    type: OrderTypeSchema.default('market'),
    /** Size in lots (FX/gold) or coins (crypto). Omit to size from riskPct. */
    quantity: z.number().positive().max(10_000).optional(),
    /** Risk per trade; defaults to the account's riskPerTradePct. */
    riskPct: z.number().min(0.01).max(20).optional(),
    /** Required for limit/stop orders. */
    price: z.number().positive().optional(),
    stopLoss: z.number().positive().optional(),
    takeProfit: z.number().positive().optional(),
    /** Trailing distance in price units. */
    trailingStop: z.number().positive().optional(),
    breakEvenAtR: z.number().min(0).max(100).optional(),
    timeInForce: z.enum(['gtc', 'day']).default('gtc'),
    notes: z.string().max(500).optional(),
  })
  .refine((value) => value.type === 'market' || (value.price ?? 0) > 0, {
    message: 'Limit and stop orders require a price.',
  });

export type PlaceOrderInput = z.infer<typeof PlaceOrderInputSchema>;

export const PlaceOrderOutputSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  account: AccountSchema,
  order: OrderSchema.nullable(),
  position: PositionSchema.nullable(),
  warnings: z.array(z.string()),
});

export type PlaceOrderOutput = z.infer<typeof PlaceOrderOutputSchema>;

export const CancelOrderInputSchema = z.object({
  orderId: z.string().min(1),
});

export const CancelOrderOutputSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  order: OrderSchema.nullable(),
});

export const ClosePositionInputSchema = z.object({
  positionId: z.string().min(1),
  /** Partial close quantity; omit to close the whole position. */
  quantity: z.number().positive().optional(),
  reason: z.string().max(200).optional(),
});

export const ClosePositionOutputSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  position: PositionSchema,
  account: AccountSchema,
  fill: FillSchema.nullable(),
});

export const ModifyPositionInputSchema = z
  .object({
    positionId: z.string().min(1),
    stopLoss: z.number().positive().nullable().optional(),
    takeProfit: z.number().positive().nullable().optional(),
    trailingStop: z.number().positive().nullable().optional(),
    breakEvenAtR: z.number().min(0).max(100).nullable().optional(),
  })
  .refine(
    (value) =>
      value.stopLoss !== undefined ||
      value.takeProfit !== undefined ||
      value.trailingStop !== undefined ||
      value.breakEvenAtR !== undefined,
    { message: 'Provide at least one field to modify.' },
  );

export const ModifyPositionOutputSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  position: PositionSchema,
});

export const UpdateAccountInputSchema = z
  .object({
    account: AccountRefSchema.default('personal'),
    riskPerTradePct: z.number().min(0.01).max(20).optional(),
    leverage: z.number().min(1).max(500).optional(),
  })
  .refine((value) => value.riskPerTradePct !== undefined || value.leverage !== undefined, {
    message: 'Provide riskPerTradePct and/or leverage.',
  });

export const UpdateAccountOutputSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  account: AccountSchema,
});

export const ResetAccountInputSchema = z.object({
  account: AccountRefSchema.default('personal'),
  confirm: z.literal(true),
});

export const ResetAccountOutputSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  account: AccountSchema,
});

export const SummaryOutputSchema = z.object({
  accounts: z.array(AccountSchema),
  openPositions: z.array(PositionSchema),
  pendingOrders: z.array(OrderSchema),
  recentFills: z.array(FillSchema),
  recentClosed: z.array(PositionSchema),
  totalEquity: z.number(),
  totalUnrealizedPnl: z.number(),
});

export type SummaryOutput = z.infer<typeof SummaryOutputSchema>;

// ── API payloads ─────────────────────────────────────────────────────────

export const ListFillsQuerySchema = z.object({
  account: AccountRefSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const ListFillsOutputSchema = z.object({
  fills: z.array(FillSchema),
});

export const AccountParamsSchema = z.object({
  accountId: z.string().min(1),
});

// ── Deployed strategy runs ───────────────────────────────────────────────

export const DeployStrategyRunInputSchema = z.object({
  name: z.string().min(1).max(120),
  strategyId: z.string().max(120).optional(),
  symbol: SymbolSchema,
  timeframe: TimeframeSchema,
  source: z.string().min(20).max(100_000),
  params: z.record(z.string(), z.unknown()).default({}),
  riskPct: z.number().min(0.01).max(20).default(1),
  /** Deployed strategies always run in the autonomous sandbox. */
  account: z.literal('sandbox').default('sandbox'),
});

export type DeployStrategyRunInput = z.infer<typeof DeployStrategyRunInputSchema>;

export const StrategyRunStatusSchema = z.enum(['active', 'paused', 'stopped', 'error']);

export const StrategyRunSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  name: z.string(),
  strategyId: z.string().nullable(),
  symbol: z.string(),
  timeframe: z.string(),
  riskPct: z.number(),
  status: StrategyRunStatusSchema,
  lastBarTime: z.string().nullable(),
  lastSignal: z.enum(['long', 'short']).nullable(),
  lastSignalAt: z.string().nullable(),
  positionId: z.string().nullable(),
  signalCount: z.number().int(),
  orderCount: z.number().int(),
  lastError: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type StrategyRunView = z.infer<typeof StrategyRunSchema>;

export const ListStrategyRunsOutputSchema = z.object({
  runs: z.array(StrategyRunSchema),
  count: z.number().int(),
});

export const UpdateStrategyRunInputSchema = z.object({
  action: z.enum(['pause', 'resume', 'stop']),
});

export const DeployStrategyRunOutputSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  run: StrategyRunSchema,
});

export function isAccountMode(value: string): value is 'confirm' | 'autonomous_sandbox' {
  return value === 'confirm' || value === 'autonomous_sandbox';
}
