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

// Server-only surface for the worker queue handler and tests.
//
// Kept out of the root plugin entry so the client UI never pulls the database
// schema, candle adapter, or QuickJS sandbox into a browser chunk.

import { z } from 'zod';

import { RunBacktestInputSchema } from './schemas';
import { normaliseSettings } from './settings';

export {
  deleteRun,
  ENGINE_VERSION,
  getRunDetail,
  listRunSummaries,
  runBacktestForUser,
  toRunDetail,
  toRunResult,
  toRunSummary,
  type BacktestRunRequest,
  type BacktestRunResponse,
} from './services/run-service';
export { normaliseSettings, type BacktestSettings } from './settings';
export { RunBacktestInputSchema, RunResultSchema, type RunResult } from './schemas';

/** Payload stored in `pgboss` for an async backtest run. */
export const BacktestQueueJobSchema = z.object({
  userId: z.string().min(1),
  tenantId: z.string().min(1),
  /** Decrypted, non-secret plugin settings at enqueue time. */
  settings: z.record(z.string(), z.unknown()),
  input: RunBacktestInputSchema,
});

export type BacktestQueueJob = z.infer<typeof BacktestQueueJobSchema>;

/** Helper for callers that only have a raw settings record. */
export function backtestSettings(raw: Readonly<Record<string, unknown>>) {
  return normaliseSettings(raw);
}
