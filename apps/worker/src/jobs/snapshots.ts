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

// Daily snapshot refresh. The runner is shared with the `/api/cron/snapshots`
// fallback route via `@kestrel/ai`: it computes one HLOC/pivot/ATR/key-level
// row per symbol and tail-prunes `candles_1m` to the retention window.

import { runSnapshotRefresh } from '@kestrel/ai/cron';

import type { JobContext, JobResult } from './types.js';

export async function runSnapshots(ctx: JobContext): Promise<JobResult> {
  const result = await runSnapshotRefresh({ signal: ctx.signal, log: ctx.log });
  return { processed: result.processed, note: result.note };
}
