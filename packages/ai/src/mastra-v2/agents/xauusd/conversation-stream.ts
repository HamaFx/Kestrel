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

// Token-streaming XAUUSD conversation.

import { estimateCostUsd } from '@ai/budget/cost';
import { getDiagnosticContext, withDiagnostics } from '@ai/diagnostics';
import type { ChatModelResolution } from '@ai/models/model';
import { createGenerationLedger } from '@ai/persistence/generation-ledger';
import { telemetryConfig } from '@ai/runtime/telemetry';

import { manifestForCapability } from '../../capabilities';
import { kestrelMemoryOptions } from '../../memory';
import { collectXauusdResearchPacket } from '../../packets/research-packet';
import type { XauusdResearchPacket } from '../../packets/research-types';
import { assertExecutionPlanRoute } from '../../planning/execution-plan';
import { prepareResearchRunContext } from '../../research-context';
import type { MastraGenerationResultLike, MastraGenerationStats } from '../../shared/stats';
import {
  beginMastraRun,
  createMastraRunFinalizer,
  finishMastraRun,
  getMastraGenerationStats,
  mastraOutcomeForError,
} from '../../shared/telemetry';
import { runTracingOptions } from '../../telemetry';
import { assertCanonicalEvidence, checkCanonicalEvidence } from '../canonical/evidence';
import { createXauusdMastraAgent } from './agent';
import { blockedStats, contextForRun, resolveXauusdMastraModel } from './context';
import { buildConversationToolEvidence } from './conversation-evidence';
import { extractToolPartsFromMessages, type MastraToolInvocationPart } from './legacy-tool-adapter';
import { blockedXauusdResearchText } from './report/report-text';
import type { RunXauusdMastraArgs } from './run-types';
import { xauusdMastraConversationToolNames } from './tools';

export interface XauusdMastraConversationStream {
  text: AsyncIterable<string>;
  completion: Promise<{
    result: MastraGenerationResultLike;
    packet: XauusdResearchPacket;
    modelId: string;
    providerId: string;
    bareModelId: string;
    stats: MastraGenerationStats;
    toolParts: MastraToolInvocationPart[];
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
      // §2.4: packet collection and memory/guardrail prep are independent —
      // overlap them so setup latency hides behind data collection.
      const [packet, runContext] = await Promise.all([
        collectXauusdResearchPacket(args.signal),
        prepareResearchRunContext({
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
          // Audit plan §1.9: conversation guardrails derive from the execution
          // plan's guardrail policy, exactly as the canonical path does, instead
          // of the legacy rewrite+availability conversation builder.
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
        }),
      ]);
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
          memoryMode: runContext.prepared.memoryDegraded ? 'degraded' : 'native',
          memoryBackfill: runContext.prepared.backfillAttempted,
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
            toolParts: [],
            totalCostUsd: 0,
            answerOutcome: 'blocked' as const,
            modelSnapshot: {
              providerId: resolution.providerId,
              bareModelId: resolution.bareModelId,
            },
            memoryMode: (runContext.prepared.memoryDegraded ? 'degraded' : 'native') as
              'native' | 'degraded',
            memoryBackfill: runContext.prepared.backfillAttempted,
          }),
        };
      }
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
      const toolPartsBuffer: MastraToolInvocationPart[] = [];
      const requestContext = contextForRun(args, packet);
      (requestContext as unknown as { set?: (k: string, v: unknown) => void }).set?.(
        'toolParts',
        toolPartsBuffer,
      );
      if (args.onToolEvent) {
        (requestContext as unknown as { set?: (k: string, v: unknown) => void }).set?.(
          'onToolEvent',
          args.onToolEvent,
        );
      }
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
          kind: args.telemetryKind ?? 'mastra_xauusd_research',
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
          const toolParts = extractToolPartsFromMessages(
            (full as unknown as { response?: { messages?: readonly unknown[] } }).response
              ?.messages,
            toolPartsBuffer,
          );
          const toolEvidence = buildConversationToolEvidence(packet, toolParts);
          const evidence = checkCanonicalEvidence(full.text, toolEvidence);
          assertCanonicalEvidence(evidence);
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
            toolParts,
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
