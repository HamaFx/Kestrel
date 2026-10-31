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

// Buffered canonical chat turn.

import { metrics } from '@kestrel/shared';

import { estimateCostUsd } from '@ai/budget/cost';
import { getDiagnosticContext, withDiagnostics } from '@ai/diagnostics';
import { createGenerationLedger } from '@ai/persistence/generation-ledger';
import { withRetry } from '@ai/runtime/retry';
import { withToolContext } from '@ai/runtime/tool-context';

import { manifestForCapability } from '../../capabilities';
import {
  beginMastraRun,
  finishMastraRun,
  getMastraGenerationStats,
  mastraOutcomeForError,
} from '../../shared/telemetry';
import { runTracingOptions } from '../../telemetry';
import { extractToolPartsFromMessages } from '../xauusd/legacy-tool-adapter';
import { attemptCanonicalSelfCorrection } from './correction';
import { assertCanonicalEvidence, checkCanonicalEvidence } from './evidence';
import { setupCanonicalChat } from './setup';
import { extractToolEvidence, extractToolNames, mergeToolEvidenceWithParts } from './tool-evidence';
import type { MastraCanonicalChatResult, RunMastraCanonicalChatArgs } from './types';

export async function runMastraCanonicalChat(
  args: RunMastraCanonicalChatArgs,
): Promise<MastraCanonicalChatResult> {
  const runId = args.runId ?? crypto.randomUUID();
  // Phase 1 (observability roadmap) — the buffered canonical turn owns its
  // diagnostic scope so every turn writes a durable `diagnostic_traces` row
  // correlated by `traceId`/`runId`. A caller that already opened a scope
  // (e.g. an outer orchestration) reuses it instead of double-persisting.
  if (getDiagnosticContext()) return executeCanonicalChat(args, runId);
  return withDiagnostics(args.userId, args.threadId, () => executeCanonicalChat(args, runId), {
    traceId: runId,
    runId,
  });
}

async function executeCanonicalChat(
  args: RunMastraCanonicalChatArgs,
  runId: string,
): Promise<MastraCanonicalChatResult> {
  const startedAt = Date.now();
  const setup = await setupCanonicalChat({ ...args, runId });
  const generationLedger = args.ledger ?? createGenerationLedger();
  const {
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

  try {
    const result = await withToolContext(context, () =>
      withRetry(
        () =>
          agent.generate(messages, {
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
    let stats = getMastraGenerationStats(result);
    const initialToolParts = extractToolPartsFromMessages(
      result.response?.messages,
      toolPartsBuffer,
    );
    let toolParts = initialToolParts;
    let toolNames = [
      ...new Set([
        ...extractToolNames(result.response?.messages),
        ...initialToolParts.map((p) => p.toolName),
      ]),
    ];
    const initialToolEvidence = mergeToolEvidenceWithParts(
      extractToolEvidence(result.response?.messages),
      initialToolParts,
    );
    let finalText = result.text;
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
      await finishMastraRun({
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
    await finishMastraRun({
      userId: args.userId,
      threadId: args.threadId,
      runId,
      model: resolution.modelId,
      providerId: resolution.providerId,
      startedAt,
      ...stats,
      outcome: 'success',
      answerOutcome: finalText.trim().length > 0 ? ('ready' as const) : ('degraded' as const),
      memoryMode: setup.memoryDegraded ? 'degraded' : 'native',
      memoryBackfill: setup.memoryBackfill,
      modelSnapshot: { providerId: resolution.providerId, bareModelId: resolution.bareModelId },
      telemetryKind: 'mastra_canonical_chat',
    });
    return {
      text: finalText.trim(),
      modelId: resolution.modelId,
      providerId: resolution.providerId,
      routing,
      stats,
      totalCostUsd,
      totalLatencyMs,
      toolNames,
      toolParts,
      evidence,
      answerOutcome: finalText.trim().length > 0 ? ('ready' as const) : ('degraded' as const),
      ...(repaired ? { repaired: true } : {}),
      memoryMode: setup.memoryDegraded ? 'degraded' : 'native',
      memoryBackfill: setup.memoryBackfill,
      modelSnapshot: { providerId: resolution.providerId, bareModelId: resolution.bareModelId },
    };
  } catch (error) {
    await finishMastraRun({
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
