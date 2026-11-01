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

// Audit 2026-10-31 (R7 follow-up) — the durable full-analysis payload
// rehydrates the user's chat parts and appends them with `appendUserMessage`,
// so it must keep the storage reference. The bytes are produced later, at the
// provider boundary, by the image middleware on every model. This test fails
// if a persisted part ever contains a `data:` URL.

import { describe, expect, it, vi } from 'vitest';

import { userMessageFromPayload } from '../src/jobs/multi-agent-analysis/payload';

const STORAGE_PATH = 'user-1/2026-11-01/ab12cd34ef56-chart.png';
const PROXY_URL = `https://app.example.com/api/uploads/${STORAGE_PATH}`;
const LEGACY_URL = `https://project.supabase.co/storage/v1/object/public/chat-images/${STORAGE_PATH}`;
const FOREIGN_URL = 'https://images.example.com/chart.png';

function payloadWith(parts: unknown[]) {
  return {
    kind: 'full-analysis',
    version: 1,
    userId: 'user-1',
    threadId: 'thread-1',
    userMessageText: 'Analyse this chart deeply',
    userMessageParts: parts,
    idempotencyKey: 'full:thread-1:message-1',
    createdBy: 'user-1',
    createdAt: '2026-11-01T12:00:00.000Z',
    attemptCount: 1,
  } as never;
}

function imagePart(url: string) {
  return { type: 'file', url, mediaType: 'image/png', filename: 'chart.png' };
}

/** Fails if a message part carries inline image bytes. */
function expectNoInlineImages(parts: unknown): void {
  const serialized = JSON.stringify(parts);
  expect(serialized).not.toContain('data:image');
  expect(serialized).not.toContain(';base64,');
  expect(serialized).not.toContain('base64');
}

describe('userMessageFromPayload keeps image references (R7 follow-up)', () => {
  it('persists the owner-authorised proxy reference verbatim', () => {
    const message = userMessageFromPayload(
      payloadWith([imagePart(PROXY_URL), { type: 'text', text: 'Analyse this chart deeply' }]),
    );

    expect(JSON.stringify(message.parts)).toContain(PROXY_URL);
    expectNoInlineImages(message.parts);
  });

  it('persists a legacy public URL reference verbatim', () => {
    const message = userMessageFromPayload(payloadWith([imagePart(LEGACY_URL)]));

    expect(JSON.stringify(message.parts)).toContain(LEGACY_URL);
    expectNoInlineImages(message.parts);
  });

  it('leaves a foreign attachment reference for the provider', () => {
    const message = userMessageFromPayload(payloadWith([imagePart(FOREIGN_URL)]));

    expect(JSON.stringify(message.parts)).toContain(FOREIGN_URL);
    expectNoInlineImages(message.parts);
  });

  it('appends the prompt text when the payload carries only attachments', () => {
    const message = userMessageFromPayload(payloadWith([imagePart(PROXY_URL)]));

    expect(JSON.stringify(message.parts)).toContain('Analyse this chart deeply');
    expectNoInlineImages(message.parts);
  });

  it('does not fetch while rehydrating', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    userMessageFromPayload(payloadWith([imagePart(PROXY_URL)]));

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
