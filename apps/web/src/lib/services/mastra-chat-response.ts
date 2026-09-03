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

import type { XauusdResearchReport } from '@kestrel/ai/mastra';
import { ChatStreamEventSchema } from '@kestrel/shared';

import { createMastraChatMeta, type MastraChatMeta } from '@/lib/mastra-chat-meta';

interface MastraChatResponseInput {
  messageId: string;
  text: string;
  runId: string;
  modelId: string;
  providerId: string;
  report: XauusdResearchReport | null;
  researchStatus: MastraChatMeta['researchStatus'];
  dataQuality: MastraChatMeta['dataQuality'];
  packetId: string;
  observedCost: number;
  answerOutcome?: MastraChatMeta['answerOutcome'];
  modelSnapshot?: MastraChatMeta['modelSnapshot'];
  memoryMode: 'native' | 'degraded';
  memoryBackfill: boolean;
}

function encodeEvent(event: unknown): string {
  const parsed = ChatStreamEventSchema.parse(event);
  return `data: ${JSON.stringify(parsed)}\n\n`;
}

/**
 * Format a completed Mastra result using the same line-delimited SSE contract
 * consumed by the existing chat transport. The same metadata is also stored
 * as a validated UI part on the assistant message for reload-safe rendering.
 */
export function mastraChatResponse(input: MastraChatResponseInput): Response {
  const meta = createMastraChatMeta({
    runId: input.runId,
    modelId: input.modelId,
    providerId: input.providerId,
    researchStatus: input.researchStatus,
    dataQuality: input.dataQuality,
    packetId: input.packetId,
    observedCost: input.observedCost,
    report: input.report,
    executionOutcome: 'completed',
    answerOutcome: input.answerOutcome ?? (input.report ? 'ready' : 'blocked'),
    terminalReason: 'buffered-completed',
    memoryMode: input.memoryMode,
    memoryBackfill: input.memoryBackfill,
    modelSnapshot: input.modelSnapshot ?? {
      providerId: input.providerId,
      bareModelId: input.modelId.split('/').at(-1) ?? input.modelId,
    },
  });
  const events = [
    { type: 'text-start', id: input.messageId },
    { type: 'text-delta', id: input.messageId, delta: input.text },
    {
      type: 'data-multi-agent-meta',
      id: input.messageId,
      // This metadata is part of the user-visible report, not ephemeral
      // progress. Keeping it non-transient lets useChat attach it to the
      // assistant message so the Mastra card renders immediately and remains
      // available after a page reload from persisted history.
      data: meta,
    },
    { type: 'text-end', id: input.messageId },
    { type: 'turn-complete', id: input.messageId, status: 'persisted' },
  ];

  return new Response(events.map(encodeEvent).join(''), {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
