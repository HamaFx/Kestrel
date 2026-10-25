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

// Tool/API schemas for the Paper Trading broker — virtual accounts.

import { z } from 'zod';

export const AccountModeSchema = z.enum(['confirm', 'autonomous_sandbox']);

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

// ── Tools ────────────────────────────────────────────────────────────────

export const GetAccountsInputSchema = z.object({});

export const GetAccountsOutputSchema = z.object({
  accounts: z.array(AccountSchema),
  totalEquity: z.number(),
  totalUnrealizedPnl: z.number(),
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

// ── API payloads ─────────────────────────────────────────────────────────

export const AccountParamsSchema = z.object({
  accountId: z.string().min(1),
});

export function isAccountMode(value: string): value is 'confirm' | 'autonomous_sandbox' {
  return value === 'confirm' || value === 'autonomous_sandbox';
}
