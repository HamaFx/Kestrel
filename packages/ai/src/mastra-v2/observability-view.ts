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

/**
 * Phase 8 — unified Mastra run view.
 *
 * The admin "Mastra Runs" viewer joins three runId-keyed surfaces into one
 * row so a single run id answers "which stage failed, which provider, what
 * did it cost, was it grounded":
 *
 *   - DB telemetry   (`chat_telemetry`, kind `mastra_*`) → provider, model,
 *                     tokens, cost, latency, trace id.
 *   - Workflow state (`storage.workflows.loadWorkflowSnapshot`) → stage,
 *                     step statuses, run status, and (Phase 5.2) the failure
 *                     detail — committee strict-failure messages and verifier
 *                     findings recovered from failed-step errors.
 *   - Scores         (`storage.scores`) → grounding/citation/faithfulness.
 *
 * The projection is pure (no DB access) — the web route supplies the telemetry
 * row and the Mastra instance, so this module is unit-testable without a
 * database.
 */

import { createCategorizedLogger } from '@kestrel/shared/logger';
import type { Mastra } from '@mastra/core';
import type { WorkflowRunState } from '@mastra/core/workflows';

import { listScoresForRun, type ScoreRecord } from './evals/scores';
import { langfuseTraceUrl } from './telemetry';

const vlog = createCategorizedLogger('ai', { component: 'mastra:runs-view' });

/** Minimal projection of a `chat_telemetry` row used by the runs viewer. */
export interface RunTelemetryRow {
  runId: string | null;
  traceId: string | null;
  threadId: string | null;
  userId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  ms: number;
  estCostUsd: number;
  kind: string | null;
  createdAt: Date;
}

/** Known workflow ids whose snapshots back Mastra runs (from the registry). */
export const MASTRA_WORKFLOW_IDS = ['symbol-research', 'full-analysis', 'xauusd-report'] as const;

/** Map a telemetry kind to the workflow id that would hold its run state. */
export function workflowIdForKind(kind: string | null): string | null {
  if (!kind) return null;
  if (kind.startsWith('mastra_full_job')) return 'full-analysis';
  if (kind.startsWith('mastra_mode')) return 'symbol-research';
  if (kind.startsWith('mastra_xauusd')) return 'xauusd-report';
  if (kind.startsWith('mastra_canonical_chat')) return null;
  return null;
}

/** Derive the provider from a model id (`google/…`, `openai/…`, …). */
export function providerFromModel(model: string): string {
  const slash = model.indexOf('/');
  if (slash > 0) return model.slice(0, slash);
  const at = model.indexOf(':');
  if (at > 0) return model.slice(0, at);
  return 'unknown';
}

export interface WorkflowRunStatusView {
  workflowId: string | null;
  status: string | null;
  failedSteps: string[];
  completedSteps: number;
  totalSteps: number;
  /**
   * Phase 5.2 — why the run failed, recovered from the snapshot: failed-step
   * error messages (committee strict failures, verifier findings live in the
   * message/cause chain) with the workflow-level error as fallback. `null`
   * when the run succeeded or nothing was persisted.
   */
  error?: string | null;
}

/**
 * Phase 5.2 — cap for the failure detail kept in one run view row so a
 * verbose verifier message cannot bloat the admin payload.
 */
const RUN_VIEW_ERROR_MAX_CHARS = 500;

/** Limit recursion into serialized `cause` chains (findings wrap the cause). */
const FAILURE_CAUSE_MAX_DEPTH = 2;

function messageTextFrom(value: unknown): string | null {
  if (typeof value === 'string') return value.length > 0 ? value : null;
  if (value && typeof value === 'object') {
    const message = (value as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return null;
}

/**
 * Extract a human-readable failure text from a serialized error
 * (`{ name, message, stack?, cause? }`), an `Error`, or a plain string.
 * Verifier findings flow into `MastraModeStrictFailureError` causes, so the
 * cause chain is appended when it adds new text.
 */
function failureTextFrom(value: unknown, depth = 0): string | null {
  const message = messageTextFrom(value);
  if (!value || typeof value !== 'object') return message;
  const causeText =
    depth < FAILURE_CAUSE_MAX_DEPTH
      ? failureTextFrom((value as { cause?: unknown }).cause, depth + 1)
      : null;
  if (message && causeText && !message.includes(causeText)) {
    return `${message} (cause: ${causeText})`;
  }
  return message ?? causeText;
}

/**
 * Failure text for one step result. Steps that threw carry the error under
 * `error`; soft-failed steps returned an `ok: false` marker (e.g. a
 * specialist deadline) whose short reason lives under `output.error`.
 * Foreach steps store an array of results — the first failure wins.
 */
function stepResultFailureText(step: unknown): string | null {
  const candidates = Array.isArray(step) ? step : [step];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const record = candidate as {
      error?: unknown;
      output?: { ok?: unknown; error?: unknown } | null;
    };
    if (record.error !== undefined) {
      const text = failureTextFrom(record.error);
      if (text) return text;
    }
    if (record.output && record.output.ok === false) {
      const text = failureTextFrom(record.output.error);
      if (text) return text;
    }
  }
  return null;
}

/**
 * Map of stepId → failure text for one snapshot. Step results live under
 * `steps` (run results) and/or `context` (persisted snapshots); `steps` wins
 * on duplicates. The `context.input` bag entry is not a step result.
 */
function snapshotStepFailureTexts(snapshot: WorkflowRunState): Map<string, string> {
  const loose = snapshot as unknown as {
    steps?: Record<string, unknown>;
    context?: Record<string, unknown>;
  };
  const texts = new Map<string, string>();
  const collect = (source: Record<string, unknown> | undefined): void => {
    if (!source) return;
    for (const [stepId, step] of Object.entries(source)) {
      if (stepId === 'input' || texts.has(stepId)) continue;
      const text = stepResultFailureText(step);
      if (text) texts.set(stepId, text);
    }
  };
  collect(loose.steps);
  collect(loose.context);
  return texts;
}

/** Summarize a workflow run snapshot into a compact status view. */
export function summarizeWorkflowRunState(
  snapshot: WorkflowRunState | null,
  workflowId: string,
): WorkflowRunStatusView {
  if (!snapshot)
    return {
      workflowId: null,
      status: null,
      failedSteps: [],
      completedSteps: 0,
      totalSteps: 0,
      error: null,
    };
  const failedSteps: string[] = [];
  let completedSteps = 0;
  let totalSteps = 0;
  const steps = (snapshot as unknown as { steps?: Record<string, unknown> }).steps ?? {};
  for (const [stepId, step] of Object.entries(steps)) {
    totalSteps += 1;
    const candidate = step as { status?: string; output?: { ok?: boolean } } | undefined;
    if (candidate?.status === 'failed' || candidate?.output?.ok === false) failedSteps.push(stepId);
    if (candidate?.status === 'succeeded' || candidate?.status === 'completed') completedSteps += 1;
  }

  // Phase 5.2 — recover the failure detail (strict-failure messages, verifier
  // findings) so the admin runs viewer shows WHY a run failed, not just which
  // step failed. Failed steps first (step-prefixed), then the workflow-level
  // error when it is not already covered by a step message.
  const stepTexts = snapshotStepFailureTexts(snapshot);
  const parts: string[] = [];
  for (const stepId of [...failedSteps, ...stepTexts.keys()]) {
    if (parts.some((part) => part.startsWith(`${stepId}: `))) continue;
    const text = stepTexts.get(stepId);
    if (text) parts.push(`${stepId}: ${text}`);
  }
  const workflowError = failureTextFrom((snapshot as { error?: unknown }).error);
  if (workflowError && !parts.some((part) => part.includes(workflowError))) {
    parts.push(workflowError);
  }
  let error: string | null = null;
  if (parts.length > 0) {
    const joined = parts.join(' | ');
    error =
      joined.length > RUN_VIEW_ERROR_MAX_CHARS
        ? `${joined.slice(0, RUN_VIEW_ERROR_MAX_CHARS - 1)}…`
        : joined;
  }

  return {
    workflowId,
    status: snapshot.status ?? null,
    failedSteps,
    completedSteps,
    totalSteps,
    error,
  };
}

export interface MastraRunScoreView {
  scorerId: string;
  score: number;
  source: ScoreRecord['source'];
  reason?: string;
}

export interface MastraRunView {
  runId: string;
  kind: string | null;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  ms: number;
  estCostUsd: number;
  createdAt: string;
  traceId: string | null;
  langfuseUrl: string | null;
  workflow: WorkflowRunStatusView;
  scores: MastraRunScoreView[];
  /** Best summary score (mean of available scores), for quick sorting. */
  scoreMean: number | null;
  /**
   * Phase 5.2 — failure detail for failed runs (committee strict failure,
   * verifier findings), recovered from the workflow snapshot. `null` when the
   * run succeeded or no workflow state was persisted.
   */
  error?: string | null;
}

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
    langfuseUrl: row.traceId ? langfuseTraceUrl(row.traceId) : null,
    workflow,
    scores,
    scoreMean,
    error: workflow.error ?? null,
  };
}
