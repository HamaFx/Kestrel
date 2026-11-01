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

// Audit 2026-10-31 (R7 follow-up) — canonical chat hands Mastra messages that
// it persists, so the history builders must keep the storage reference and
// never inline bytes. The bytes are added later, in the provider-boundary
// middleware (covered by image-model-middleware.test.ts and
// image-resolution-persistence.test.ts).

import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { latestUserModelMessages, messageHistory } from '../src/mastra-v2/agents/canonical/prompts';

const STORAGE_PATH = 'user-1/2026-11-01/ab12cd34ef56-chart.png';
const PROXY_URL = `https://app.example.com/api/uploads/${STORAGE_PATH}`;
const LEGACY_URL = `https://project.supabase.co/storage/v1/object/public/chat-images/${STORAGE_PATH}`;
const FOREIGN_URL = 'https://images.example.com/chart.png';

/** Fails if a message list carries inline image bytes. */
function expectNoInlineImages(value: unknown): void {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain('data:image');
  expect(serialized).not.toMatch(/;\s*base64,/);
}

function imageMessage(id: string, url: string): UIMessage {
  return {
    id,
    role: 'user',
    parts: [
      { type: 'file', url, mediaType: 'image/png', filename: 'chart.png' },
      { type: 'text', text: 'What is this chart doing?' },
    ],
  } as unknown as UIMessage;
}

describe('canonical chat keeps image references, not bytes (R7 follow-up)', () => {
  it('messageHistory passes the proxy reference through to the model messages', async () => {
    const messages = await messageHistory([], imageMessage('m1', PROXY_URL));

    expect(JSON.stringify(messages)).toContain(PROXY_URL);
    expectNoInlineImages(messages);
  });

  it('messageHistory keeps a legacy public URL as a reference', async () => {
    const messages = await messageHistory([], imageMessage('m1', LEGACY_URL));

    expect(JSON.stringify(messages)).toContain(LEGACY_URL);
    expectNoInlineImages(messages);
  });

  it('messageHistory keeps references across history and the latest turn', async () => {
    const messages = await messageHistory(
      [imageMessage('m-old', LEGACY_URL)],
      imageMessage('m-new', PROXY_URL),
    );

    const serialized = JSON.stringify(messages);
    expect(serialized).toContain(LEGACY_URL);
    expect(serialized).toContain(PROXY_URL);
    expectNoInlineImages(messages);
  });

  it('latestUserModelMessages keeps the reference for the native-memory path', async () => {
    const messages = await latestUserModelMessages(imageMessage('m1', PROXY_URL));

    expect(JSON.stringify(messages)).toContain(PROXY_URL);
    expectNoInlineImages(messages);
  });

  it('leaves foreign URLs untouched', async () => {
    const messages = await messageHistory([], imageMessage('m1', FOREIGN_URL));

    expect(JSON.stringify(messages)).toContain(FOREIGN_URL);
    expectNoInlineImages(messages);
  });
});
