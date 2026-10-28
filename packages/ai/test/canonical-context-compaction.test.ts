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

// Phase 3 (Jev roadmap) — the canonical message window must keep the thread's
// opening setup/thesis (message 0) no matter how large the middle tool dumps
// grow, and must compact those dumps instead of dropping the anchor.

import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { messageHistory } from '../src/mastra-v2/agents/canonical/prompts';

describe('Anchor-preserving context compaction in messageHistory', () => {
  it('always retains the thread opening setup anchor (message 0) even when middle messages have huge tool payloads', async () => {
    const anchor: UIMessage = {
      id: 'msg-anchor',
      role: 'user',
      parts: [
        {
          type: 'text',
          text: 'ANCHOR THESIS: Looking to long XAUUSD at 2735 with invalidation at 2722.',
        },
      ],
    };
    const bloatedMiddle: UIMessage[] = Array.from({ length: 8 }, (_, i) => ({
      id: `msg-mid-${i}`,
      role: 'assistant',
      parts: [{ type: 'text', text: `Tool dump ${i}: ` + 'X'.repeat(12_000) }],
    }));
    const latest: UIMessage = {
      id: 'msg-latest',
      role: 'user',
      parts: [{ type: 'text', text: 'Does my original invalidation level still hold?' }],
    };

    const modelMessages = await messageHistory([anchor, ...bloatedMiddle], latest);
    const serialized = JSON.stringify(modelMessages);
    expect(serialized).toContain('ANCHOR THESIS: Looking to long XAUUSD at 2735');
    expect(serialized).toContain('Does my original invalidation level still hold?');
    expect(serialized.length).toBeLessThanOrEqual(65_000);
  });

  it('compacts an oversized opening anchor instead of letting it dominate the window', async () => {
    const anchor: UIMessage = {
      id: 'msg-anchor',
      role: 'user',
      parts: [{ type: 'text', text: 'ANCHOR: ' + 'Y'.repeat(80_000) }],
    };
    const latest: UIMessage = {
      id: 'msg-latest',
      role: 'user',
      parts: [{ type: 'text', text: 'Continue.' }],
    };

    const modelMessages = await messageHistory([anchor], latest);
    const serialized = JSON.stringify(modelMessages);
    expect(serialized).toContain('ANCHOR: ');
    expect(serialized).toContain('...[compacted tool/context output]');
    expect(serialized.length).toBeLessThanOrEqual(65_000);
  });

  it('retains the most recent six messages even when they exceed the tail budget', async () => {
    const anchor: UIMessage = {
      id: 'msg-anchor',
      role: 'user',
      parts: [{ type: 'text', text: 'Setup thesis anchor for this thread.' }],
    };
    const messages: UIMessage[] = Array.from({ length: 8 }, (_, i) => ({
      id: `msg-${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      parts: [{ type: 'text', text: `RECENT ${i}: ` + 'Z'.repeat(12_000) }],
    }));
    const latest = messages[messages.length - 1]!;

    const modelMessages = await messageHistory([anchor, ...messages], latest);
    const serialized = JSON.stringify(modelMessages);

    // The window may exceed the soft tail budget, but never by dropping the
    // thread anchor or any of the most recent six turns.
    expect(serialized).toContain('Setup thesis anchor for this thread.');
    expect(serialized).toContain('RECENT 7: ');
    expect(serialized).toContain('RECENT 2: ');
    expect(serialized).not.toContain('RECENT 0: ');
  });
});
