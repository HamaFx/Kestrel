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

// One post-generation path for buffered and streaming canonical turns:
// evidence check, one bounded self-correction, cost accounting, terminal run
// telemetry, and the returned result shape.

import { metrics } from '@kestrel/shared';

import { estimateCostUsd } from '@ai/budget/cost';
import type { ChatModelResolution, FallbackPartPayload } from '@ai/models/model';
import type { GenerationLedger } from '@ai/persistence/generation-ledger';

import { getMastraGenerationStats, type MastraRunObservation } from '../../shared/telemetry';
import { extractToolPartsFromMessages } from '../../tools/tool-lifecycle';
import { attemptCanonicalSelfCorrection } from './correction';
import { assertCanonicalEvidence, checkCanonicalEvidence } from './evidence';
import { extractToolEvidence, extractToolNames, mergeToolEvidenceWithParts } from './tool-evidence';
import type {
  CanonicalChatSetup,
  MastraCanonicalChatResult,
  RunMastraCanonicalChatArgs,
} from './types';

type CanonicalTurnOutput = Parameters<typeof getMastraGenerationStats>[0] & {
  text: string;
  response?: { messages?: readonly unknown[] } | undefined;
};

export async function finalizeCanonicalTurn(args: {
  run: RunMastraCanonicalChatArgs;
  runId: string;
  startedAt: number;
  setup: CanonicalChatSetup;
  activeResolution: ChatModelResolution;
  generationLedger: GenerationLedger;
  output: CanonicalTurnOutput;
  fallbackParts: FallbackPartPayload[];
  outcome: MastraRunObservation['outcome'];
  finishRun: (observation: MastraRunObservation) => Promise<void>;
}): Promise<MastraCanonicalChatResult> {
  const {
    run,
    runId,
    startedAt,
    setup,
    activeResolution,
    generationLedger,
    output,
    fallbackParts,
    outcome,
    finishRun,
  } = args;
  let stats = getMastraGenerationStats(output);
  const initialToolParts = extractToolPartsFromMessages(
    output.response?.messages,
    setup.toolPartsBuffer,
  );
  let toolParts = initialToolParts;
  let toolNames = [
    ...new Set([
      ...extractToolNames(output.response?.messages),
      ...initialToolParts.map((part) => part.toolName),
    ]),
  ];
  const initialToolEvidence = mergeToolEvidenceWithParts(
    extractToolEvidence(output.response?.messages),
    initialToolParts,
  );
  let finalText = output.text;
  let evidence = checkCanonicalEvidence(finalText, initialToolEvidence);
  let repaired = false;

  if (!evidence.ok) {
    const correction = await attemptCanonicalSelfCorrection({
      agent: setup.agent,
      context: setup.context,
      requestContext: setup.requestContext,
      messages: setup.messages,
      draftText: finalText,
      initialFindings: evidence.findings,
      initialToolEvidence,
      initialToolNames: toolNames,
      toolPartsBuffer: initialToolParts,
      callMemory: setup.callMemory,
      ...(run.signal ? { signal: run.signal } : {}),
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
    activeResolution.modelId,
    stats.inputTokens,
    stats.outputTokens,
  );
  generationLedger.recordCost(`primary:${runId}`, 'primary', primaryCostUsd);
  const totalCostUsd = generationLedger.total();
  const totalLatencyMs = Date.now() - startedAt;
  const memoryMode = setup.memoryDegraded ? 'degraded' : 'native';

  if (!evidence.ok) {
    // §5.2: Q1 renamed the degraded-evidence outcome to a hard block.
    metrics.increment('canonical_evidence_blocked_total', {
      tags: {
        reason: evidence.findings.some((finding) => /without a market-data tool/.test(finding))
          ? 'no_tool'
          : 'ungrounded',
      },
    });
    await finishRun({
      userId: run.userId,
      threadId: run.threadId,
      runId,
      model: activeResolution.modelId,
      providerId: activeResolution.providerId,
      startedAt,
      ...stats,
      outcome: 'success',
      answerOutcome: 'blocked',
      memoryMode,
      memoryBackfill: setup.memoryBackfill,
      modelSnapshot: {
        providerId: activeResolution.providerId,
        bareModelId: activeResolution.bareModelId,
      },
      telemetryKind: 'mastra_canonical_chat',
    });
    assertCanonicalEvidence(evidence);
  }

  const answerOutcome = finalText.trim().length > 0 ? ('ready' as const) : ('degraded' as const);
  await finishRun({
    userId: run.userId,
    threadId: run.threadId,
    runId,
    model: activeResolution.modelId,
    providerId: activeResolution.providerId,
    startedAt,
    ...stats,
    outcome,
    answerOutcome,
    memoryMode,
    memoryBackfill: setup.memoryBackfill,
    modelSnapshot: {
      providerId: activeResolution.providerId,
      bareModelId: activeResolution.bareModelId,
    },
    telemetryKind: 'mastra_canonical_chat',
  });

  return {
    text: finalText.trim(),
    modelId: activeResolution.modelId,
    providerId: activeResolution.providerId,
    routing: setup.routing,
    stats,
    totalCostUsd,
    totalLatencyMs,
    toolNames,
    toolParts,
    evidence,
    answerOutcome,
    ...(repaired ? { repaired: true } : {}),
    ...(fallbackParts.length > 0 ? { fallbackParts } : {}),
    memoryMode,
    memoryBackfill: setup.memoryBackfill,
    modelSnapshot: {
      providerId: activeResolution.providerId,
      bareModelId: activeResolution.bareModelId,
    },
  };
}
