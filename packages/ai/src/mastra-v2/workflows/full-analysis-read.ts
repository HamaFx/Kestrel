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

// Admin/read APIs: queue health, run view, cancellation, reconciliation.

import {
  cancelFullAnalysisQueue,
  getFullAnalysisQueueRow,
  getFullAnalysisQueueStats,
  schema,
} from '@kestrel/db';
import { and, desc, gte, inArray, isNotNull } from 'drizzle-orm';

import { getDb } from '../../runtime/db';
import { normalizeWorkflowStatus, toMastraWorkflowStatus } from '../../runtime/workflow-status';
import { flog, serializeError } from './full-analysis-payload';
import { parseSnapshot, projectQueueRow, workflowsStore } from './full-analysis-projection';
import {
  FULL_ANALYSIS_WORKFLOW_ID,
  type FullAnalysisQueueHealth,
  type FullAnalysisRunView,
} from './full-analysis-types';

export async function reconcileFullAnalysisSnapshots(options?: {
  since?: Date;
  limit?: number;
}): Promise<number> {
  const store = await workflowsStore();
  // Nothing to reconcile without a durable Mastra store — the queue row is
  // still the source of truth and the next sweep will retry.
  if (!store) return 0;
  const since = options?.since ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const limit = options?.limit ?? 50;
  const db = getDb();
  let repaired = 0;
  try {
    const rows = await db
      .select()
      .from(schema.fullAnalysisQueue)
      .where(
        and(
          isNotNull(schema.fullAnalysisQueue.completedAt),
          inArray(schema.fullAnalysisQueue.status, ['succeeded', 'failed', 'cancelled', 'blocked']),
          gte(schema.fullAnalysisQueue.completedAt, since),
        ),
      )
      .orderBy(desc(schema.fullAnalysisQueue.completedAt))
      .limit(limit);
    for (const row of rows) {
      try {
        const terminalStatus = toMastraWorkflowStatus(normalizeWorkflowStatus(row.status));
        const existing = await store.getWorkflowRunById({
          runId: row.runId,
          workflowName: FULL_ANALYSIS_WORKFLOW_ID,
        });
        const snapshot = parseSnapshot(existing?.snapshot);
        if (snapshot && snapshot.status === terminalStatus) continue;
        await projectQueueRow(row);
        repaired += 1;
      } catch (error) {
        flog.warn('Full-analysis snapshot reconciliation failed for a run', {
          runId: row.runId,
          error: serializeError(error),
        });
      }
    }
  } catch (error) {
    flog.warn('Full-analysis snapshot reconciliation scan failed', {
      error: serializeError(error),
    });
  }
  if (repaired > 0) flog.info('Reconciled full-analysis snapshots', { repaired });
  return repaired;
}

export async function getFullAnalysisQueueHealth(): Promise<FullAnalysisQueueHealth> {
  try {
    const db = getDb();
    // One bounded aggregate instead of fetching every pending/running row
    // (with its multi-KB JSONB blobs) into Node.js memory on /api/health.
    return await getFullAnalysisQueueStats(db);
  } catch (error) {
    flog.warn('Full-analysis queue health unavailable', { error: serializeError(error) });
    return { pending: 0, running: 0, stalePending: 0, stuckRunning: 0, unavailable: true };
  }
}

export async function getFullAnalysisRun(
  userId: string,
  runId: string,
): Promise<FullAnalysisRunView | null> {
  try {
    const row = await getFullAnalysisQueueRow(runId, userId, getDb());
    if (!row) return null;
    const status = normalizeWorkflowStatus(row.status);
    const result: Record<string, unknown> | null = row.result ?? null;
    const error: string | null =
      status === 'failed'
        ? row.error?.startsWith('Daily AI budget exceeded (')
          ? row.error
          : 'Full analysis could not be completed. No partial answer was returned.'
        : null;
    return {
      id: row.runId,
      status,
      progress: row.progress ?? [],
      result,
      error,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    };
  } catch (error) {
    flog.warn('Full-analysis run lookup failed', { runId, error: serializeError(error) });
    return null;
  }
}

export async function cancelFullAnalysisRun(
  userId: string,
  runId: string,
): Promise<FullAnalysisRunView | null> {
  try {
    const row = await cancelFullAnalysisQueue(runId, userId, getDb());
    if (!row) return null;
    await projectQueueRow(row);
    flog.info('Cancelled full-analysis run', { runId, userId });
    return {
      id: row.runId,
      status: 'cancelled',
      progress: row.progress ?? [],
      result: row.result ?? null,
      error: row.error ?? 'Cancelled by user',
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    };
  } catch (error) {
    flog.warn('Full-analysis run cancel failed', { runId, error: serializeError(error) });
    return null;
  }
}
