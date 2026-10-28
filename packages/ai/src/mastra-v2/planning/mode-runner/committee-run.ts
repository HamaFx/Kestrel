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
 * Committee workflow execution for one mode run.
 *
 * This module owns the pieces the runner delegates to the shared workflow:
 * per-agent model resolution, memory/guardrail wiring, the durable-run resume
 * check, and the strict Full-mode failure mapping. The committee itself
 * (specialist steps, per-step retries, verify, fusion) lives in the workflow so
 * repair/verification behavior is observable as workflow run snapshots.
 */

import type { UserSettingsRow } from '@kestrel/db/schema';

import { COMMITTEE_DEADLINE_MS, MastraModeStrictFailureError } from '@ai/committee/types';
import { CommitteeWorkflowInputSchema, createCommitteeWorkflow } from '@ai/committee/workflow';
import type { ChatModelResolution } from '@ai/models/model';
import type { GenerationLedger } from '@ai/persistence/generation-ledger';
import { withToolContext } from '@ai/runtime/tool-context';

import { getKestrelMastra } from '../../instance';
import { logWorkflowEnd, logWorkflowStart } from '../../logger';
import type { prepareResearchRunContext } from '../../research-context';
import { runTracingOptions } from '../../telemetry';
import type { committeeModelResolver } from './model-resolution';
import { failedAgentsFromRun } from './results';
import { contextForRun, type buildToolContext } from './run-context';
import type { RunMastraModeArgs } from './types';

type ResearchRunContext = Awaited<ReturnType<typeof prepareResearchRunContext>>;

/** The subset of the Mastra run result this runner consumes. */
export interface ModeWorkflowRunResult {
  status: string;
  result?: unknown;
  error?: unknown;
  steps?: Record<string, { status?: string; output?: { ok?: boolean } }>;
}

export interface StartModeWorkflowArgs {
  args: RunMastraModeArgs;
  runContext: ResearchRunContext;
  isComparison: boolean;
  comparisonSymbols: string[];
  /** C-02: per-asset-class telemetry tag computed by the runner. */
  assetClass: string;
  resolution: ChatModelResolution;
  resolveModelForAgent: ReturnType<typeof committeeModelResolver>;
  toolContext: ReturnType<typeof buildToolContext>;
  generationLedger: GenerationLedger;
  startedAt: number;
}

/**
 * Build the committee workflow for this run, resume a persisted durable run
 * when asked, and execute it. Returns the raw workflow result; a canceled,
 * failed, or partial run throws (strict contract, Q3).
 */
export async function startModeWorkflow(
  params: StartModeWorkflowArgs,
): Promise<ModeWorkflowRunResult> {
  const { args, runContext, isComparison, comparisonSymbols, resolution, generationLedger } =
    params;
  const memory = runContext.memory;
  const prepared = runContext.prepared;
  const guardrails = runContext.research!.guardrails.processors;
  const researchScorers = runContext.research!.scorers.entries;
  const requestContext = await contextForRun(args);

  // The committee specialist runner enforces read-only thread memory by
  // default (Phase 6): specialists read context but never persist their
  // internal opinions. Only the fusion/output layer writes user-visible
  // assistant messages, using the caller's writable call options below.
  const workflow = createCommitteeWorkflow(
    {
      model: resolution.model,
      modelId: resolution.modelId,
      providerId: resolution.providerId,
      memory,
      specialistCallOptions: prepared.callOptions,
      fusionCallOptions: prepared.callOptions,
      inputProcessors: guardrails as never,
      scorers: researchScorers as never,
      ...(args.signal ? { signal: args.signal } : {}),
      ...(args.onProgress ? { onProgress: args.onProgress } : {}),
      ...(params.resolveModelForAgent ? { resolveModelForAgent: params.resolveModelForAgent } : {}),
      ledger: generationLedger,
      mastra: getKestrelMastra().instance,
      toolContext: params.toolContext,
      disabledTools: (args.settings as UserSettingsRow)?.disabledTools,
      // Phase 2 (Jev System One) — BYOK settings/env for the pre-specialist
      // packet calibration and consensus gate. Absent keys degrade cleanly to
      // the uncalibrated LLM-only committee flow.
      jevSettings: { aiApiKeys: args.settings.aiApiKeys },
      jevEnv: args.env,
      // A-01: comparison runs execute the cross-symbol graph.
      ...(isComparison ? { comparisonSymbols } : {}),
      // Audit plan §1.7: synchronous web runs get a 45s committee deadline
      // (strict failure on timeout); the durable worker is lease-governed.
      ...(args.telemetryKind === 'mastra_full_job' ? {} : { deadlineMs: COMMITTEE_DEADLINE_MS }),
    },
    args.mode,
    args.workflowId ?? (isComparison ? 'multi-symbol-research' : 'symbol-research'),
  );
  const run = await workflow.createRun({ runId: args.runId, resourceId: args.userId });
  const tracingOptions = runTracingOptions({
    runId: args.runId,
    userId: args.userId,
    threadId: args.threadId,
    kind: args.telemetryKind ?? 'mastra_mode',
    assetClass: params.assetClass,
    tags: isComparison ? ['research', args.mode, 'comparison'] : ['research', args.mode],
    memoryMode: prepared.memoryDegraded ? 'degraded' : 'native',
    memoryBackfill: prepared.backfillAttempted,
  });
  const inputData = {
    prompt: args.prompt,
    symbol: args.symbol,
    mode: args.mode,
    ...(isComparison ? { symbols: comparisonSymbols } : {}),
  };
  const persisted = args.resumeExisting
    ? await workflow.getWorkflowRunById(args.runId, {
        fields: [
          'result',
          'error',
          'payload',
          'steps',
          'activeStepsPath',
          'serializedStepGraph',
          'suspendedPaths',
          'resumeLabels',
          'waitingPaths',
        ],
      })
    : null;
  const persistedStatus = persisted?.status;
  const persistedInput = (persisted as { payload?: unknown } | null)?.payload;
  const hasDurableWorkflowState =
    CommitteeWorkflowInputSchema.safeParse(persistedInput).success ||
    Object.keys(persisted?.steps ?? {}).length > 0;
  if (persistedStatus === 'canceled') {
    throw new DOMException('The persisted workflow run was canceled.', 'AbortError');
  }
  if (
    persistedStatus === 'failed' ||
    persistedStatus === 'tripwire' ||
    persistedStatus === 'bailed' ||
    persistedStatus === 'skipped'
  ) {
    const message =
      persisted?.error && typeof persisted.error === 'object' && 'message' in persisted.error
        ? String((persisted.error as { message: unknown }).message)
        : `Persisted Mastra workflow ended with ${persistedStatus}.`;
    throw new Error(message);
  }
  logWorkflowStart({
    runId: args.runId,
    workflowId: args.workflowId ?? 'symbol-research',
    stepId: args.mode,
    message: hasDurableWorkflowState
      ? 'Symbol-research workflow run resumed'
      : 'Symbol-research workflow run started',
    meta: {
      mode: args.mode,
      symbol: args.symbol,
      model: resolution.modelId,
      persistedStatus,
      hasDurableWorkflowState,
    },
  });
  const result = await withToolContext(params.toolContext, async () => {
    return persistedStatus === 'success' && persisted?.result
      ? ({
          status: 'success',
          result: persisted.result,
          steps: persisted.steps,
        } as never)
      : hasDurableWorkflowState &&
          ['running', 'suspended', 'waiting', 'paused', 'pending'].includes(persistedStatus ?? '')
        ? await run.restart({ requestContext, tracingOptions })
        : await run.start({ inputData, requestContext, tracingOptions });
  });
  logWorkflowEnd({
    runId: args.runId,
    workflowId: args.workflowId ?? 'symbol-research',
    stepId: args.mode,
    startedAt: params.startedAt,
    message: 'Symbol-research workflow run completed',
    meta: {
      mode: args.mode,
      symbol: args.symbol,
      status: result.status,
      resultStatus: (result as { result?: { status?: string } | null }).result?.status ?? null,
    },
  });

  if (result.status !== 'success') {
    // Aborts must propagate as-is so the caller records 'cancelled'.
    if (args.signal?.aborted) {
      throw args.signal.reason ?? new DOMException('Aborted', 'AbortError');
    }
    const error =
      result.status === 'failed' && result.error
        ? result.error
        : new Error('Mastra symbol-research workflow failed');
    // Strict contract (Q3): any specialist failure in either mode is
    // terminal — no partial committee answer is returned.
    throw new MastraModeStrictFailureError(failedAgentsFromRun(result as never, args.mode), error);
  }

  return result as ModeWorkflowRunResult;
}
