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

import type { UserSettingsRow } from '@kestrel/db/schema';
import { RequestContext } from '@mastra/core/request-context';
import type { LanguageModel } from 'ai';

import { estimateCostUsd } from '../cost';
import { getDiagnosticContext, withDiagnostics } from '../diagnostics';
import { createGenerationLedger, type GenerationLedger } from '../generation-ledger';
import { getKestrelMastra } from '../mastra-v2/instance';
import { logWorkflowEnd, logWorkflowError, logWorkflowStart } from '../mastra-v2/logger';
import { kestrelMemoryOptions } from '../mastra-v2/memory';
import { prepareResearchRunContext } from '../mastra-v2/research-context';
import { runTracingOptions } from '../mastra-v2/telemetry';
import { createXauusdReportWorkflow } from '../mastra-v2/workflows/xauusd-report';
import { resolveMastraExecutionModel, type ChatModelResolution } from '../model';
import { telemetryConfig } from '../telemetry';
import type { ResolveModelEnv } from '../vertex-factory';
import { createXauusdMastraAgent } from './agent';
import { manifestForCapability } from './capabilities';
import {
  assertExecutionPlanRoute,
  requireExecutionPlanModel,
  type ExecutionPlan,
} from './execution-plan';
import { generateXauusdFollowup } from './report-generation';
import { blockedXauusdResearchText } from './report-text';
import type { XauusdResearchReport } from './report-types';
import { collectXauusdResearchPacket } from './research-packet';
import { XauusdResearchPacketSchema, type XauusdResearchPacket } from './research-types';
import type { MastraGenerationResultLike, MastraGenerationStats } from './stats';
import {
  beginMastraRun,
  createMastraRunFinalizer,
  finishMastraRun,
  getMastraGenerationStats,
  mastraOutcomeForError,
} from './telemetry';
import { xauusdMastraConversationToolNames } from './tools';
import { XauusdRequestContextSchema, type XauusdRequestContext } from './types';

export interface XauusdMastraSettings extends Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'> {
  embeddingModel?: UserSettingsRow['embeddingModel'];
  defaultSymbol?: UserSettingsRow['defaultSymbol'] | null;
  language?: UserSettingsRow['language'] | null;
  timezone?: UserSettingsRow['timezone'] | null;
}

export interface RunXauusdMastraArgs {
  prompt: string;
  userId: string;
  threadId: string;
  runId: string;
  settings: XauusdMastraSettings;
  env: ResolveModelEnv;
  /** Explicit user model override; operator pin is used when absent. */
  modelOverride?: string | null;
  signal?: AbortSignal;
  /** Idempotency key of the current user message already stored in Drizzle. */
  backfillExcludeMessageIdempotencyKey?: string;
  /** Telemetry kind for the run. */
  telemetryKind?: 'mastra_xauusd_poc';
  /**
   * Explicit turn mode (Phase 7). `followup` answers from the saved verified
   * report instead of creating a new report and requires `priorReport`.
   */
  turnMode?: XauusdTurnMode;
  priorReport?: XauusdResearchReport | null;
  executionPlan?: ExecutionPlan;
  ledger?: GenerationLedger;
}

export function resolveXauusdMastraModel(
  settings: XauusdMastraSettings,
  env: ResolveModelEnv,
  modelOverride?: string | null,
  executionPlan?: ExecutionPlan,
): ChatModelResolution {
  // The same resolver used by production chat provides the user's encrypted
  // BYOK key, provider choice, circuit-breaker behavior, and model catalog
  // validation. Mastra receives only the resulting LanguageModel object.
  //
  // M6 fix — the verified-report pipeline is a structured, latency-sensitive
  // multi-step generation. It intentionally does NOT honor the user's
  // heavyweight chat model pick (e.g. mistral-large-latest): flagship
  // reasoning models routinely blow past the 55s route budget for this flow
  // (measured >120s locally). The provider's fast technical tier (e.g.
  // mistral-small-latest, ~20s per verified report) is used instead.
  // Operators can pin an exact model with MASTRA_XAUUSD_MODEL="provider:model".
  const pinned = process.env.MASTRA_XAUUSD_MODEL;
  const selectedModel = modelOverride ?? (pinned && pinned.length > 0 ? pinned : null);
  const mastraSettings: XauusdMastraSettings = {
    aiApiKeys: settings.aiApiKeys,
    chatModel: selectedModel,
  };
  const snapshot = executionPlan ? requireExecutionPlanModel(executionPlan) : undefined;
  return resolveMastraExecutionModel({
    purpose: 'xauusd',
    settings: mastraSettings,
    env,
    domain: 'technical',
    ...(modelOverride !== undefined ? { modelOverride } : {}),
    ...(snapshot ? { snapshot } : {}),
  });
}

function baseContextForRun(args: RunXauusdMastraArgs): RequestContext<XauusdRequestContext> {
  const values = { userId: args.userId, runId: args.runId, threadId: args.threadId };
  XauusdRequestContextSchema.parse(values);
  return new RequestContext<XauusdRequestContext>([
    ['userId', args.userId],
    ['runId', args.runId],
    ['threadId', args.threadId],
  ]);
}

function contextForRun(
  args: RunXauusdMastraArgs,
  researchPacket: XauusdResearchPacket,
): RequestContext<XauusdRequestContext> {
  const values = {
    userId: args.userId,
    runId: args.runId,
    threadId: args.threadId,
    researchPacket,
    ...(args.priorReport ? { priorReport: args.priorReport } : {}),
  };
  XauusdRequestContextSchema.parse(values);
  const entries: Array<
    | ['userId', string]
    | ['runId', string]
    | ['threadId', string]
    | ['researchPacket', XauusdResearchPacket]
    | ['priorReport', XauusdResearchReport]
  > = [
    ['userId', args.userId],
    ['runId', args.runId],
    ['threadId', args.threadId],
    ['researchPacket', researchPacket],
  ];
  if (args.priorReport) entries.push(['priorReport', args.priorReport]);
  return new RequestContext(entries);
}

function blockedStats(): MastraGenerationStats {
  return { inputTokens: 0, outputTokens: 0, toolCalls: 0, steps: 0 };
}

/**
 * Explicit XAUUSD turn mode (Phase 7). `followup` answers from the saved
 * verified report's own data, NOT from fresh market data — this prevents
 * stale-report answers from mixing in today's prices.
 */
export type XauusdTurnMode = 'research' | 'conversation' | 'followup';

/**
 * Build a minimal research packet from a saved report for follow-up questions.
 * Follow-ups answer from the report's own data, NOT from fresh market data —
 * this prevents stale-report answers from mixing in today's prices.
 */
function followupPacketFromReport(report: XauusdResearchReport): XauusdResearchPacket {
  return XauusdResearchPacketSchema.parse({
    packetId: `followup:${report.asOf}`,
    kind: 'research_packet' as const,
    symbol: 'XAUUSD' as const,
    generatedAt: report.asOf,
    status: 'ready' as const,
    dataQuality: report.dataQuality,
    timeframes: [],
    price: null,
    candles: [],
    indicators: [],
    macro: null,
    missingData: ['follow-up context — no fresh market data'],
    warnings: [
      'Answering from the saved report only. Request a fresh analysis for current market data.',
    ],
  });
}

export interface XauusdMastraRunResult {
  result: MastraGenerationResultLike;
  report: XauusdResearchReport | null;
  packet: XauusdResearchPacket;
  modelId: string;
  providerId: string;
  bareModelId: string;
  stats: MastraGenerationStats;
  totalCostUsd: number;
  answerOutcome: 'ready' | 'blocked' | 'degraded';
  modelSnapshot: { providerId: string; bareModelId: string };
  /** 'degraded' when native-memory preparation partially failed (Phase 9). */
  memoryMode: 'native' | 'degraded';
  /** Whether native memory preparation attempted legacy history backfill. */
  memoryBackfill: boolean;
}

async function executeXauusdMastraRun(args: RunXauusdMastraArgs): Promise<XauusdMastraRunResult> {
  if (args.executionPlan) assertExecutionPlanRoute(args.executionPlan, 'xauusd-research');
  const startedAt = Date.now();
  const generationLedger = args.ledger ?? createGenerationLedger();
  let resolution: ChatModelResolution | null = null;
  // Until native memory preparation succeeds, report the run as degraded.
  let memoryMode: 'native' | 'degraded' = 'degraded';
  let memoryBackfill = false;

  try {
    resolution = resolveXauusdMastraModel(
      args.settings,
      args.env,
      args.modelOverride,
      args.executionPlan,
    );
    beginMastraRun({
      runId: args.runId,
      threadId: args.threadId,
      model: resolution.modelId,
      providerId: resolution.providerId,
    });

    // Shared research-run context (Phase 7): native memory + conversation and
    // research guardrail/scorer policies, identical to the committee mode path.
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
      includeConversationPolicies: true,
      includeResearchPolicies: true,
      // Capability-specific semantic recall from the execution plan (Phase 9).
      ...(args.executionPlan
        ? {
            memoryOptions: kestrelMemoryOptions({
              env: args.env,
              semanticRecall: args.executionPlan.memoryPolicy.semanticRecall,
            }),
          }
        : {}),
      ...(args.backfillExcludeMessageIdempotencyKey
        ? { backfillExcludeMessageIdempotencyKey: args.backfillExcludeMessageIdempotencyKey }
        : {}),
    });
    const memory = runContext.memory;
    const prepared = runContext.prepared;
    memoryMode = prepared.memoryDegraded ? 'degraded' : 'native';
    memoryBackfill = prepared.backfillAttempted;
    const conversationGuardrails = runContext.conversation!.guardrails.processors;
    const conversationScorers = runContext.conversation!.scorers.entries;
    const researchScorers = runContext.research!.scorers.entries;

    const followupAgent = createXauusdMastraAgent({
      model: resolution.model,
      memory,
      inputProcessors: conversationGuardrails,
      scorers: conversationScorers,
    });
    const priorReport = args.priorReport;
    if (args.turnMode === 'followup') {
      // Explicit follow-up mode: answer from the saved report. Missing prior
      // report fails closed instead of silently falling back to a fresh report.
      if (!priorReport) {
        throw new Error('XAUUSD follow-up mode requires a prior verified report.');
      }
      const followupPacket = followupPacketFromReport(priorReport);
      const requestContext = contextForRun(args, followupPacket);
      const result = await generateXauusdFollowup(
        followupAgent,
        args.prompt,
        requestContext,
        resolution.providerId,
        priorReport,
        followupPacket,
        args.signal,
        prepared.callOptions,
      );
      const stats = getMastraGenerationStats(result);
      generationLedger.recordUsage(
        `primary:${args.runId}`,
        'primary',
        resolution.modelId,
        stats.inputTokens,
        stats.outputTokens,
        estimateCostUsd,
      );
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
        result,
        report: null,
        packet: followupPacket,
        modelId: resolution.modelId,
        providerId: resolution.providerId,
        bareModelId: resolution.bareModelId,
        stats,
        totalCostUsd: generationLedger.total(),
        answerOutcome: 'ready',
        modelSnapshot: { providerId: resolution.providerId, bareModelId: resolution.bareModelId },
        memoryMode: prepared.memoryDegraded ? 'degraded' : 'native',
        memoryBackfill: prepared.backfillAttempted,
      };
    }

    // Verified-report generation uses research guardrails and scorers;
    // follow-up answers above use the lighter conversation policy.
    const researchGuardrails = runContext.research!.guardrails.processors;
    const reportAgent = createXauusdMastraAgent({
      model: resolution.model,
      memory,
      inputProcessors: researchGuardrails,
      scorers: researchScorers,
    });
    const workflow = createXauusdReportWorkflow({
      agent: reportAgent,
      callOptions: prepared.callOptions,
      providerId: resolution.providerId,
      ...(args.signal ? { signal: args.signal } : {}),
      mastra: getKestrelMastra().instance,
    });
    const run = await workflow.createRun({ runId: args.runId, resourceId: args.userId });
    logWorkflowStart({
      runId: args.runId,
      workflowId: 'xauusd-report',
      stepId: 'report',
      message: 'XAUUSD report workflow run started',
      meta: { model: resolution.modelId },
    });
    const runResult = await run.start({
      inputData: { prompt: args.prompt },
      requestContext: baseContextForRun(args) as never,
      tracingOptions: runTracingOptions({
        runId: args.runId,
        userId: args.userId,
        threadId: args.threadId,
        kind: args.telemetryKind ?? 'mastra_xauusd_poc',
        capabilityId: 'xauusd-research',
        tags: ['xauusd-report'],
        memoryMode: prepared.memoryDegraded ? 'degraded' : 'native',
        memoryBackfill: prepared.backfillAttempted,
      }),
    });
    if (runResult.status !== 'success') {
      logWorkflowError({
        runId: args.runId,
        workflowId: 'xauusd-report',
        stepId: 'report',
        startedAt,
        message: 'XAUUSD report workflow run failed',
        error:
          runResult.status === 'failed' && runResult.error
            ? runResult.error
            : new Error(`XAUUSD report workflow ended with ${runResult.status}`),
      });
      if (args.signal?.aborted) {
        throw args.signal.reason ?? new DOMException('Aborted', 'AbortError');
      }
      throw runResult.status === 'failed' && runResult.error
        ? runResult.error
        : new Error('Mastra XAUUSD report workflow failed');
    }
    logWorkflowEnd({
      runId: args.runId,
      workflowId: 'xauusd-report',
      stepId: 'report',
      startedAt,
      message: 'XAUUSD report workflow run completed',
    });
    const output = runResult.result as {
      status: 'ready' | 'blocked';
      blockedText?: string;
      report?: XauusdResearchReport | null;
      result?: MastraGenerationResultLike;
      packet: XauusdResearchPacket;
      attempts?: number;
      stats: MastraGenerationStats;
    };
    if (output.status === 'blocked' || !output.report) {
      const stats = output.stats ?? blockedStats();
      const text = output.blockedText ?? blockedXauusdResearchText(output.packet);
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
        result: { text },
        report: null,
        packet: output.packet,
        modelId: resolution.modelId,
        providerId: resolution.providerId,
        bareModelId: resolution.bareModelId,
        stats,
        totalCostUsd: generationLedger.total(),
        answerOutcome: 'ready',
        modelSnapshot: { providerId: resolution.providerId, bareModelId: resolution.bareModelId },
        memoryMode: prepared.memoryDegraded ? 'degraded' : 'native',
        memoryBackfill: prepared.backfillAttempted,
      };
    }
    const { report, packet } = output;
    const result = output.result as MastraGenerationResultLike;
    const stats = output.stats;
    generationLedger.recordUsage(
      `primary:${args.runId}`,
      'primary',
      resolution.modelId,
      stats.inputTokens,
      stats.outputTokens,
      estimateCostUsd,
    );
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
      result,
      report,
      packet,
      modelId: resolution.modelId,
      providerId: resolution.providerId,
      bareModelId: resolution.bareModelId,
      stats,
      totalCostUsd: generationLedger.total(),
      answerOutcome: 'ready',
      modelSnapshot: { providerId: resolution.providerId, bareModelId: resolution.bareModelId },
      memoryMode: prepared.memoryDegraded ? 'degraded' : 'native',
      memoryBackfill: prepared.backfillAttempted,
    };
  } catch (error) {
    const outcome = mastraOutcomeForError(error, args.signal);
    await finishMastraRun({
      userId: args.userId,
      threadId: args.threadId,
      runId: args.runId,
      model: resolution?.modelId ?? 'unresolved',
      providerId: resolution?.providerId ?? 'unresolved',
      startedAt,
      inputTokens: 0,
      outputTokens: 0,
      toolCalls: 0,
      steps: 0,
      outcome,
      memoryMode,
      memoryBackfill,
      ...(args.telemetryKind ? { telemetryKind: args.telemetryKind } : {}),
      error,
    });
    throw error;
  }
}

/**
 * Run a bounded, read-only Mastra conversation using a trusted research
 * packet. This is intentionally separate from structured report generation:
 * ordinary Single-mode chat should be conversational, while deep research
 * must continue to pass the report verifier.
 */
async function executeXauusdMastraConversationRun(
  args: RunXauusdMastraArgs,
): Promise<XauusdMastraRunResult> {
  if (args.executionPlan) assertExecutionPlanRoute(args.executionPlan, 'xauusd-conversation');
  const startedAt = Date.now();
  const generationLedger = args.ledger ?? createGenerationLedger();
  let resolution: ChatModelResolution | null = null;
  // Until native memory preparation succeeds, report the run as degraded.
  let memoryMode: 'native' | 'degraded' = 'degraded';
  let memoryBackfill = false;

  try {
    resolution = resolveXauusdMastraModel(
      args.settings,
      args.env,
      args.modelOverride,
      args.executionPlan,
    );
    beginMastraRun({
      runId: args.runId,
      threadId: args.threadId,
      model: resolution.modelId,
      providerId: resolution.providerId,
    });
    const packet = await collectXauusdResearchPacket(args.signal);
    if (packet.status === 'blocked') {
      const stats = blockedStats();
      const text = blockedXauusdResearchText(packet);
      await finishMastraRun({
        userId: args.userId,
        threadId: args.threadId,
        runId: args.runId,
        model: resolution.modelId,
        providerId: resolution.providerId,
        startedAt,
        ...stats,
        outcome: 'success',
        memoryMode: 'native',
        memoryBackfill: false,
        ...(args.telemetryKind ? { telemetryKind: args.telemetryKind } : {}),
      });
      return {
        result: { text },
        report: null,
        packet,
        modelId: resolution.modelId,
        providerId: resolution.providerId,
        bareModelId: resolution.bareModelId,
        stats,
        totalCostUsd: 0,
        answerOutcome: 'blocked',
        modelSnapshot: { providerId: resolution.providerId, bareModelId: resolution.bareModelId },
        memoryMode: 'native',
        memoryBackfill: false,
      };
    }
    // Shared research-run context (Phase 7): native memory + conversation
    // guardrail/scorer policy, identical to the buffered XAUUSD paths.
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
      includeConversationPolicies: true,
      // Capability-specific semantic recall from the execution plan (Phase 9).
      ...(args.executionPlan
        ? {
            memoryOptions: kestrelMemoryOptions({
              env: args.env,
              semanticRecall: args.executionPlan.memoryPolicy.semanticRecall,
            }),
          }
        : {}),
      ...(args.backfillExcludeMessageIdempotencyKey
        ? { backfillExcludeMessageIdempotencyKey: args.backfillExcludeMessageIdempotencyKey }
        : {}),
    });
    const memory = runContext.memory;
    const prepared = runContext.prepared;
    memoryMode = prepared.memoryDegraded ? 'degraded' : 'native';
    memoryBackfill = prepared.backfillAttempted;
    const guardrails = runContext.conversation!.guardrails.processors;
    const conversationScorers = runContext.conversation!.scorers.entries;
    const agent = createXauusdMastraAgent({
      model: resolution.model,
      memory,
      inputProcessors: guardrails,
      scorers: conversationScorers,
    });
    const requestContext = contextForRun(args, packet);
    const result = await agent.generate(args.prompt, {
      requestContext,
      memory: prepared.callOptions,
      toolChoice: 'auto',
      activeTools: [...xauusdMastraConversationToolNames],
      maxSteps: manifestForCapability('xauusd-conversation').maxSteps,
      ...telemetryConfig({
        functionId: 'mastra.xauusd.conversation',
        metadata: { provider: resolution.providerId },
      }),
      ...(args.signal ? { abortSignal: args.signal } : {}),
      tracingOptions: runTracingOptions({
        runId: args.runId,
        userId: args.userId,
        threadId: args.threadId,
        kind: args.telemetryKind ?? 'mastra_xauusd_poc',
        capabilityId: 'xauusd-conversation',
        tags: ['xauusd-conversation'],
        memoryMode: prepared.memoryDegraded ? 'degraded' : 'native',
        memoryBackfill: prepared.backfillAttempted,
      }),
    });
    const stats = getMastraGenerationStats(result);
    generationLedger.recordUsage(
      `primary:${args.runId}`,
      'primary',
      resolution.modelId,
      stats.inputTokens,
      stats.outputTokens,
      estimateCostUsd,
    );
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
      result,
      report: null,
      packet,
      modelId: resolution.modelId,
      providerId: resolution.providerId,
      bareModelId: resolution.bareModelId,
      stats,
      totalCostUsd: generationLedger.total(),
      answerOutcome: 'ready',
      modelSnapshot: { providerId: resolution.providerId, bareModelId: resolution.bareModelId },
      memoryMode: prepared.memoryDegraded ? 'degraded' : 'native',

      memoryBackfill: prepared.backfillAttempted,
    };
  } catch (error) {
    const outcome = mastraOutcomeForError(error, args.signal);
    await finishMastraRun({
      userId: args.userId,
      threadId: args.threadId,
      runId: args.runId,
      model: resolution?.modelId ?? 'unresolved',
      providerId: resolution?.providerId ?? 'unresolved',
      startedAt,
      inputTokens: 0,
      outputTokens: 0,
      toolCalls: 0,
      steps: 0,
      outcome,
      memoryMode,
      memoryBackfill,
      ...(args.telemetryKind ? { telemetryKind: args.telemetryKind } : {}),
      error,
    });
    throw error;
  }
}

export function runXauusdMastraConversation(
  args: RunXauusdMastraArgs,
): Promise<XauusdMastraRunResult> {
  if (getDiagnosticContext()) return executeXauusdMastraConversationRun(args);
  return withDiagnostics(
    args.userId,
    args.threadId,
    () => executeXauusdMastraConversationRun(args),
    { runId: args.runId, deferCompletion: false },
  );
}

export interface XauusdMastraConversationStream {
  text: AsyncIterable<string>;
  completion: Promise<{
    result: MastraGenerationResultLike;
    packet: XauusdResearchPacket;
    modelId: string;
    providerId: string;
    bareModelId: string;
    stats: MastraGenerationStats;
    answerOutcome: 'ready' | 'blocked' | 'degraded';
    modelSnapshot: { providerId: string; bareModelId: string };
    memoryMode: 'native' | 'degraded';
    memoryBackfill: boolean;
  }>;
}

export async function runXauusdMastraConversationStream(
  args: RunXauusdMastraArgs,
): Promise<XauusdMastraConversationStream> {
  if (args.executionPlan) assertExecutionPlanRoute(args.executionPlan, 'xauusd-conversation');
  const startedAt = Date.now();
  let resolution: ChatModelResolution | null = null;
  let memoryMode: 'native' | 'degraded' = 'degraded';
  let memoryBackfill = false;
  const generationLedger = args.ledger ?? createGenerationLedger();
  const finishRun = createMastraRunFinalizer();
  const runner = async () => {
    try {
      resolution = resolveXauusdMastraModel(
        args.settings,
        args.env,
        args.modelOverride,
        args.executionPlan,
      );
      beginMastraRun({
        runId: args.runId,
        threadId: args.threadId,
        model: resolution.modelId,
        providerId: resolution.providerId,
      });
      const packet = await collectXauusdResearchPacket(args.signal);
      if (packet.status === 'blocked') {
        const stats = blockedStats();
        const result: MastraGenerationResultLike = { text: blockedXauusdResearchText(packet) };
        await finishMastraRun({
          userId: args.userId,
          threadId: args.threadId,
          runId: args.runId,
          model: resolution.modelId,
          providerId: resolution.providerId,
          startedAt,
          ...stats,
          outcome: 'success',
          memoryMode: 'native',
          memoryBackfill: false,
          ...(args.telemetryKind ? { telemetryKind: args.telemetryKind } : {}),
        });
        return {
          text: (async function* () {
            yield result.text;
          })(),
          completion: Promise.resolve({
            result,
            packet,
            modelId: resolution.modelId,
            providerId: resolution.providerId,
            bareModelId: resolution.bareModelId,
            stats,
            totalCostUsd: 0,
            answerOutcome: 'blocked' as const,
            modelSnapshot: {
              providerId: resolution.providerId,
              bareModelId: resolution.bareModelId,
            },
            memoryMode: 'native' as const,
            memoryBackfill: false,
          }),
        };
      }
      // Shared research-run context (Phase 7): native memory + conversation
      // guardrail/scorer policy, identical to the buffered XAUUSD paths.
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
        includeConversationPolicies: true,
        // Capability-specific semantic recall from the execution plan (Phase 9).
        ...(args.executionPlan
          ? {
              memoryOptions: kestrelMemoryOptions({
                env: args.env,
                semanticRecall: args.executionPlan.memoryPolicy.semanticRecall,
              }),
            }
          : {}),
        ...(args.backfillExcludeMessageIdempotencyKey
          ? { backfillExcludeMessageIdempotencyKey: args.backfillExcludeMessageIdempotencyKey }
          : {}),
      });
      const memory = runContext.memory;
      const prepared = runContext.prepared;
      memoryMode = prepared.memoryDegraded ? 'degraded' : 'native';
      memoryBackfill = prepared.backfillAttempted;
      const guardrails = runContext.conversation!.guardrails.processors;
      const conversationScorers = runContext.conversation!.scorers.entries;
      const agent = createXauusdMastraAgent({
        model: resolution.model,
        memory,
        inputProcessors: guardrails,
        scorers: conversationScorers,
      });
      const requestContext = contextForRun(args, packet);
      const output = await agent.stream(args.prompt, {
        requestContext,
        memory: prepared.callOptions,
        toolChoice: 'auto',
        activeTools: [...xauusdMastraConversationToolNames],
        maxSteps: manifestForCapability('xauusd-conversation').maxSteps,
        ...telemetryConfig({
          functionId: 'mastra.xauusd.conversation',
          metadata: { provider: resolution.providerId },
        }),
        ...(args.signal ? { abortSignal: args.signal } : {}),
        tracingOptions: runTracingOptions({
          runId: args.runId,
          userId: args.userId,
          threadId: args.threadId,
          kind: args.telemetryKind ?? 'mastra_xauusd_poc',
          capabilityId: 'xauusd-conversation',
          tags: ['xauusd-conversation'],
          memoryMode: prepared.memoryDegraded ? 'degraded' : 'native',
          memoryBackfill: prepared.backfillAttempted,
        }),
      });
      async function* textIter(): AsyncIterable<string> {
        try {
          for await (const chunk of output.textStream) {
            if (args.signal?.aborted)
              throw args.signal.reason ?? new DOMException('Aborted', 'AbortError');
            yield chunk;
          }
        } catch (error) {
          await finishRun({
            userId: args.userId,
            threadId: args.threadId,
            runId: args.runId,
            model: resolution?.modelId ?? 'unresolved',
            providerId: resolution?.providerId ?? 'unresolved',
            startedAt,
            inputTokens: 0,
            outputTokens: 0,
            toolCalls: 0,
            steps: 0,
            outcome: mastraOutcomeForError(error, args.signal),
            memoryMode: prepared.memoryDegraded ? 'degraded' : 'native',
            memoryBackfill: prepared.backfillAttempted,
            ...(args.telemetryKind ? { telemetryKind: args.telemetryKind } : {}),
            error,
          });
          throw error;
        }
      }
      const completion = (async () => {
        try {
          const full = await output.getFullOutput();
          const stats = getMastraGenerationStats(full);
          generationLedger.recordUsage(
            `primary:${args.runId}`,
            'primary',
            resolution.modelId,
            stats.inputTokens,
            stats.outputTokens,
            estimateCostUsd,
          );
          const result: MastraGenerationResultLike = {
            text: full.text,
            totalUsage: full.totalUsage,
          };
          await finishRun({
            userId: args.userId,
            threadId: args.threadId,
            runId: args.runId,
            model: resolution.modelId,
            providerId: resolution.providerId,
            startedAt,
            ...stats,
            outcome: args.signal?.aborted
              ? mastraOutcomeForError(args.signal.reason, args.signal)
              : 'success',
            memoryMode: prepared.memoryDegraded ? 'degraded' : 'native',
            memoryBackfill: prepared.backfillAttempted,
            ...(args.telemetryKind ? { telemetryKind: args.telemetryKind } : {}),
          });
          return {
            result,
            packet,
            modelId: resolution.modelId,
            providerId: resolution.providerId,
            bareModelId: resolution.bareModelId,
            stats,
            totalCostUsd: generationLedger.total(),
            answerOutcome: full.text.trim().length > 0 ? ('ready' as const) : ('degraded' as const),
            modelSnapshot: {
              providerId: resolution.providerId,
              bareModelId: resolution.bareModelId,
            },
            memoryMode: prepared.memoryDegraded ? ('degraded' as const) : ('native' as const),
            memoryBackfill: prepared.backfillAttempted,
          };
        } catch (error) {
          await finishRun({
            userId: args.userId,
            threadId: args.threadId,
            runId: args.runId,
            model: resolution?.modelId ?? 'unresolved',
            providerId: resolution?.providerId ?? 'unresolved',
            startedAt,
            inputTokens: 0,
            outputTokens: 0,
            toolCalls: 0,
            steps: 0,
            outcome: mastraOutcomeForError(error, args.signal),
            memoryMode: prepared.memoryDegraded ? 'degraded' : 'native',
            memoryBackfill: prepared.backfillAttempted,
            ...(args.telemetryKind ? { telemetryKind: args.telemetryKind } : {}),
            error,
          });
          throw error;
        }
      })();
      return { text: textIter(), completion };
    } catch (error) {
      await finishRun({
        userId: args.userId,
        threadId: args.threadId,
        runId: args.runId,
        model: resolution?.modelId ?? 'unresolved',
        providerId: resolution?.providerId ?? 'unresolved',
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
  };
  if (getDiagnosticContext()) return runner();
  return withDiagnostics(args.userId, args.threadId, runner, {
    runId: args.runId,
    deferCompletion: false,
  });
}

export function runXauusdMastra(args: RunXauusdMastraArgs): Promise<XauusdMastraRunResult> {
  if (getDiagnosticContext()) return executeXauusdMastraRun(args);
  return withDiagnostics(args.userId, args.threadId, () => executeXauusdMastraRun(args), {
    runId: args.runId,
    deferCompletion: false,
  });
}

export type XauusdMastraModel = LanguageModel;
