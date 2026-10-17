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
 * Mode runner (Phase 2) — delegates Quick/Standard/Full committee analysis
 * to the shared committee workflow (see `../committee/workflow.ts`). This
 * module owns the pieces
 * Kestrel must keep: BYOK model resolution, telemetry, per-call memory, the
 * result contract (opinions + packet + stats), and the strict Full-mode
 * failure mapping. The committee itself (specialist steps, per-step retries,
 * verify, fusion) lives in the workflow so repair/verification behavior is
 * observable as workflow run snapshots.
 */

import type { UserSettingsRow } from '@kestrel/db/schema';
import { pickAiEnv, readFeatureFlag } from '@kestrel/shared';
import { RequestContext } from '@mastra/core/request-context';

import {
  COMMITTEE_DEADLINE_MS,
  MastraModeStrictFailureError,
  REQUEST_CONTEXT_SCHEMA,
  SPECIALISTS_BY_MODE,
  type CommitteeCritique,
  type MastraAnalysisMode,
  type MastraModeOpinion,
  type MastraSpecialistName,
} from '../../committee/types';
import { CommitteeWorkflowInputSchema, createCommitteeWorkflow } from '../../committee/workflow';
import { getDb } from '../../db';
import type { ResolveModelEnv } from '../../env-model-factory';
import { createGenerationLedger, type GenerationLedger } from '../../generation-ledger';
import { resolveMastraExecutionModel, type ChatModelResolution } from '../../model';
import { createToolContext, withToolContext } from '../../tool-context';
import { getKestrelMastra } from '../instance';
import { logWorkflowEnd, logWorkflowError, logWorkflowStart } from '../logger';
import { kestrelMemoryOptions } from '../memory';
import type { SymbolResearchPacket } from '../packets/symbol-research';
import { prepareResearchRunContext } from '../research-context';
import {
  beginMastraRun,
  finishMastraRun,
  mastraOutcomeForError,
  type MastraGenerationStats,
} from '../shared/telemetry';
import { runTracingOptions } from '../telemetry';
import {
  assertExecutionPlanRoute,
  requireExecutionPlanModel,
  type ExecutionPlan,
} from './execution-plan';

export type {
  MastraAnalysisMode,
  MastraModeOpinion,
  MastraSpecialistName,
} from '../../committee/types';
export {
  MastraModeStrictFailureError,
  SPECIALISTS_BY_MODE,
  REQUEST_CONTEXT_SCHEMA,
  COMMITTEE_DEADLINE_MS,
} from '../../committee/types';

export interface MastraModeSettings extends Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'> {
  embeddingModel?: UserSettingsRow['embeddingModel'];
  defaultSymbol?: UserSettingsRow['defaultSymbol'] | null;
  language?: UserSettingsRow['language'] | null;
  timezone?: UserSettingsRow['timezone'] | null;
  /** User-picked per-committee-agent top-tier models (§3.1). */
  agentModelOverrides?: UserSettingsRow['agentModelOverrides'];
}

export interface RunMastraModeArgs {
  prompt: string;
  symbol: string;
  userId: string;
  threadId: string;
  runId: string;
  mode: MastraAnalysisMode;
  modelOverride?: string | null;
  settings: MastraModeSettings;
  env: ResolveModelEnv;
  signal?: AbortSignal;
  /** Idempotency key of the current user message already stored in Drizzle. */
  backfillExcludeMessageIdempotencyKey?: string;
  telemetryKind?: 'mastra_mode' | 'mastra_full_job';
  /**
   * Storage key for the run record. Defaults to the workflow's own id
   * (`symbol-research`); the durable Full-mode queue passes `full-analysis`
   * so the worker's run continues the record the web enqueued (Phase 3).
   */
  workflowId?: string;
  /** Restart an existing persisted workflow run instead of duplicating its steps. */
  resumeExisting?: boolean;
  /** Progress sink for durable workflow status projection. */
  onProgress?: (step: string) => void | Promise<void>;
  executionPlan?: ExecutionPlan | undefined;
  ledger?: GenerationLedger;
}

export interface MastraModeResult {
  finalText: string;
  agentOpinions: MastraModeOpinion[];
  /** §3.2: cross-critique peer reviews (full mode, Q6 ON by default). */
  committeeCritiques: CommitteeCritique[];
  mode: MastraAnalysisMode;
  symbol: string;
  packet: SymbolResearchPacket;
  modelId: string;
  providerId: string;
  stats: MastraGenerationStats;
  totalCostUsd: number;
  totalLatencyMs: number;
  answerOutcome: 'ready' | 'blocked' | 'degraded';
  /** 'degraded' when native-memory preparation partially failed (Phase 9). */
  memoryMode: 'native' | 'degraded';
  /** Whether native memory preparation attempted legacy history backfill. */
  memoryBackfill: boolean;
  modelSnapshot: {
    providerId: string;
    bareModelId: string;
  };
  messageId?: string;
}

export function resolveMastraModeModel(
  settings: MastraModeSettings,
  env: ResolveModelEnv,
  modelOverride?: string | null,
  executionPlan?: ExecutionPlan,
): ChatModelResolution {
  const snapshot = executionPlan ? requireExecutionPlanModel(executionPlan) : undefined;
  return resolveMastraExecutionModel({
    purpose: 'mode',
    settings,
    env,
    domain: 'technical',
    ...(modelOverride !== undefined ? { modelOverride } : {}),
    ...(snapshot ? { snapshot } : {}),
  });
}

/** Base run context (no packet — the workflow collects it inside its first step). */
function contextForRun(args: RunMastraModeArgs): RequestContext {
  REQUEST_CONTEXT_SCHEMA.parse({
    userId: args.userId,
    runId: args.runId,
    threadId: args.threadId,
    symbol: args.symbol,
  });
  return new RequestContext([
    ['userId', args.userId],
    ['runId', args.runId],
    ['threadId', args.threadId],
    ['symbol', args.symbol],
  ]);
}

function failedAgentsFromRun(
  result: { steps?: Record<string, { status?: string; output?: { ok?: boolean } }> },
  mode: MastraAnalysisMode,
): MastraSpecialistName[] {
  const failed: MastraSpecialistName[] = [];
  for (const name of SPECIALISTS_BY_MODE[mode]) {
    const step = result.steps?.[name];
    if (step?.status === 'failed' || step?.output?.ok === false) failed.push(name);
  }
  return failed;
}

/**
 * Audit plan §3.1 (Q1: quality always) — resolve per-committee-agent models
 * from the user's `agentModelOverrides` (or `MASTRA_COMMITTEE_MODELS` env
 * JSON). Every pick is a user/operator-chosen top-tier model — this resolver
 * NEVER downgrades to a cheaper tier. Gated by `PHASE3_MODEL_DIVERSITY`
 * (default off; rollback is one env var). Unresolvable picks fall back to
 * the run's primary top-tier model by returning null.
 */
export function committeeModelResolver(
  settings: MastraModeSettings,
  env: ResolveModelEnv,
): NonNullable<Parameters<typeof createCommitteeWorkflow>[0]['resolveModelForAgent']> | undefined {
  if (!readFeatureFlag('PHASE3_MODEL_DIVERSITY')) return undefined;

  let envOverrides: Record<string, string> = {};
  const rawEnvModels = process.env.MASTRA_COMMITTEE_MODELS;
  if (rawEnvModels) {
    try {
      const parsed: unknown = JSON.parse(rawEnvModels);
      if (parsed && typeof parsed === 'object') {
        envOverrides = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        );
      }
    } catch (error) {
      // A malformed env config must never break the run.
      void error;
    }
  }

  const pickFor = (
    agent: 'technical' | 'fundamental' | 'risk' | 'sentiment' | 'fusion',
  ): string | undefined => {
    const key = agent === 'fusion' ? 'decision' : agent;
    return settings.agentModelOverrides?.[key] ?? envOverrides[key];
  };

  const allAgents = ['technical', 'fundamental', 'risk', 'sentiment', 'fusion'] as const;
  if (!allAgents.some((agent) => pickFor(agent))) return undefined;

  return (agent) => {
    const pick = pickFor(agent);
    if (!pick) return null;
    try {
      return resolveMastraExecutionModel({
        purpose: 'mode',
        settings,
        env,
        domain: 'technical',
        modelOverride: pick,
      });
    } catch {
      // The picked model is unavailable (e.g. BYOK key removed); fall back
      // to the primary top-tier model for this agent — never a cheap tier.
      return null;
    }
  };
}

export async function runMastraMode(args: RunMastraModeArgs): Promise<MastraModeResult> {
  if (args.executionPlan) assertExecutionPlanRoute(args.executionPlan, 'symbol-research');
  const startedAt = Date.now();
  const generationLedger = args.ledger ?? createGenerationLedger();
  const resolution = resolveMastraModeModel(
    args.settings,
    args.env,
    args.modelOverride,
    args.executionPlan,
  );
  // Until preparation succeeds, a memory-dependent run is degraded. This
  // prevents setup failures from being reported as healthy native memory.
  let memoryMode: 'native' | 'degraded' = 'degraded';
  let memoryBackfill = false;
  beginMastraRun({
    runId: args.runId,
    threadId: args.threadId,
    model: resolution.modelId,
    providerId: resolution.providerId,
  });

  try {
    // The worker's durable Full-mode path is long-lived, so observational
    // memory (background observation agents) is safe to enable there.
    // Vercel paths keep it off (short-lived functions).
    // Shared research-run context (Phase 7): native memory preparation plus
    // research guardrails/scorers, identical to the XAUUSD research paths.
    const memoryOptions =
      args.telemetryKind === 'mastra_full_job'
        ? kestrelMemoryOptions({
            env: args.env,
            forceObservationalMemory: true,
            // Capability-specific semantic recall from the execution plan
            // (Phase 9): the manifest default wins over the global gate.
            ...(args.executionPlan
              ? { semanticRecall: args.executionPlan.memoryPolicy.semanticRecall }
              : {}),
          })
        : undefined;
    const runContext = await prepareResearchRunContext({
      userId: args.userId,
      threadId: args.threadId,
      settings: {
        aiApiKeys: args.settings.aiApiKeys,
        chatModel: args.settings.chatModel ?? null,
        ...(args.settings.embeddingModel !== undefined
          ? { embeddingModel: args.settings.embeddingModel }
          : {}),
        defaultSymbol: args.settings.defaultSymbol ?? null,
        language: args.settings.language ?? null,
        timezone: args.settings.timezone ?? null,
      },
      env: args.env,
      includeResearchPolicies: true,
      // Audit plan §1.2: guardrail mode from the capability manifest.
      guardrailMode: args.executionPlan?.guardrail.mode ?? 'strict',
      ...(memoryOptions ? { memoryOptions } : {}),
      ...(args.backfillExcludeMessageIdempotencyKey
        ? { backfillExcludeMessageIdempotencyKey: args.backfillExcludeMessageIdempotencyKey }
        : {}),
    });
    const memory = runContext.memory;
    const prepared = runContext.prepared;
    memoryMode = prepared.memoryDegraded ? 'degraded' : 'native';
    memoryBackfill = prepared.backfillAttempted;
    const guardrails = runContext.research!.guardrails.processors;
    const researchScorers = runContext.research!.scorers.entries;
    const requestContext = contextForRun(args);
    // §3.1: per-agent top-tier committee models when the user configured them.
    const resolveModelForAgent = committeeModelResolver(args.settings, args.env);
    let toolDb: ReturnType<typeof getDb> | undefined;
    try {
      toolDb = getDb();
    } catch {
      // In unit test environments without DB env config, db is optional
    }
    const toolContext = createToolContext({
      threadId: args.threadId,
      userId: args.userId,
      latestUserMessageText: args.prompt,
      env: args.env as any,
      signal: args.signal ?? null,
      budget: {
        spent: 0,
        max:
          (args.settings as UserSettingsRow).maxDailyUsd ??
          (args.env as { MAX_DAILY_USD?: number }).MAX_DAILY_USD ??
          10,
      },
      userSettings: args.settings as UserSettingsRow,
      db: toolDb,
      toolTelemetryBuffer: [],
      ledger: generationLedger,
    });
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
        ...(resolveModelForAgent ? { resolveModelForAgent } : {}),
        ledger: generationLedger,
        mastra: getKestrelMastra().instance,
        toolContext,
        disabledTools: (args.settings as UserSettingsRow)?.disabledTools,
        // Audit plan §1.7: synchronous web runs get a 45s committee deadline
        // (strict failure on timeout); the durable worker is lease-governed.
        ...(args.telemetryKind === 'mastra_full_job' ? {} : { deadlineMs: COMMITTEE_DEADLINE_MS }),
      },
      args.mode,
      args.workflowId ?? 'symbol-research',
    );
    const run = await workflow.createRun({ runId: args.runId, resourceId: args.userId });
    const tracingOptions = runTracingOptions({
      runId: args.runId,
      userId: args.userId,
      threadId: args.threadId,
      kind: args.telemetryKind ?? 'mastra_mode',
      tags: ['research', args.mode],
      memoryMode: prepared.memoryDegraded ? 'degraded' : 'native',
      memoryBackfill: prepared.backfillAttempted,
    });
    const inputData = { prompt: args.prompt, symbol: args.symbol, mode: args.mode };
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
    const result = await withToolContext(toolContext, async () => {
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
      startedAt,
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
      throw new MastraModeStrictFailureError(
        failedAgentsFromRun(result as never, args.mode),
        error,
      );
    }

    const output = result.result as {
      status: 'ready' | 'blocked';
      blockedText?: string;
      finalText?: string;
      opinions: MastraModeOpinion[];
      critiques?: CommitteeCritique[];
      packet: SymbolResearchPacket;
      stats: MastraGenerationStats;
      totalCostUsd?: number;
    };

    if (output.status === 'blocked' || !output.finalText) {
      const stats = output.stats ?? { inputTokens: 0, outputTokens: 0, toolCalls: 0, steps: 0 };
      const text =
        output.blockedText ??
        `I could not complete ${args.symbol} ${args.mode} analysis because required market data is unavailable.`;
      await finishMastraRun({
        userId: args.userId,
        threadId: args.threadId,
        runId: args.runId,
        model: resolution.modelId,
        providerId: resolution.providerId,
        startedAt,
        ...stats,
        outcome: 'success',
        memoryMode: prepared.memoryDegraded ? 'degraded' : 'native',
        memoryBackfill: prepared.backfillAttempted,
        ...(args.telemetryKind ? { telemetryKind: args.telemetryKind } : {}),
      });
      return {
        finalText: text,
        agentOpinions: [],
        committeeCritiques: [],
        mode: args.mode,
        symbol: output.packet.symbol,
        packet: output.packet,
        modelId: resolution.modelId,
        providerId: resolution.providerId,
        stats,
        totalCostUsd: 0,
        totalLatencyMs: Date.now() - startedAt,
        answerOutcome: 'blocked',
        memoryMode: prepared.memoryDegraded ? 'degraded' : 'native',
        memoryBackfill: prepared.backfillAttempted,
        modelSnapshot: {
          providerId: resolution.providerId,
          bareModelId: resolution.bareModelId,
        },
      };
    }

    const workflowCostUsd = output.totalCostUsd ?? 0;
    if (generationLedger.total() === 0 && workflowCostUsd > 0) {
      generationLedger.recordCost(`workflow:${args.runId}`, 'fusion', workflowCostUsd);
    }
    const totalCostUsd = generationLedger.total();
    await finishMastraRun({
      userId: args.userId,
      threadId: args.threadId,
      runId: args.runId,
      model: resolution.modelId,
      providerId: resolution.providerId,
      startedAt,
      ...output.stats,
      outcome: 'success',
      memoryMode: prepared.memoryDegraded ? 'degraded' : 'native',
      memoryBackfill: prepared.backfillAttempted,
      ...(args.telemetryKind ? { telemetryKind: args.telemetryKind } : {}),
    });

    return {
      finalText: output.finalText,
      agentOpinions: output.opinions,
      committeeCritiques: output.critiques ?? [],
      mode: args.mode,
      symbol: output.packet.symbol,
      packet: output.packet,
      modelId: resolution.modelId,
      providerId: resolution.providerId,
      stats: output.stats,
      totalCostUsd,
      totalLatencyMs: Date.now() - startedAt,
      answerOutcome: output.packet.dataQuality === 'complete' ? 'ready' : 'degraded',
      memoryMode: prepared.memoryDegraded ? 'degraded' : 'native',
      memoryBackfill: prepared.backfillAttempted,
      modelSnapshot: {
        providerId: resolution.providerId,
        bareModelId: resolution.bareModelId,
      },
    };
  } catch (error) {
    logWorkflowError({
      runId: args.runId,
      workflowId: args.workflowId ?? 'symbol-research',
      stepId: args.mode,
      startedAt,
      message: 'Symbol-research workflow run failed',
      meta: { mode: args.mode, symbol: args.symbol },
      error,
    });
    await finishMastraRun({
      userId: args.userId,
      threadId: args.threadId,
      runId: args.runId,
      model: resolution.modelId,
      providerId: resolution.providerId,
      startedAt,
      inputTokens: 0,
      outputTokens: 0,
      toolCalls: 0,
      steps: 0,
      outcome: mastraOutcomeForError(error, args.signal),
      memoryMode,
      memoryBackfill,
      ...(args.telemetryKind ? { telemetryKind: args.telemetryKind } : {}),
      error,
    });
    throw error;
  }
}
