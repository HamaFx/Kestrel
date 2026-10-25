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

// Run routes: listing, synchronous and queued execution, job status, detail
// and deletion.

import { BACKTEST_RUN_QUEUE, enqueueJob, getQueueJob } from '@kestrel/db/queue';
import type { PluginApiRouteHandler } from '@kestrel/plugin-sdk';

import { ListRunsInputSchema, RunBacktestInputSchema, type RunJobStatus } from '../../schemas';
import {
  deleteRun,
  getRunDetail,
  listRunSummaries,
  runBacktestForUser,
} from '../../services/run-service';
import { ApiError, byMethod, json, parseBody, queryNumber, wrap } from './shared';

// ── Runs ─────────────────────────────────────────────────────────────────

const listRuns = wrap(async (ctx) => {
  const limit = Math.min(50, Math.max(1, queryNumber(ctx.request, 'limit', 20)));
  const symbol = new URL(ctx.request.url).searchParams.get('symbol') ?? undefined;
  const parsed = ListRunsInputSchema.parse({
    limit,
    ...(symbol ? { symbol } : {}),
  });
  const runs = await listRunSummaries(ctx.userId, {
    limit: parsed.limit,
    ...(parsed.symbol ? { symbol: parsed.symbol } : {}),
  });
  return json({ runs, totalReturned: runs.length });
});

const createRun = wrap(
  async (ctx) => {
    const input = await parseBody(ctx.request, RunBacktestInputSchema);
    const response = await runBacktestForUser({
      userId: ctx.userId,
      input,
      settings: ctx.settings,
      signal: ctx.request.signal,
    });
    return json({
      run: response.result,
      source: response.source,
      logs: response.logs,
    });
  },
  { userErrorStatus: 400 },
);

const getRun = wrap(async (ctx) => {
  const runId = ctx.params['runId'];
  if (!runId) throw new ApiError(400, 'A run id is required.', 'MISSING_RUN_ID');
  const detail = await getRunDetail(ctx.userId, runId);
  if (!detail) throw new ApiError(404, 'Backtest run not found.', 'RUN_NOT_FOUND');
  return json({ run: detail });
});

const removeRun = wrap(async (ctx) => {
  const runId = ctx.params['runId'];
  if (!runId) throw new ApiError(400, 'A run id is required.', 'MISSING_RUN_ID');
  const deleted = await deleteRun(ctx.userId, runId);
  if (!deleted) throw new ApiError(404, 'Backtest run not found.', 'RUN_NOT_FOUND');
  return json({ ok: true });
});

const createRunAsync = wrap(
  async (ctx) => {
    const input = await parseBody(ctx.request, RunBacktestInputSchema);
    try {
      const jobId = await enqueueJob(BACKTEST_RUN_QUEUE, {
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        settings: ctx.settings,
        // Async runs must be persisted so the UI can navigate to the run id.
        input: { ...input, persist: true },
      });
      if (!jobId) {
        throw new ApiError(
          503,
          'The background queue rejected the job (duplicate key or unavailable).',
          'QUEUE_REJECTED',
        );
      }
      return json(
        {
          jobId,
          message:
            'Backtest queued. The worker will persist the run and stream the result to the run page.',
        },
        202,
      );
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(
        503,
        `The background queue is unavailable: ${
          err instanceof Error ? err.message : String(err)
        }. Run the backtest synchronously instead.`,
        'QUEUE_UNAVAILABLE',
      );
    }
  },
  { userErrorStatus: 400 },
);

const getRunJob = wrap(async (ctx) => {
  const jobId = ctx.params['jobId'];
  if (!jobId) throw new ApiError(400, 'A job id is required.', 'MISSING_JOB_ID');
  let job;
  try {
    job = await getQueueJob(BACKTEST_RUN_QUEUE, jobId);
  } catch (err) {
    throw new ApiError(
      503,
      `The background queue is unavailable: ${err instanceof Error ? err.message : String(err)}`,
      'QUEUE_UNAVAILABLE',
    );
  }
  if (!job || job.data?.['userId'] !== ctx.userId) {
    throw new ApiError(404, 'Backtest job not found.', 'JOB_NOT_FOUND');
  }
  const output =
    job.output && typeof job.output === 'object' ? (job.output as Record<string, unknown>) : null;
  const runId = typeof output?.['runId'] === 'string' ? output['runId'] : null;
  const state = job.state;
  const status: RunJobStatus = {
    jobId: job.id,
    state,
    runId,
    error:
      state === 'failed' ? 'The backtest job failed after retries. Check the worker logs.' : null,
    message:
      state === 'completed'
        ? 'Backtest completed.'
        : state === 'active'
          ? 'Worker is running the backtest.'
          : state === 'created' || state === 'retry'
            ? 'Waiting for a worker.'
            : `Job ${state}.`,
  };
  return json(status);
});

export const runRoutes: Readonly<Record<string, PluginApiRouteHandler>> = {
  '/runs': byMethod({ GET: listRuns, POST: createRun }),
  '/runs/async': byMethod({ POST: createRunAsync }),
  '/jobs/:jobId': byMethod({ GET: getRunJob }),
  '/runs/:runId': byMethod({ GET: getRun, DELETE: removeRun }),
};
