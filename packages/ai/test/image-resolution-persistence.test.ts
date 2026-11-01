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

// Audit 2026-10-31 (R7 follow-up) — the persistence guard.
//
// Mastra's memory saves the input messages it is given (drained as new user
// messages) and its pre-flight downloader fetches URL parts unless the model
// claims them. This test runs the real Memory + MessageList path to prove:
//   1. the provider sees inline bytes (the middleware resolved the reference);
//   2. nothing persisted contains those bytes — the reference URL survives
//      verbatim in Mastra storage.
//
// If anyone moves resolution earlier (into the message list, before the
// provider call), assertion 2 fails.

import { Agent } from '@mastra/core/agent';
import { LibSQLStore } from '@mastra/libsql';
import { Memory } from '@mastra/memory';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';

import { withImageResolution } from '../src/media/image-model-middleware';

const ENV = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

const STORAGE_PATH = 'user-1/2026-11-01/ab12cd34ef56-chart.png';
const PROXY_URL = `https://app.example.com/api/uploads/${STORAGE_PATH}`;
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_BASE64 = Buffer.from(PNG_BYTES).toString('base64');

/** Fails if anything persisted contains inline image bytes. */
function expectNoPersistedInlineImages(persisted: unknown): void {
  const serialized = JSON.stringify(persisted);
  expect(serialized).not.toContain('data:image');
  expect(serialized).not.toContain(PNG_BASE64);
  expect(serialized).not.toMatch(/;\s*base64,/);
}

function pngResponse(): Response {
  return new Response(PNG_BYTES, { status: 200, headers: { 'content-type': 'image/png' } });
}

const MOCK_GENERATE_RESULT = {
  content: [{ type: 'text' as const, text: 'ok' }],
  finishReason: { unified: 'stop' as const, raw: 'stop' },
  usage: {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  },
  warnings: [],
};

describe('chat-image resolution never persists bytes (R7 follow-up)', () => {
  it('inlines for the provider but keeps the reference in Mastra memory', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(pngResponse());
    const inner = new MockLanguageModelV4({
      provider: 'mock',
      modelId: 'mock-1',
      doGenerate: MOCK_GENERATE_RESULT,
    });
    const model = withImageResolution(inner, { env: ENV, fetchImpl });
    const memory = new Memory({
      storage: new LibSQLStore({ id: 'kestrel-r7-guard', url: ':memory:' }),
      options: { lastMessages: 20 },
    });
    const agent = new Agent({
      id: 'r7-guard-agent',
      name: 'r7-guard-agent',
      instructions: 'guard',
      model: model as never,
      memory,
    });

    await agent.generate(
      [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'what is this chart?' },
            {
              type: 'file',
              mediaType: 'image/png',
              data: { type: 'url', url: new URL(PROXY_URL) },
            },
          ],
        },
      ] as never,
      { memory: { thread: { id: 'thread-r7' }, resource: 'user-1' } as never },
    );

    // 1. The provider saw the bytes, not an unfetchable URL.
    const providerPrompt = JSON.stringify(inner.doGenerateCalls[0]!.prompt);
    expect(providerPrompt).toContain(PNG_BASE64);
    expect(providerPrompt).not.toContain(PROXY_URL);

    // 2. The guard: Mastra persisted only the reference.
    const recalled = await memory.recall({
      threadId: 'thread-r7',
      resourceId: 'user-1',
      perPage: 20,
    });
    expect(JSON.stringify(recalled.messages)).toContain(PROXY_URL);
    expectNoPersistedInlineImages(recalled.messages);
  });
});
