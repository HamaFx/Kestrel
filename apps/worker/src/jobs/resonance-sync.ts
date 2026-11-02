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

import { syncIntermarketResonance } from '@kestrel/ai';

import type { JobContext, JobResult } from './types.js';

/**
 * Cron wrapper around the shared intermarket resonance sync. The calculation,
 * alignment and upsert live in `@kestrel/ai` so the operator-confirmed
 * `run_system_action` mutation and this job cannot drift apart.
 */
export async function runResonanceSync(ctx: JobContext): Promise<JobResult> {
  const result = await syncIntermarketResonance({
    ...(ctx.signal ? { signal: ctx.signal } : {}),
  });

  if (result.status === 'synced') {
    ctx.log.info('resonance-sync complete', { processed: result.processed });
  } else {
    ctx.log.warn('resonance-sync skipped', { status: result.status, note: result.note });
  }

  return { processed: result.processed, note: result.note };
}
