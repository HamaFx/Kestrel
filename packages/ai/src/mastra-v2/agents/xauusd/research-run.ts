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

// Verified-report and follow-up XAUUSD runs.

import { estimateCostUsd } from '@ai/budget/cost';
import type { ChatModelResolution } from '@ai/models/model';
import { createGenerationLedger } from '@ai/persistence/generation-ledger';

import { getKestrelMastra } from '../../instance';
import { logWorkflowEnd, logWorkflowError, logWorkflowStart } from '../../logger';
import { kestrelMemoryOptions } from '../../memory';
import type { XauusdResearchPacket } from '../../packets/research-types';
import { assertExecutionPlanRoute } from '../../planning/execution-plan';
import { prepareResearchRunContext } from '../../research-context';
import type { MastraGenerationResultLike, MastraGenerationStats } from '../../shared/stats';
import {
  beginMastraRun,
  finishMastraRun,
  getMastraGenerationStats,
  mastraOutcomeForError,
} from '../../shared/telemetry';
import { runTracingOptions } from '../../telemetry';
import { createXauusdReportWorkflow } from '../../workflows/xauusd-report';
import { createXauusdMastraAgent } from './agent';
import {
  baseContextForRun,
  blockedStats,
  contextForRun,
  followupPacketFromReport,
  resolveXauusdMastraModel,
} from './context';
import { generateXauusdFollowup } from './report/report-generation';
import { blockedXauusdResearchText } from './report/report-text';
import type { XauusdResearchReport } from './report/report-types';
import type { RunXauusdMastraArgs, XauusdMastraRunResult } from './run-types';

export async function executeXauusdMastraRun(
  args: RunXauusdMastraArgs,
): Promise<XauusdMastraRunResult> {
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
      // Audit plan §1.9: guardrail strategy + mode derive from the execution
      // plan, exactly as the canonical path consumes them (§1.2 manifest
      // trust policy — both XAUUSD capabilities are untrusted → strict+block).
      guardrailPolicy: {
        strategy: args.executionPlan?.guardrail.strategy ?? 'block',
        mode: args.executionPlan?.guardrail.mode ?? 'strict',
      },
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
        kind: args.telemetryKind ?? 'mastra_xauusd_research',
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
