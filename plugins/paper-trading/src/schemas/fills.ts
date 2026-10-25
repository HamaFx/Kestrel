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

// Tool/API schemas for the Paper Trading broker — fills.

import { z } from 'zod';

import { AccountRefSchema } from './accounts';

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

// ── API payloads ─────────────────────────────────────────────────────────

export const ListFillsQuerySchema = z.object({
  account: AccountRefSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const ListFillsOutputSchema = z.object({
  fills: z.array(FillSchema),
});
