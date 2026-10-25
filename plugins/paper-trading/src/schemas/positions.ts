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

// Tool/API schemas for the Paper Trading broker — open and closed positions.

import { SymbolSchema } from '@kestrel/shared';
import { z } from 'zod';

import { AccountModeSchema, AccountRefSchema, AccountSchema } from './accounts';
import { FillSchema } from './fills';

export const PositionSideSchema = z.enum(['long', 'short']);
export const PositionStatusSchema = z.enum(['open', 'closed']);
export const CloseReasonSchema = z.enum([
  'manual',
  'stop_loss',
  'take_profit',
  'trailing_stop',
  'account_reset',
]);

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

// ── Tools ────────────────────────────────────────────────────────────────

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

export const GetPositionInputSchema = z.object({
  positionId: z.string().min(1),
});

export const GetPositionOutputSchema = z.object({
  position: PositionSchema,
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
