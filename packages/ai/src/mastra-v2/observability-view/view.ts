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

// SPDX-License-Identifier: Apache-2.0

// The unified Mastra run view projection (DEC-05 split of
// observability-view.ts): joins DB telemetry, workflow state, and scores into
// one runId-keyed row. Pure — the caller supplies the telemetry row and the
// Mastra instance, so this module is unit-testable without a database.

import { createCategorizedLogger } from '@kestrel/shared/logger';
import type { Mastra } from '@mastra/core';
import type { WorkflowRunState } from '@mastra/core/workflows';

import { listScoresForRun } from '../evals/scores';
import { langfuseTraceUrl } from '../telemetry';
import { providerFromModel, workflowIdForKind } from './query';
import { summarizeWorkflowRunState } from './snapshot';
import type {
  MastraRunScoreView,
  MastraRunView,
  RunTelemetryRow,
  WorkflowRunStatusView,
} from './types';

const vlog = createCategorizedLogger('ai', { component: 'mastra:runs-view' });

/**
 * Build the unified view for one telemetry row.
 *
 * `instance` may be undefined in minimal test setups — the view degrades to
 * telemetry-only (no workflow/scores) rather than throwing.
 */
export async function toMastraRunView(
  row: RunTelemetryRow,
  instance: Mastra | undefined,
): Promise<MastraRunView> {
  const runId = row.runId ?? '';
  const workflowId = workflowIdForKind(row.kind);

  let workflow: WorkflowRunStatusView = {
    workflowId: null,
    status: null,
    failedSteps: [],
    completedSteps: 0,
    totalSteps: 0,
    error: null,
  };
  let scores: MastraRunScoreView[] = [];

  if (instance) {
    if (workflowId) {
      const storage = instance.getStorage() as
        | (typeof instance extends never
            ? never
            : { getStore?: (domain: string) => Promise<unknown> })
        | null;
      try {
        if (storage && typeof storage.getStore === 'function') {
          const workflowsDomain = (await storage.getStore('workflows')) as
            | {
                loadWorkflowSnapshot(input: {
                  workflowName: string;
                  runId: string;
                }): Promise<WorkflowRunState | null>;
              }
            | undefined;
          if (workflowsDomain && typeof workflowsDomain.loadWorkflowSnapshot === 'function') {
            const snapshot = await workflowsDomain.loadWorkflowSnapshot({
              workflowName: workflowId,
              runId,
            });
            workflow = summarizeWorkflowRunState(snapshot, workflowId);
          }
        }
      } catch (error) {
        vlog.warn('Failed to load workflow snapshot for run view', {
          runId,
          workflowId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const scoreRecords = await listScoresForRun(instance, runId);
    scores = scoreRecords.map((record) => ({
      scorerId: record.scorerId,
      score: record.score,
      source: record.source,
      ...(record.reason ? { reason: record.reason } : {}),
    }));
  }

  const scoreMean =
    scores.length > 0 ? scores.reduce((sum, entry) => sum + entry.score, 0) / scores.length : null;

  // Phase 1 (observability roadmap) — the Mastra/Langfuse trace key is the
  // runId; fall back to it when no traceId was persisted so runs always carry
  // a working deep link when Langfuse is configured.
  const langfuseId = row.traceId ?? (runId.length > 0 ? runId : null);

  return {
    runId,
    kind: row.kind,
    model: row.model,
    provider: providerFromModel(row.model),
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    toolCalls: row.toolCalls,
    ms: row.ms,
    estCostUsd: row.estCostUsd,
    createdAt: row.createdAt.toISOString(),
    traceId: row.traceId,
    langfuseUrl: langfuseId ? langfuseTraceUrl(langfuseId) : null,
    workflow,
    scores,
    scoreMean,
    error: workflow.error ?? null,
  };
}
