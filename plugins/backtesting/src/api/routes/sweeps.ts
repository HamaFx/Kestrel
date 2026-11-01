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

// Parameter-sweep routes: listing, creation (with queue hand-off), detail,
// deletion and cancellation.
//
// Creation is queue-only (R16): the route persists the sweep and enqueues it,
// returning 202 with the job id. The UI polls `GET /sweeps/:sweepId` for
// progress instead of holding a request open for the whole grid.

import type { PluginApiRouteHandler } from '@kestrel/plugin-sdk';

import { deleteBacktestSweep, requestBacktestSweepCancel } from '../../db/queries';
import { CreateSweepOutputSchema, ListSweepsOutputSchema, SweepInputSchema } from '../../schemas';
import { enqueueSweepForUser, SweepQueueUnavailableError } from '../../services/sweep-enqueue';
import { getSweepDetail, listSweepViews } from '../../services/sweep-service';
import { ApiError, byMethod, json, parseBody, queryNumber, wrap } from './shared';

// ── Parameter sweeps ─────────────────────────────────────────────────────

const listSweeps = wrap(async (ctx) => {
  const limit = Math.min(50, Math.max(1, queryNumber(ctx.request, 'limit', 20)));
  const sweeps = await listSweepViews(ctx.userId, limit);
  return json(ListSweepsOutputSchema.parse({ sweeps, totalReturned: sweeps.length }));
});

const createSweep = wrap(
  async (ctx) => {
    const input = await parseBody(ctx.request, SweepInputSchema);
    try {
      const { row, jobId } = await enqueueSweepForUser({
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        input,
        settings: ctx.settings,
      });
      const detail = await getSweepDetail(ctx.userId, row.id);
      if (!detail) throw new ApiError(500, 'Sweep could not be created.', 'SWEEP_CREATE_FAILED');

      return json(
        CreateSweepOutputSchema.parse({
          sweep: detail,
          jobId,
          message: `Sweep queued (${detail.total} combinations). The worker will update progress.`,
        }),
        202,
      );
    } catch (err) {
      if (err instanceof SweepQueueUnavailableError) {
        throw new ApiError(503, err.message, 'QUEUE_UNAVAILABLE');
      }
      throw err;
    }
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

export const sweepRoutes: Readonly<Record<string, PluginApiRouteHandler>> = {
  '/sweeps': byMethod({ GET: listSweeps, POST: createSweep }),
  '/sweeps/:sweepId': byMethod({ GET: getSweep, DELETE: removeSweep }),
  '/sweeps/:sweepId/cancel': byMethod({ POST: cancelSweep }),
};
