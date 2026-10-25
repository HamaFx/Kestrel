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

// Claim the next leased Full-analysis job for a worker.

import { claimNextFullAnalysisQueue, failFullAnalysisQueue } from '@kestrel/db';

import { getDb } from '../../runtime/db';
import { isLeaseError, payloadFromRow } from './full-analysis-payload';
import { projectQueueRow } from './full-analysis-projection';
import { FULL_ANALYSIS_LEASE_MS, type FullAnalysisClaim } from './full-analysis-types';

export async function claimNextFullAnalysisRun(
  workerRunId: string,
  ownsTenant?: (tenantId: string) => boolean,
): Promise<FullAnalysisClaim | null> {
  const db = getDb();
  for (;;) {
    const row = await claimNextFullAnalysisQueue({
      workerRunId,
      leaseMs: FULL_ANALYSIS_LEASE_MS,
      ...(ownsTenant ? { ownsTenant } : {}),
      db,
    });
    if (!row) return null;
    const payload = payloadFromRow(row);
    if (!payload) {
      try {
        await failFullAnalysisQueue({
          runId: row.runId,
          workerRunId,
          error: 'Invalid Full-analysis payload; job rejected.',
          db,
        });
      } catch (error) {
        if (!isLeaseError(error)) throw error;
      }
      continue;
    }
    if (payload.executionPlan && payload.executionPlan.route !== 'full-analysis') {
      try {
        await failFullAnalysisQueue({
          runId: row.runId,
          workerRunId,
          error: 'Full-analysis payload has an incompatible execution plan route.',
          db,
        });
      } catch (error) {
        if (!isLeaseError(error)) throw error;
      }
      continue;
    }
    if (!payload.modelSnapshot) {
      try {
        await failFullAnalysisQueue({
          runId: row.runId,
          workerRunId,
          error: 'Full-analysis payload has no model snapshot; legacy job rejected safely.',
          db,
        });
      } catch (error) {
        if (!isLeaseError(error)) throw error;
      }
      continue;
    }
    if (payload.userId !== row.userId || payload.threadId !== row.threadId) {
      try {
        await failFullAnalysisQueue({
          runId: row.runId,
          workerRunId,
          error: 'Full-analysis payload identity does not match the queue row owner; job rejected.',
          db,
        });
      } catch (error) {
        if (!isLeaseError(error)) throw error;
      }
      continue;
    }
    const claimedPayload = {
      ...payload,
      attemptCount: row.attemptCount,
      workerRunId,
      startedAt: new Date().toISOString(),
    };
    await projectQueueRow({ ...row, payload: claimedPayload });
    return { runId: row.runId, tenantId: row.tenantId, payload: claimedPayload };
  }
}
