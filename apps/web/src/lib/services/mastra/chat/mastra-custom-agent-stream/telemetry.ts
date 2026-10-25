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

// Telemetry + finish-metadata builders for the custom-agent stream.

import type { CustomAgentDescriptor } from '@kestrel/ai/plugins';
import { MemoryDegradedPartSchema } from '@kestrel/shared';
import type { UIMessage } from 'ai';
import type { z } from 'zod';

import type { CustomAgentCompletion, CustomAgentToolPart } from './tool-events';

export type MemoryDegradedPart = z.infer<typeof MemoryDegradedPartSchema>;

export function buildMemoryDegradedPart(
  memoryMode: CustomAgentCompletion['memoryMode'],
): MemoryDegradedPart | null {
  return memoryMode === 'degraded'
    ? MemoryDegradedPartSchema.parse({
        type: 'data-memory-degraded',
        reason: 'Thread memory was unavailable; answered without semantic recall.',
        createdAt: Date.now(),
      })
    : null;
}

export function buildCustomAgentMetaData(
  descriptor: CustomAgentDescriptor,
  runId: string,
  completed: CustomAgentCompletion,
  observedCost: number,
) {
  return {
    engine: 'mastra',
    canonical: false,
    customAgent: {
      id: descriptor.agent.id,
      slug: descriptor.agent.slug,
      name: descriptor.agent.name,
      pluginId: descriptor.pluginId,
    },
    runId,
    modelId: completed.modelId,
    providerId: completed.providerId,
    observedCost,
    totalCostUsd: observedCost,
    totalLatencyMs: completed.totalLatencyMs,
    toolNames: completed.toolNames,
    executionOutcome: 'completed',
    answerOutcome: completed.text.length > 0 ? 'ready' : 'degraded',
    memoryMode: completed.memoryMode,
    memoryBackfill: completed.memoryBackfill,
    modelSnapshot: completed.modelSnapshot,
    terminalReason: 'stream-completed',
  };
}

export function buildCustomAssistantMessage(
  messageId: string,
  toolParts: CustomAgentToolPart[],
  text: string,
  memoryDegradedPart: MemoryDegradedPart | null,
  metaData: ReturnType<typeof buildCustomAgentMetaData>,
): UIMessage {
  return {
    id: messageId,
    role: 'assistant',
    parts: [
      ...(toolParts as unknown as UIMessage['parts']),
      { type: 'text', text },
      ...(memoryDegradedPart ? [memoryDegradedPart as unknown as UIMessage['parts'][number]] : []),
      { type: 'data-multi-agent-meta', data: metaData } as UIMessage['parts'][number],
    ],
  };
}
