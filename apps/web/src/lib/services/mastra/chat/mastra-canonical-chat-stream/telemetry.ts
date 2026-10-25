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

// Telemetry + finish-metadata builders for the canonical Mastra stream.

import { CANONICAL_EVIDENCE_BLOCKED_MESSAGE } from '@kestrel/ai/mastra-v2';
import { MemoryDegradedPartSchema, type ChatStreamEvent } from '@kestrel/shared';
import type { UIMessage } from 'ai';
import type { z } from 'zod';

import type { CanonicalCompletion, CanonicalToolPart } from './tool-parts';

export type MemoryDegradedPart = z.infer<typeof MemoryDegradedPartSchema>;

export function buildMemoryDegradedPart(
  memoryMode: CanonicalCompletion['memoryMode'],
): MemoryDegradedPart | null {
  return memoryMode === 'degraded'
    ? MemoryDegradedPartSchema.parse({
        type: 'data-memory-degraded',
        reason: 'Thread memory was unavailable; answered without semantic recall.',
        createdAt: Date.now(),
      })
    : null;
}

export function buildCanonicalMetaData(
  completed: CanonicalCompletion,
  runId: string,
  observedCost: number,
) {
  return {
    engine: 'mastra',
    canonical: true,
    runId,
    routingDomain: completed.routing.domain,
    modelId: completed.modelId,
    providerId: completed.providerId,
    observedCost,
    totalCostUsd: observedCost,
    totalLatencyMs: completed.totalLatencyMs,
    toolNames: completed.toolNames,
    evidence: completed.evidence,
    executionOutcome: 'completed',
    answerOutcome: completed.answerOutcome,
    memoryMode: completed.memoryMode,
    memoryBackfill: completed.memoryBackfill,
    modelSnapshot: completed.modelSnapshot,
    terminalReason: 'stream-completed',
  };
}

export function buildCanonicalAssistantMessage(
  messageId: string,
  toolParts: CanonicalToolPart[],
  text: string,
  memoryDegradedPart: MemoryDegradedPart | null,
  metaData: ReturnType<typeof buildCanonicalMetaData>,
): UIMessage {
  return {
    id: messageId,
    role: 'assistant',
    parts: [
      ...(toolParts as unknown as UIMessage['parts']),
      { type: 'text', text },
      ...(memoryDegradedPart ? [memoryDegradedPart as unknown as UIMessage['parts'][number]] : []),
      {
        type: 'data-multi-agent-meta',
        data: metaData,
      } as UIMessage['parts'][number],
    ],
  };
}

/**
 * Phase 2 (Q10): evidence-blocked artifacts. The refusal text is only streamed
 * when nothing had streamed yet; otherwise `data-evidence-blocked` tells the
 * live UI to replace the unverified text cleanly.
 */
export function buildEvidenceBlockedArtifacts(
  messageId: string,
  runId: string,
  findings: readonly unknown[],
): { events: ChatStreamEvent[]; refusalMessage: UIMessage } {
  const events: ChatStreamEvent[] = [
    {
      type: 'data-evidence-blocked',
      id: messageId,
      data: { message: CANONICAL_EVIDENCE_BLOCKED_MESSAGE, repaired: false },
    },
  ];
  const refusalMetaData = {
    engine: 'mastra',
    canonical: true,
    runId,
    executionOutcome: 'completed',
    answerOutcome: 'blocked',
    evidence: { ok: false, findings: [...findings] },
    terminalReason: 'canonical-evidence-blocked',
  };
  events.push({
    type: 'data-multi-agent-meta',
    id: messageId,
    data: refusalMetaData,
  });
  const refusalMessage: UIMessage = {
    id: messageId,
    role: 'assistant',
    parts: [
      { type: 'text', text: CANONICAL_EVIDENCE_BLOCKED_MESSAGE },
      {
        type: 'data-multi-agent-meta',
        data: refusalMetaData,
      } as UIMessage['parts'][number],
    ],
  };
  return { events, refusalMessage };
}
