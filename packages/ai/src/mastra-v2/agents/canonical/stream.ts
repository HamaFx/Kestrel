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

// Token-streaming canonical chat turn.

import { metrics } from '@kestrel/shared';

import { estimateCostUsd } from '@ai/budget/cost';
import { createGenerationLedger } from '@ai/persistence/generation-ledger';
import { withRetry } from '@ai/runtime/retry';
import { withToolContext } from '@ai/runtime/tool-context';

import { manifestForCapability } from '../../capabilities';
import {
  beginMastraRun,
  createMastraRunFinalizer,
  getMastraGenerationStats,
  mastraOutcomeForError,
} from '../../shared/telemetry';
import { runTracingOptions } from '../../telemetry';
import { extractToolPartsFromMessages } from '../xauusd/legacy-tool-adapter';
import { attemptCanonicalSelfCorrection } from './correction';
import { assertCanonicalEvidence, checkCanonicalEvidence } from './evidence';
import { setupCanonicalChat } from './setup';
import { extractToolEvidence, extractToolNames, mergeToolEvidenceWithParts } from './tool-evidence';
import type { MastraCanonicalChatStream, RunMastraCanonicalChatArgs } from './types';

export async function runMastraCanonicalChatStream(
  args: RunMastraCanonicalChatArgs,
): Promise<MastraCanonicalChatStream> {
  const startedAt = Date.now();
  const setup = await setupCanonicalChat(args);
  const generationLedger = args.ledger ?? createGenerationLedger();
  const {
    runId,
    agent,
    routing,
    resolution,
    callMemory,
    requestContext,
    toolPartsBuffer,
    context,
    messages,
    scorers,
  } = setup;
  beginMastraRun({
    runId,
    threadId: args.threadId,
    model: resolution.modelId,
    providerId: resolution.providerId,
    telemetryKind: 'mastra_canonical_chat',
  });

  const output = await withToolContext(context, () =>
    withRetry(
      () =>
        agent.stream(messages, {
          requestContext,
          ...(callMemory ? { memory: callMemory } : {}),
          toolChoice: 'auto',
          maxSteps: Math.min(
            args.env.MAX_TOOL_ITERATIONS ?? manifestForCapability('canonical-chat').maxSteps,
            manifestForCapability('canonical-chat').maxSteps,
          ),
          ...(Object.keys(scorers.entries).length > 0 ? { scorers: scorers.entries } : {}),
          ...(args.signal ? { abortSignal: args.signal } : {}),
          tracingOptions: runTracingOptions({
            runId,
            userId: args.userId,
            threadId: args.threadId,
            kind: 'mastra_canonical_chat',
            capabilityId: 'canonical-chat',
            tags: ['chat'],
            memoryMode: setup.memoryDegraded ? 'degraded' : 'native',
            memoryBackfill: setup.memoryBackfill,
          }),
        }),
      { maxAttempts: 2, signal: args.signal },
    ),
  );

  const finishRun = createMastraRunFinalizer();

  async function* textIter(): AsyncIterable<string> {
    try {
      for await (const chunk of output.textStream) {
        if (args.signal?.aborted) {
          throw args.signal.reason ?? new DOMException('Aborted', 'AbortError');
        }
        yield chunk;
      }
    } catch (error) {
      await finishRun({
        userId: args.userId,
        threadId: args.threadId,
        runId,
        model: resolution.modelId,
        providerId: resolution.providerId,
        startedAt,
        inputTokens: 0,
        outputTokens: 0,
        toolCalls: 0,
        steps: 0,
        outcome: mastraOutcomeForError(error, args.signal),
        memoryMode: setup.memoryDegraded ? 'degraded' : 'native',
        memoryBackfill: setup.memoryBackfill,
        telemetryKind: 'mastra_canonical_chat',
        error,
      });
      throw error;
    }
  }

  const completion = (async () => {
    try {
      const full = await output.getFullOutput();
      let stats = getMastraGenerationStats(full);
      const initialToolParts = extractToolPartsFromMessages(
        full.response?.messages,
        toolPartsBuffer,
      );
      let toolParts = initialToolParts;
      let toolNames = [
        ...new Set([
          ...extractToolNames(full.response?.messages),
          ...initialToolParts.map((p) => p.toolName),
        ]),
      ];
      const initialToolEvidence = mergeToolEvidenceWithParts(
        extractToolEvidence(full.response?.messages),
        initialToolParts,
      );
      let finalText = full.text;
      let evidence = checkCanonicalEvidence(finalText, initialToolEvidence);
      let repaired = false;

      if (!evidence.ok) {
        const correction = await attemptCanonicalSelfCorrection({
          agent,
          context,
          requestContext,
          messages,
          draftText: finalText,
          initialFindings: evidence.findings,
          initialToolEvidence,
          initialToolNames: toolNames,
          toolPartsBuffer: initialToolParts,
          callMemory,
          ...(args.signal ? { signal: args.signal } : {}),
        });
        if (correction) {
          stats = {
            inputTokens: stats.inputTokens + correction.extraStats.inputTokens,
            outputTokens: stats.outputTokens + correction.extraStats.outputTokens,
            toolCalls: stats.toolCalls + correction.extraStats.toolCalls,
            steps: stats.steps + correction.extraStats.steps,
          };
          if (correction.repaired) {
            finalText = correction.text;
            evidence = correction.evidence;
            toolNames = correction.toolNames;
            toolParts = correction.toolParts;
            repaired = true;
          }
        }
      }

      const primaryCostUsd = estimateCostUsd(
        resolution.modelId,
        stats.inputTokens,
        stats.outputTokens,
      );
      generationLedger.recordCost(`primary:${runId}`, 'primary', primaryCostUsd);
      const totalCostUsd = generationLedger.total();
      const totalLatencyMs = Date.now() - startedAt;
      if (!evidence.ok) {
        // §5.2: Q1 renamed the degraded-evidence outcome to a hard block.
        metrics.increment('canonical_evidence_blocked_total', {
          tags: {
            reason: evidence.findings.some((f) => /without a market-data tool/.test(f))
              ? 'no_tool'
              : 'ungrounded',
          },
        });
        await finishRun({
          userId: args.userId,
          threadId: args.threadId,
          runId,
          model: resolution.modelId,
          providerId: resolution.providerId,
          startedAt,
          ...stats,
          outcome: 'success',
          answerOutcome: 'blocked',
          memoryMode: setup.memoryDegraded ? 'degraded' : 'native',
          memoryBackfill: setup.memoryBackfill,
          modelSnapshot: { providerId: resolution.providerId, bareModelId: resolution.bareModelId },
          telemetryKind: 'mastra_canonical_chat',
        });
        assertCanonicalEvidence(evidence);
      }
      await finishRun({
        userId: args.userId,
        threadId: args.threadId,
        runId,
        model: resolution.modelId,
        providerId: resolution.providerId,
        startedAt,
        ...stats,
        outcome: args.signal?.aborted
          ? mastraOutcomeForError(args.signal.reason, args.signal)
          : 'success',
        answerOutcome: finalText.trim().length > 0 ? ('ready' as const) : ('degraded' as const),
        memoryMode: setup.memoryDegraded ? 'degraded' : 'native',
        memoryBackfill: setup.memoryBackfill,
        modelSnapshot: { providerId: resolution.providerId, bareModelId: resolution.bareModelId },
        telemetryKind: 'mastra_canonical_chat',
      });
      return {
        text: finalText.trim(),
        stats,
        totalCostUsd,
        totalLatencyMs,
        toolNames,
        toolParts,
        evidence,
        routing,
        modelId: resolution.modelId,
        providerId: resolution.providerId,
        answerOutcome: finalText.trim().length > 0 ? ('ready' as const) : ('degraded' as const),
        ...(repaired ? { repaired: true } : {}),
        memoryMode: setup.memoryDegraded ? ('degraded' as const) : ('native' as const),
        memoryBackfill: setup.memoryBackfill,
        modelSnapshot: { providerId: resolution.providerId, bareModelId: resolution.bareModelId },
      };
    } catch (error) {
      await finishRun({
        userId: args.userId,
        threadId: args.threadId,
        runId,
        model: resolution.modelId,
        providerId: resolution.providerId,
        startedAt,
        inputTokens: 0,
        outputTokens: 0,
        toolCalls: 0,
        steps: 0,
        outcome: mastraOutcomeForError(error, args.signal),
        memoryMode: setup.memoryDegraded ? 'degraded' : 'native',
        memoryBackfill: setup.memoryBackfill,
        telemetryKind: 'mastra_canonical_chat',
        error,
      });
      throw error;
    }
  })();

  return { text: textIter(), completion };
}
