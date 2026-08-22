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

import type { MastraCanonicalChatResult } from '@kestrel/ai/mastra';
import { ChatStreamEventSchema } from '@kestrel/shared';

export function mastraCanonicalResponse(
  input: MastraCanonicalChatResult & {
    runId: string;
    observedCost: number;
    messageId: string;
  },
): Response {
  const messageId = input.messageId || crypto.randomUUID();
  const events = [
    { type: 'text-start', id: messageId },
    { type: 'text-delta', id: messageId, delta: input.text },
    { type: 'text-end', id: messageId },
    {
      type: 'data-multi-agent-meta',
      id: messageId,
      data: {
        engine: 'mastra',
        canonical: true,
        runId: input.runId,
        routingDomain: input.routing.domain,
        modelId: input.modelId,
        providerId: input.providerId,
        observedCost: input.observedCost,
        totalLatencyMs: input.totalLatencyMs,
        toolNames: input.toolNames,
      },
    },
  ];
  return new Response(
    events
      .map((event) => `data: ${JSON.stringify(ChatStreamEventSchema.parse(event))}\n\n`)
      .join(''),
    {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    },
  );
}
