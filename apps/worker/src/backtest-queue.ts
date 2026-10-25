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

// Durable backtest worker.
//
// The web plugin API enqueues a `backtest-run` job with the user's decrypted
// (non-secret) settings. This worker re-enters the user's tenant transaction,
// runs the same `runBacktestForUser` service as the synchronous chat path, and
// stores the run id as the job output for the UI to poll.

import { withTenantDb } from '@kestrel/db';
import { BACKTEST_RUN_QUEUE, workQueue } from '@kestrel/db/queue';
import { BacktestQueueJobSchema, runBacktestForUser } from '@kestrel/plugin-backtesting/server';

import type { Logger } from './log.js';

export async function startBacktestQueueWorker(log: Logger): Promise<string> {
  const queueLog = log.with({ module: 'backtest-queue' });

  return workQueue(BACKTEST_RUN_QUEUE, async (job) => {
    const parsed = BacktestQueueJobSchema.safeParse(job.data);
    if (!parsed.success) {
      throw new Error(
        `Invalid backtest job payload: ${parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ')}`,
      );
    }
    const { userId, tenantId, settings, input } = parsed.data;
    const startedAt = Date.now();
    queueLog.info('backtest job started', { jobId: job.id, userId });

    const response = await withTenantDb(
      tenantId,
      () =>
        runBacktestForUser({
          userId,
          input,
          settings,
          signal: job.signal,
        }),
      { userId },
    );

    queueLog.info('backtest job completed', {
      jobId: job.id,
      runId: response.row.id,
      userId,
      durationMs: Date.now() - startedAt,
      trades: response.result.metrics.trades,
    });
    return { runId: response.row.id };
  });
}
