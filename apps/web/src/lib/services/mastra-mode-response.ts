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

import type { MastraModeResult } from '@kestrel/ai/mastra';
import { ChatStreamEventSchema } from '@kestrel/shared';

function encode(event: unknown): string {
  return `data: ${JSON.stringify(ChatStreamEventSchema.parse(event))}\n\n`;
}

export function mastraModeResponse(
  input: MastraModeResult & { runId: string; observedCost: number },
): Response {
  const messageId = input.messageId ?? crypto.randomUUID();
  const events = [
    { type: 'text-start', id: messageId },
    { type: 'text-delta', id: messageId, delta: input.finalText },
    {
      type: 'data-multi-agent-meta',
      id: messageId,
      data: {
        engine: 'mastra',
        runId: input.runId,
        mode: input.mode,
        symbol: input.symbol,
        packetId: input.packet.packetId,
        dataQuality: input.packet.dataQuality,
        observedCost: input.observedCost,
        totalLatencyMs: input.totalLatencyMs,
        agentOpinions: input.agentOpinions,
      },
    },
    { type: 'text-end', id: messageId },
    { type: 'turn-complete', id: messageId, status: 'persisted' },
  ];

  return new Response(events.map(encode).join(''), {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
