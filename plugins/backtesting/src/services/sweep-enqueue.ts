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

// R16 (audit 2026-10-31) — queue hand-off for parameter sweeps.
//
// This is the only way sweep work starts: the web process persists the row
// and enqueues; the worker's `executeSweep` runs the engine. Kept apart from
// `sweep-service.ts` so the engine itself stays free of queue concerns.

import { BACKTEST_SWEEP_QUEUE, enqueueJob } from '@kestrel/db/queue';

import { updateBacktestSweep } from '../db/queries';
import type { BacktestSweepRow } from '../db/tables';
import type { SweepInput } from '../schemas';
import { createSweepForUser } from './sweep-service';

/** The queue rejected the sweep, so it will never run. Maps to HTTP 503. */
export class SweepQueueUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SweepQueueUnavailableError';
  }
}

async function markSweepFailed(userId: string, sweepId: string, error: string): Promise<void> {
  // The original queue/DB error is what the caller reports; a failure to mark
  // the row must not replace it.
  await updateBacktestSweep(userId, sweepId, { status: 'failed', error }).catch(() => undefined);
}

/**
 * Create a sweep and hand it to the worker queue.
 *
 * On a queue failure the row is marked failed so the UI never shows a sweep
 * that cannot run, and `SweepQueueUnavailableError` is thrown for the caller
 * to map.
 */
export async function enqueueSweepForUser(args: {
  userId: string;
  tenantId: string;
  input: SweepInput;
  settings: Readonly<Record<string, unknown>>;
}): Promise<{ row: BacktestSweepRow; jobId: string }> {
  const row = await createSweepForUser({
    userId: args.userId,
    input: args.input,
    settings: args.settings,
  });

  let jobId: string | null;
  try {
    jobId = await enqueueJob(BACKTEST_SWEEP_QUEUE, {
      userId: args.userId,
      tenantId: args.tenantId,
      sweepId: row.id,
      settings: args.settings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markSweepFailed(args.userId, row.id, `The background queue is unavailable: ${message}`);
    throw new SweepQueueUnavailableError(
      'The background queue is unavailable. The sweep was not started.',
    );
  }
  if (!jobId) {
    await markSweepFailed(
      args.userId,
      row.id,
      'The background queue rejected the sweep job (duplicate key or unavailable).',
    );
    throw new SweepQueueUnavailableError(
      'The background queue rejected the sweep job. The sweep was not started.',
    );
  }

  return { row, jobId };
}
