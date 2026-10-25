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

// Tool/API schemas for the Paper Trading broker — cross-domain summary.

import { z } from 'zod';

import { AccountSchema } from './accounts';
import { FillSchema } from './fills';
import { OrderSchema } from './orders';
import { PositionSchema } from './positions';

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
