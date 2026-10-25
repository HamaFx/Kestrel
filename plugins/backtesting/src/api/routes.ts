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

// Authenticated Backtesting Lab HTTP routes.
//
// Mounted by the core at /api/plugins/backtesting/<path>. The dispatcher has
// already authenticated the user, resolved the tenant, decrypted settings and
// verified that this plugin is installed — these handlers only own validation
// and the response shape.

import {
  BACKTEST_RUN_QUEUE,
  BACKTEST_SWEEP_QUEUE,
  enqueueJob,
  getQueueJob,
} from '@kestrel/db/queue';
import type {
  PluginApiRouteContext,
  PluginApiRouteHandler,
  PluginExecutionContext,
} from '@kestrel/plugin-sdk';
import type { z } from 'zod';

import {
  countBacktestRuns,
  countBacktestStrategies,
  deleteBacktestStrategy,
  deleteBacktestSweep,
  getBacktestStrategy,
  listBacktestRuns,
  listBacktestStrategies,
  requestBacktestSweepCancel,
  updateBacktestSweep,
  upsertBacktestStrategy,
} from '../db/queries';
import { deleteKnowledge, listKnowledge, readKnowledge, saveKnowledge } from '../knowledge';
import {
  CreateSweepOutputSchema,
  KnowledgeKeySchema,
  KnowledgeSaveInputSchema,
  ListRunsInputSchema,
  ListSweepsOutputSchema,
  RunBacktestInputSchema,
  SaveStrategyInputSchema,
  slugifyName,
  SweepInputSchema,
  type RunJobStatus,
} from '../schemas';
import {
  deleteRun,
  ENGINE_VERSION,
  getRunDetail,
  listRunSummaries,
  runBacktestForUser,
  toRunSummary,
} from '../services/run-service';
import { createSweepForUser, getSweepDetail, listSweepViews } from '../services/sweep-service';

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = 'BACKTESTING_ERROR',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

function errorResponse(err: unknown, ctx: PluginApiRouteContext, defaultStatus = 500): Response {
  if (err instanceof ApiError) {
    return json({ error: { code: err.code, message: err.message } }, err.status);
  }
  ctx.log.error('backtesting api route failed', {
    err: err instanceof Error ? err.message : String(err),
  });
  return json(
    {
      error: {
        code: 'BACKTESTING_FAILED',
        message:
          defaultStatus >= 500
            ? 'The Backtesting Lab could not complete this request.'
            : err instanceof Error
              ? err.message
              : String(err),
      },
    },
    defaultStatus,
  );
}

function wrap(
  handler: (ctx: PluginApiRouteContext) => Promise<Response>,
  options: { userErrorStatus?: number } = {},
): PluginApiRouteHandler {
  return async (ctx) => {
    try {
      return await handler(ctx);
    } catch (err) {
      return errorResponse(err, ctx, options.userErrorStatus ?? 500);
    }
  };
}

async function parseBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(400, 'Request body must be valid JSON.', 'INVALID_JSON');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; ');
    throw new ApiError(400, message, 'INVALID_INPUT');
  }
  return parsed.data;
}

function execCtx(ctx: PluginApiRouteContext): PluginExecutionContext {
  return {
    pluginId: ctx.pluginId,
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    settings: ctx.settings,
    storage: ctx.storage,
    log: ctx.log,
  };
}

function byMethod(handlers: Partial<Record<string, PluginApiRouteHandler>>): PluginApiRouteHandler {
  return async (ctx) => {
    const handler = handlers[ctx.request.method.toUpperCase()];
    if (!handler) {
      return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } }, 405);
    }
    return handler(ctx);
  };
}

function queryNumber(request: Request, key: string, fallback: number): number {
  const raw = new URL(request.url).searchParams.get(key);
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

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

// ── Parameter sweeps ─────────────────────────────────────────────────────

const listSweeps = wrap(async (ctx) => {
  const limit = Math.min(50, Math.max(1, queryNumber(ctx.request, 'limit', 20)));
  const sweeps = await listSweepViews(ctx.userId, limit);
  return json(ListSweepsOutputSchema.parse({ sweeps, totalReturned: sweeps.length }));
});

const createSweep = wrap(
  async (ctx) => {
    const input = await parseBody(ctx.request, SweepInputSchema);
    const row = await createSweepForUser({
      userId: ctx.userId,
      input,
      settings: ctx.settings,
    });
    const detail = await getSweepDetail(ctx.userId, row.id);
    if (!detail) throw new ApiError(500, 'Sweep could not be created.', 'SWEEP_CREATE_FAILED');

    let jobId: string | null;
    try {
      jobId = await enqueueJob(BACKTEST_SWEEP_QUEUE, {
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        sweepId: row.id,
        settings: ctx.settings,
      });
      if (!jobId) {
        throw new Error('queue rejected the job');
      }
    } catch (err) {
      await updateBacktestSweep(ctx.userId, row.id, {
        status: 'failed',
        error: `The background queue is unavailable: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
      throw new ApiError(
        503,
        'The background queue is unavailable. The sweep was not started.',
        'QUEUE_UNAVAILABLE',
      );
    }

    return json(
      CreateSweepOutputSchema.parse({
        sweep: detail,
        jobId,
        message: `Sweep queued (${detail.total} combinations). The worker will update progress.`,
      }),
      202,
    );
  },
  { userErrorStatus: 400 },
);

const getSweep = wrap(async (ctx) => {
  const sweepId = ctx.params['sweepId'];
  if (!sweepId) throw new ApiError(400, 'A sweep id is required.', 'MISSING_SWEEP_ID');
  const detail = await getSweepDetail(ctx.userId, sweepId);
  if (!detail) throw new ApiError(404, 'Sweep not found.', 'SWEEP_NOT_FOUND');
  return json({ sweep: detail });
});

const removeSweep = wrap(async (ctx) => {
  const sweepId = ctx.params['sweepId'];
  if (!sweepId) throw new ApiError(400, 'A sweep id is required.', 'MISSING_SWEEP_ID');
  const deleted = await deleteBacktestSweep(ctx.userId, sweepId);
  if (!deleted) throw new ApiError(404, 'Sweep not found.', 'SWEEP_NOT_FOUND');
  return json({ ok: true });
});

const cancelSweep = wrap(async (ctx) => {
  const sweepId = ctx.params['sweepId'];
  if (!sweepId) throw new ApiError(400, 'A sweep id is required.', 'MISSING_SWEEP_ID');
  const cancelled = await requestBacktestSweepCancel(ctx.userId, sweepId);
  if (!cancelled) throw new ApiError(409, 'Sweep is not running.', 'SWEEP_NOT_RUNNING');
  return json({ ok: true, message: 'Sweep cancellation requested.' });
});

// ── Strategies ───────────────────────────────────────────────────────────

const listStrategies = wrap(async (ctx) => {
  const limit = Math.min(50, Math.max(1, queryNumber(ctx.request, 'limit', 50)));
  const rows = await listBacktestStrategies(ctx.userId, { limit });
  return json({
    strategies: rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      tags: row.tags,
      favorite: row.favorite,
      updatedAt: row.updatedAt.toISOString(),
    })),
  });
});

const saveStrategy = wrap(
  async (ctx) => {
    const input = await parseBody(ctx.request, SaveStrategyInputSchema);
    const slug = input.slug ?? slugifyName(input.name);
    if (!slug) throw new ApiError(400, 'Could not derive a slug from the name.', 'INVALID_SLUG');
    const row = await upsertBacktestStrategy({
      userId: ctx.userId,
      name: input.name,
      slug,
      description: input.description ?? '',
      source: input.source,
      params: input.params ?? {},
      tags: input.tags ?? [],
      ...(input.favorite !== undefined ? { favorite: input.favorite } : {}),
    });
    return json({
      strategy: {
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        tags: row.tags,
        favorite: row.favorite,
        updatedAt: row.updatedAt.toISOString(),
      },
    });
  },
  { userErrorStatus: 400 },
);

const getStrategy = wrap(async (ctx) => {
  const strategyId = ctx.params['strategyId'];
  if (!strategyId) throw new ApiError(400, 'A strategy id is required.', 'MISSING_STRATEGY_ID');
  const row = await getBacktestStrategy(ctx.userId, strategyId);
  if (!row) throw new ApiError(404, 'Strategy not found.', 'STRATEGY_NOT_FOUND');
  return json({
    strategy: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      source: row.source,
      params: row.params,
      tags: row.tags,
      favorite: row.favorite,
      updatedAt: row.updatedAt.toISOString(),
    },
  });
});

const removeStrategy = wrap(async (ctx) => {
  const strategyId = ctx.params['strategyId'];
  if (!strategyId) throw new ApiError(400, 'A strategy id is required.', 'MISSING_STRATEGY_ID');
  const deleted = await deleteBacktestStrategy(ctx.userId, strategyId);
  if (!deleted) throw new ApiError(404, 'Strategy not found.', 'STRATEGY_NOT_FOUND');
  return json({ ok: true });
});

// ── Knowledge base ──────────────────────────────────────────────────────

const listKnowledgeRoute = wrap(async (ctx) => {
  const documents = await listKnowledge(execCtx(ctx));
  return json({ documents });
});

const readKnowledgeRoute = wrap(async (ctx) => {
  const key = ctx.params['key'];
  if (!key) throw new ApiError(400, 'A document key is required.', 'MISSING_KEY');
  const parsedKey = KnowledgeKeySchema.safeParse(key);
  if (!parsedKey.success) throw new ApiError(400, 'Invalid document key.', 'INVALID_KEY');
  const document = await readKnowledge(execCtx(ctx), parsedKey.data);
  if (!document) throw new ApiError(404, 'Knowledge document not found.', 'DOCUMENT_NOT_FOUND');
  return json({ document });
});

const saveKnowledgeRoute = wrap(
  async (ctx) => {
    const input = await parseBody(ctx.request, KnowledgeSaveInputSchema);
    const saved = await saveKnowledge(execCtx(ctx), input);
    return json({ ok: true, document: saved });
  },
  { userErrorStatus: 400 },
);

const deleteKnowledgeRoute = wrap(async (ctx) => {
  const key = ctx.params['key'];
  if (!key) throw new ApiError(400, 'A document key is required.', 'MISSING_KEY');
  const deleted = await deleteKnowledge(execCtx(ctx), key);
  if (!deleted) throw new ApiError(404, 'Knowledge document not found.', 'DOCUMENT_NOT_FOUND');
  return json({ ok: true });
});

// ── Widget summary ───────────────────────────────────────────────────────

const summary = wrap(async (ctx) => {
  const [runs, runCount, strategyCount, documents] = await Promise.all([
    listBacktestRuns(ctx.userId, { limit: 1 }),
    countBacktestRuns(ctx.userId),
    countBacktestStrategies(ctx.userId),
    listKnowledge(execCtx(ctx)),
  ]);
  const latest = runs[0];
  return json({
    engineVersion: ENGINE_VERSION,
    runCount,
    strategyCount,
    knowledgeCount: documents.length,
    latestRun: latest ? toRunSummary(latest) : null,
  });
});

export const backtestingApiRoutes: Readonly<Record<string, PluginApiRouteHandler>> = {
  '/runs': byMethod({ GET: listRuns, POST: createRun }),
  '/runs/async': byMethod({ POST: createRunAsync }),
  '/jobs/:jobId': byMethod({ GET: getRunJob }),
  '/runs/:runId': byMethod({ GET: getRun, DELETE: removeRun }),
  '/sweeps': byMethod({ GET: listSweeps, POST: createSweep }),
  '/sweeps/:sweepId': byMethod({ GET: getSweep, DELETE: removeSweep }),
  '/sweeps/:sweepId/cancel': byMethod({ POST: cancelSweep }),
  '/strategies': byMethod({ GET: listStrategies, POST: saveStrategy }),
  '/strategies/:strategyId': byMethod({ GET: getStrategy, DELETE: removeStrategy }),
  '/knowledge': byMethod({ GET: listKnowledgeRoute, POST: saveKnowledgeRoute }),
  '/knowledge/:key': byMethod({ GET: readKnowledgeRoute, DELETE: deleteKnowledgeRoute }),
  '/summary': byMethod({ GET: summary }),
};
