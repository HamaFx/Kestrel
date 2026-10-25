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

// Tool/API schemas for the Paper Trading broker — orders.

import { SymbolSchema } from '@kestrel/shared';
import { z } from 'zod';

import { AccountRefSchema, AccountSchema } from './accounts';
import { PositionSchema } from './positions';

export const OrderSideSchema = z.enum(['buy', 'sell']);
export const OrderTypeSchema = z.enum(['market', 'limit', 'stop']);
export const OrderStatusSchema = z.enum(['pending', 'filled', 'cancelled', 'rejected', 'expired']);

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

// ── Tools ────────────────────────────────────────────────────────────────

export const ListOrdersInputSchema = z.object({
  account: AccountRefSchema.optional(),
  status: z.enum(['pending', 'filled', 'cancelled', 'all']).default('pending'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const ListOrdersOutputSchema = z.object({
  orders: z.array(OrderSchema),
  count: z.number().int(),
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
