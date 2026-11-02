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

// Economic-calendar actuals refresh. The runner is shared with the
// `/api/cron/fred-actuals` fallback route via `@kestrel/ai`: it always runs the
// zero-key BiQuote calendar refresh first, then backfills legacy `fred:*` rows
// when FRED_API_KEY is configured.

import { runFredActualsRefresh } from '@kestrel/ai/cron';

import type { JobContext, JobResult } from './types.js';

export async function runFredActuals(ctx: JobContext): Promise<JobResult> {
  const result = await runFredActualsRefresh({
    fredApiKey: process.env['FRED_API_KEY'] ?? null,
    signal: ctx.signal,
    log: ctx.log,
  });
  ctx.log.info('fred-actuals complete', {
    biquoteUpserted: result.biquoteUpserted,
    candidates: result.candidates,
    filled: result.filled,
    skipped: result.skipped,
    errors: result.errors.length,
  });
  return { processed: result.processed, note: result.note };
}
