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

// Journal CRUD input contracts.

import type { Symbol, TradeOutcome, TradeSide } from '@kestrel/shared';

export interface CreateJournalInput {
  symbol: Symbol;
  side: TradeSide;
  openedAt: number;
  entry: number;
  stop?: number | null;
  target?: number | null;
  size?: number | null;
  notes?: string | null;
  tags?: string[];
  screenshotUrl?: string | null;
  userId: string;
}

export interface UpdateJournalInput {
  closedAt?: number | null | undefined;
  exit?: number | null | undefined;
  stop?: number | null | undefined;
  target?: number | null | undefined;
  size?: number | null | undefined;
  outcome?: TradeOutcome | undefined;
  notes?: string | null | undefined;
  tags?: string[] | undefined;
}
