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

// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { mastraChatResponse } from '@/lib/services/mastra-chat-response';

describe('mastraChatResponse', () => {
  it('emits non-transient report metadata for immediate and reload-safe rendering', async () => {
    const response = mastraChatResponse({
      messageId: 'message-1',
      text: 'Grounded gold analysis',
      runId: 'run-1',
      modelId: 'mistral-small-latest',
      providerId: 'mistral',
      researchStatus: 'ready',
      dataQuality: 'partial',
      packetId: 'packet-1',
      observedCost: 0.001,
      report: null,
    });

    const body = await response.text();
    const events = body
      .trim()
      .split('\n\n')
      .map((chunk) => JSON.parse(chunk.replace(/^data: /, '')) as Record<string, unknown>);
    const metadata = events.find((event) => event.type === 'data-multi-agent-meta');

    expect(metadata).toMatchObject({
      type: 'data-multi-agent-meta',
      id: 'message-1',
      data: {
        agent: 'mastra-xauusd',
        runId: 'run-1',
      },
    });
    expect(metadata).not.toHaveProperty('transient', true);
  });
});
