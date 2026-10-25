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

// Minimal DB surface and aggregate rows used by the health probes.

import type { SQLWrapper } from 'drizzle-orm';

export interface HealthSloDb {
  execute: (query: string | SQLWrapper) => Promise<unknown>;
}

export interface TickAggregate {
  symbolCount: number;
  oldestAgeSeconds: number | null;
}

export interface CronAggregate {
  total: number;
  done: number;
  stuck: number;
}

export interface ToolAggregate {
  total: number;
  ok: number;
}

export interface ChatAggregate {
  turns: number;
}

export interface AnalysisAggregate {
  stale: number;
  stuck: number;
}

export interface OperationalAggregate {
  fullTotal: number;
  fullCompleted: number;
  fullFailed: number;
  sentimentTotal: number;
  sentimentSucceeded: number;
  outboxTerminal: number;
  outboxCompleted: number;
  outboxDead: number;
  budgetTerminal: number;
  budgetErrors: number;
  traceTotal: number;
  traceFailed: number;
  providerFallbackTraces: number;
}

export interface DailySpendRow {
  userId: string;
  spendUsdCents: number;
}
