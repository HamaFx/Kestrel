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

import { getDiagnosticContext, withDiagnostics } from '../diagnostics';
import { prepareKestrelMemory } from '../mastra-v2/context';
import { buildConversationScorers, buildResearchScorers } from '../mastra-v2/evals/scorers';
import {
  buildConversationGuardrails,
  buildResearchGuardrails,
} from '../mastra-v2/guardrails';
import { getKestrelMastra } from '../mastra-v2/instance';
import { logWorkflowEnd, logWorkflowError, logWorkflowStart } from '../mastra-v2/logger';
import { createKestrelMemory, type CreateKestrelMemoryArgs } from '../mastra-v2/memory';
import { runTracingOptions } from '../mastra-v2/telemetry';
import { createXauusdReportWorkflow } from '../mastra-v2/workflows/xauusd-report';
import { resolveMastraModel, type ChatModelResolution } from '../model';
import { telemetryConfig } from '../telemetry';
import type { ResolveModelEnv } from '../vertex-factory';
import { createXauusdMastraAgent } from './agent';
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
  /** When set, answer using the latest verified report instead of creating a new report. */
  followup?: boolean;
  priorReport?: XauusdResearchReport | null;
}

export function resolveXauusdMastraModel(
  settings: XauusdMastraSettings,
  env: ResolveModelEnv,
  modelOverride?: string | null,): ChatModelResolution {
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
  return resolveMastraModel({
    purpose: 'xauusd',
    settings: mastraSettings,
    env,
    domain: 'technical',
    ...(modelOverride !== undefined ? { modelOverride } : {}),
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
    warnings: ['Answering from the saved report only. Request a fresh analysis for current market data.'],
  });
}

export interface XauusdMastraRunResult {
  result: MastraGenerationResultLike;
  report: XauusdResearchReport | null;
  packet: XauusdResearchPacket;
  modelId: string;
  providerId: string;
  stats: MastraGenerationStats;
}

async function executeXauusdMastraRun(args: RunXauusdMastraArgs): Promise<XauusdMastraRunResult> {
  const startedAt = Date.now();
  let resolution: ChatModelResolution | null = null;

  try {
    resolution = resolveXauusdMastraModel(args.settings, args.env, args.modelOverride);
    beginMastraRun({
      runId: args.runId,
      threadId: args.threadId,
      model: resolution.modelId,
      providerId: resolution.providerId,
    });

    const memory = createKestrelMemory({
      settings: {
        aiApiKeys: args.settings.aiApiKeys,
        embeddingModel: args.settings.embeddingModel ?? null,
      },
      env: args.env,
    } satisfies CreateKestrelMemoryArgs);
    const prepared = await prepareKestrelMemory({
      memory,
      userId: args.userId,
      threadId: args.threadId,
      settings: {
        chatModel: args.settings.chatModel ?? null,
        embeddingModel: args.settings.embeddingModel ?? null,
      },
      backfill: true,
      ...(args.backfillExcludeMessageIdempotencyKey
        ? { excludeMessageIdempotencyKey: args.backfillExcludeMessageIdempotencyKey }
        : {}),
    });
    const { processors: conversationGuardrails } = buildConversationGuardrails(
      { aiApiKeys: args.settings.aiApiKeys, chatModel: args.settings.chatModel },
      args.env,
    );
    const { entries: conversationScorers } = buildConversationScorers(
      { aiApiKeys: args.settings.aiApiKeys, chatModel: args.settings.chatModel },
      args.env,
    );
    const { entries: researchScorers } = buildResearchScorers(
      { aiApiKeys: args.settings.aiApiKeys, chatModel: args.settings.chatModel },
      args.env,
    );

    const followupAgent = createXauusdMastraAgent({
      model: resolution.model,
      memory,
      inputProcessors: conversationGuardrails,
      scorers: conversationScorers,
    });
    if (args.followup && args.priorReport) {
      const followupPacket = followupPacketFromReport(args.priorReport);
      const requestContext = contextForRun(args, followupPacket);
      const result = await generateXauusdFollowup(
        followupAgent,
        args.prompt,
        requestContext,
        resolution.providerId,
        args.priorReport,
        followupPacket,
        args.signal,
        prepared.callOptions,
      );
      const stats = getMastraGenerationStats(result);
      await finishMastraRun({
        userId: args.userId,
        threadId: args.threadId,
        runId: args.runId,
        model: resolution.modelId,
        providerId: resolution.providerId,
        startedAt,
        ...stats,
        outcome: 'success',
        ...(args.telemetryKind ? { telemetryKind: args.telemetryKind } : {}),
      });
      return {
        result,
        report: null,
        packet: followupPacket,
        modelId: resolution.modelId,
        providerId: resolution.providerId,
        stats,
      };
    }

    // Verified-report generation uses research guardrails and scorers;
    // follow-up answers above use the lighter conversation policy.
    const { processors: researchGuardrails } = buildResearchGuardrails(
      { aiApiKeys: args.settings.aiApiKeys, chatModel: args.settings.chatModel },
      args.env,
    );
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
        tags: ['xauusd-report'],
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
        ...(args.telemetryKind ? { telemetryKind: args.telemetryKind } : {}),
      });
      return {
        result: { text },
        report: null,
        packet: output.packet,
        modelId: resolution.modelId,
        providerId: resolution.providerId,
        stats,
      };
    }
    const { report, packet } = output;
    const result = output.result as MastraGenerationResultLike;
    const stats = output.stats;
    await finishMastraRun({
      userId: args.userId,
      threadId: args.threadId,
      runId: args.runId,
      model: resolution.modelId,
      providerId: resolution.providerId,
      startedAt,
      ...stats,
      outcome: 'success',
      ...(args.telemetryKind ? { telemetryKind: args.telemetryKind } : {}),
    });
    return {
      result,
      report,
      packet,
      modelId: resolution.modelId,
      providerId: resolution.providerId,
      stats,
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
  const startedAt = Date.now();
  let resolution: ChatModelResolution | null = null;
  try {
    resolution = resolveXauusdMastraModel(args.settings, args.env, args.modelOverride);
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
        ...(args.telemetryKind ? { telemetryKind: args.telemetryKind } : {}),
      });
      return {
        result: { text },
        report: null,
        packet,
        modelId: resolution.modelId,
        providerId: resolution.providerId,
        stats,
      };
    }
    const memory = createKestrelMemory({
      settings: {
        aiApiKeys: args.settings.aiApiKeys,
        embeddingModel: args.settings.embeddingModel ?? null,
      },
      env: args.env,
    } satisfies CreateKestrelMemoryArgs);
    const prepared = await prepareKestrelMemory({
      memory,
      userId: args.userId,
      threadId: args.threadId,
      settings: {
        chatModel: args.settings.chatModel ?? null,
        embeddingModel: args.settings.embeddingModel ?? null,
      },
      backfill: true,
    });
    const { processors: guardrails } = buildConversationGuardrails(
      { aiApiKeys: args.settings.aiApiKeys, chatModel: args.settings.chatModel },
      args.env,
    );
    const { entries: conversationScorers } = buildConversationScorers(
      { aiApiKeys: args.settings.aiApiKeys, chatModel: args.settings.chatModel },
      args.env,
    );
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
      maxSteps: 3,
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
        tags: ['xauusd-conversation'],
      }),
    });
    const stats = getMastraGenerationStats(result);
    await finishMastraRun({
      userId: args.userId,
      threadId: args.threadId,
      runId: args.runId,
      model: resolution.modelId,
      providerId: resolution.providerId,
      startedAt,
      ...stats,
      outcome: 'success',
      ...(args.telemetryKind ? { telemetryKind: args.telemetryKind } : {}),
    });
    return {
      result,
      report: null,
      packet,
      modelId: resolution.modelId,
      providerId: resolution.providerId,
      stats,
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
      ...(args.telemetryKind ? { telemetryKind: args.telemetryKind } : {}),
      error,
    });
    throw error;
  }
}

export function runXauusdMastraConversation(args: RunXauusdMastraArgs): Promise<XauusdMastraRunResult> {
  if (getDiagnosticContext()) return executeXauusdMastraConversationRun(args);
  return withDiagnostics(args.userId, args.threadId, () => executeXauusdMastraConversationRun(args), { runId: args.runId, deferCompletion: false });
}

export interface XauusdMastraConversationStream {
  text: AsyncIterable<string>;
  completion: Promise<{ result: MastraGenerationResultLike; packet: XauusdResearchPacket; modelId: string; providerId: string; stats: MastraGenerationStats }>;
}

export async function runXauusdMastraConversationStream(args: RunXauusdMastraArgs): Promise<XauusdMastraConversationStream> {
  const startedAt = Date.now();
  let resolution: ChatModelResolution | null = null;
  const runner = async () => {
    resolution = resolveXauusdMastraModel(args.settings, args.env, args.modelOverride);
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
      await finishMastraRun({ userId: args.userId, threadId: args.threadId, runId: args.runId, model: resolution.modelId, providerId: resolution.providerId, startedAt, ...stats, outcome: 'success', ...(args.telemetryKind ? { telemetryKind: args.telemetryKind } : {}) });
      return { text: (async function* () { yield result.text; })(), completion: Promise.resolve({ result, packet, modelId: resolution.modelId, providerId: resolution.providerId, stats }) };
    }
    const memory = createKestrelMemory({
      settings: {
        aiApiKeys: args.settings.aiApiKeys,
        embeddingModel: args.settings.embeddingModel ?? null,
      },
      env: args.env,
    } satisfies CreateKestrelMemoryArgs);
    const prepared = await prepareKestrelMemory({
      memory,
      userId: args.userId,
      threadId: args.threadId,
      settings: {
        chatModel: args.settings.chatModel ?? null,
        embeddingModel: args.settings.embeddingModel ?? null,
      },
      backfill: true,
    });
    const { processors: guardrails } = buildConversationGuardrails(
      { aiApiKeys: args.settings.aiApiKeys, chatModel: args.settings.chatModel },
      args.env,
    );
    const { entries: conversationScorers } = buildConversationScorers(
      { aiApiKeys: args.settings.aiApiKeys, chatModel: args.settings.chatModel },
      args.env,
    );
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
      maxSteps: 3,
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
        tags: ['xauusd-conversation'],
      }),
    });
    const finishRun = createMastraRunFinalizer();
    async function* textIter(): AsyncIterable<string> {
      try {
        for await (const chunk of output.textStream) {
          if (args.signal?.aborted) throw args.signal.reason ?? new DOMException('Aborted', 'AbortError');
          yield chunk;
        }
      } catch (error) {
        await finishRun({ userId: args.userId, threadId: args.threadId, runId: args.runId, model: resolution?.modelId ?? 'unresolved', providerId: resolution?.providerId ?? 'unresolved', startedAt, inputTokens: 0, outputTokens: 0, toolCalls: 0, steps: 0, outcome: mastraOutcomeForError(error, args.signal), ...(args.telemetryKind ? { telemetryKind: args.telemetryKind } : {}), error });
        throw error;
      }
    }
    const completion = (async () => {
      try {
        const full = await output.getFullOutput();
        const stats = getMastraGenerationStats(full);
        const result: MastraGenerationResultLike = { text: full.text, totalUsage: full.totalUsage };
        await finishRun({ userId: args.userId, threadId: args.threadId, runId: args.runId, model: resolution.modelId, providerId: resolution.providerId, startedAt, ...stats, outcome: args.signal?.aborted ? mastraOutcomeForError(args.signal.reason, args.signal) : 'success', ...(args.telemetryKind ? { telemetryKind: args.telemetryKind } : {}) });
        return { result, packet, modelId: resolution.modelId, providerId: resolution.providerId, stats };
      } catch (error) {
        await finishRun({ userId: args.userId, threadId: args.threadId, runId: args.runId, model: resolution?.modelId ?? 'unresolved', providerId: resolution?.providerId ?? 'unresolved', startedAt, inputTokens: 0, outputTokens: 0, toolCalls: 0, steps: 0, outcome: mastraOutcomeForError(error, args.signal), ...(args.telemetryKind ? { telemetryKind: args.telemetryKind } : {}), error });
        throw error;
      }
    })();
    return { text: textIter(), completion };
  };
  if (getDiagnosticContext()) return runner();
  return withDiagnostics(args.userId, args.threadId, runner, { runId: args.runId, deferCompletion: false });
}

export function runXauusdMastra(args: RunXauusdMastraArgs): Promise<XauusdMastraRunResult> {
  if (getDiagnosticContext()) return executeXauusdMastraRun(args);
  return withDiagnostics(args.userId, args.threadId, () => executeXauusdMastraRun(args), { runId: args.runId, deferCompletion: false });
}

export const runXauusdMastraProofWithByok = runXauusdMastra;
export type XauusdMastraModel = LanguageModel;
