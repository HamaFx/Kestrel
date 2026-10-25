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

// Workflow snapshot summarization for the run view (DEC-05 split of
// observability-view.ts): step statuses plus the Phase 5.2 failure detail
// recovered from failed-step errors and their cause chains.

import type { WorkflowRunState } from '@mastra/core/workflows';

import type { WorkflowRunStatusView } from './types';

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
