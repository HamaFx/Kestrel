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

// Audit 2026-10-31 (R7 follow-up) — the provider-boundary middleware is the
// only place a chat-image reference becomes bytes. It must inline Kestrel
// images, pass foreign/data URLs through, and degrade to the honest note.

import { PROVIDER_IDS } from '@kestrel/shared/byok';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';

import {
  createImageResolutionMiddleware,
  isKestrelImageUrlShape,
  withImageResolution,
} from '../src/media/image-model-middleware';
import { BYOK_PROVIDERS } from '../src/models/byok-providers';

const ENV = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

const STORAGE_PATH = 'user-1/2026-11-01/ab12cd34ef56-chart.png';
const PROXY_URL = `https://app.example.com/api/uploads/${STORAGE_PATH}`;
const LEGACY_URL = `https://project.supabase.co/storage/v1/object/public/chat-images/${STORAGE_PATH}`;
const FOREIGN_URL = 'https://images.example.com/chart.png';
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_BASE64 = Buffer.from(PNG_BYTES).toString('base64');
const UNAVAILABLE_TEXT = 'The attached image could not be loaded.';

const OBJECT_ENDPOINT = `https://project.supabase.co/storage/v1/object/authenticated/chat-images/${STORAGE_PATH}`;

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

function filePart(url: string): Record<string, unknown> {
  return {
    type: 'file',
    mediaType: 'image/png',
    filename: 'chart.png',
    data: { type: 'url', url: new URL(url) },
  };
}

function promptWith(part: Record<string, unknown>): unknown[] {
  return [{ role: 'user', content: [{ type: 'text', text: 'what is this?' }, part] }];
}

async function transform(
  middleware: ReturnType<typeof createImageResolutionMiddleware>,
  prompt: unknown[],
): Promise<unknown> {
  const params = { prompt } as never;
  const result = await middleware.transformParams!({
    params,
    type: 'stream',
    model: {} as never,
  });
  return result.prompt;
}

function contentOf(prompt: unknown): unknown[] {
  const messages = prompt as Array<{ content: unknown[] }>;
  return messages[0]!.content;
}

describe('isKestrelImageUrlShape (R7)', () => {
  it.each([
    [PROXY_URL, true],
    ['https://other.example.com/api/uploads/user-1/2026-11-01/x.png', true],
    [LEGACY_URL, true],
    [
      'https://project.supabase.co/storage/v1/object/authenticated/chat-images/user-1/2026-11-01/x.png',
      true,
    ],
    [
      'https://project.supabase.co/storage/v1/object/sign/chat-images/user-1/2026-11-01/x.png?token=abc',
      true,
    ],
    [FOREIGN_URL, false],
    ['data:image/png;base64,AAAA', false],
  ])('%s -> %s', (url, expected) => {
    expect(isKestrelImageUrlShape(url)).toBe(expected);
  });
});

describe('image resolution middleware (R7)', () => {
  it('claims Kestrel image URL shapes so Mastra hands them to the provider prompt', async () => {
    const middleware = createImageResolutionMiddleware({ env: ENV });
    const supported = await middleware.overrideSupportedUrls!({
      model: {
        supportedUrls: { 'application/pdf': [/^https:\/\/files\.example\.com\//] },
      } as never,
    });
    const patterns = [...(supported['image/*'] ?? []), ...(supported['image'] ?? [])];
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.some((pattern) => pattern.test(PROXY_URL))).toBe(true);
    expect(patterns.some((pattern) => pattern.test(LEGACY_URL))).toBe(true);
    expect(patterns.some((pattern) => pattern.test(FOREIGN_URL))).toBe(false);
    // Provider-native URL support is preserved, not replaced.
    expect(supported['application/pdf']).toEqual([/^https:\/\/files\.example\.com\//]);
  });

  it('inlines a proxy-URL attachment with the service-role key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(pngResponse());
    const middleware = createImageResolutionMiddleware({ env: ENV, fetchImpl });

    const resolved = await transform(middleware, promptWith(filePart(PROXY_URL)));

    expect(contentOf(resolved)).toEqual([
      { type: 'text', text: 'what is this?' },
      {
        type: 'file',
        mediaType: 'image/png',
        filename: 'chart.png',
        data: { type: 'data', data: PNG_BASE64 },
      },
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]![0]).toBe(OBJECT_ENDPOINT);
    expect(fetchImpl.mock.calls[0]![1]).toMatchObject({
      headers: { authorization: 'Bearer service-role-key' },
    });
  });

  it('inlines a legacy public Supabase URL the same way', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(pngResponse());
    const middleware = createImageResolutionMiddleware({ env: ENV, fetchImpl });

    const resolved = await transform(middleware, promptWith(filePart(LEGACY_URL)));

    expect(JSON.stringify(resolved)).toContain(PNG_BASE64);
    expect(JSON.stringify(resolved)).not.toContain(LEGACY_URL);
  });

  it('inlines a bare URL string in a file part (chart tool shape)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(pngResponse());
    const middleware = createImageResolutionMiddleware({ env: ENV, fetchImpl });

    const resolved = await transform(
      middleware,
      promptWith({ type: 'file', mediaType: 'image', data: PROXY_URL }),
    );

    expect(JSON.stringify(resolved)).toContain(PNG_BASE64);
  });

  it('degrades a failed load to the honest note, never the URL', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('storage down'));
    const middleware = createImageResolutionMiddleware({ env: ENV, fetchImpl });

    const resolved = await transform(middleware, promptWith(filePart(PROXY_URL)));

    expect(contentOf(resolved)).toEqual([
      { type: 'text', text: 'what is this?' },
      { type: 'text', text: UNAVAILABLE_TEXT },
    ]);
  });

  it('leaves foreign and already-inline URLs untouched without fetching', async () => {
    const fetchImpl = vi.fn();
    const middleware = createImageResolutionMiddleware({ env: ENV, fetchImpl });

    const foreign = await transform(middleware, promptWith(filePart(FOREIGN_URL)));
    const inline = await transform(middleware, promptWith(filePart('data:image/png;base64,AAAA')));

    expect(JSON.stringify(foreign)).toContain(FOREIGN_URL);
    expect(JSON.stringify(inline)).toContain('data:image/png;base64,AAAA');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns the same params object when nothing is a Kestrel reference', async () => {
    const fetchImpl = vi.fn();
    const middleware = createImageResolutionMiddleware({ env: ENV, fetchImpl });
    const params = { prompt: promptWith({ type: 'text', text: 'hi' }) } as never;

    const result = await middleware.transformParams!({
      params,
      type: 'generate',
      model: {} as never,
    });

    expect(result).toBe(params);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('dedupes a repeated reference through the middleware cache', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(pngResponse());
    const middleware = createImageResolutionMiddleware({ env: ENV, fetchImpl });
    const prompt = [
      { role: 'user', content: [filePart(PROXY_URL)] },
      { role: 'assistant', content: [{ type: 'text', text: 'earlier' }] },
      { role: 'user', content: [filePart(LEGACY_URL)] },
    ];

    await transform(middleware, prompt);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('withImageResolution (R7)', () => {
  it('wraps a language model so the inner model receives inline bytes', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(pngResponse());
    const inner = new MockLanguageModelV4({
      provider: 'mock',
      modelId: 'mock-1',
      doGenerate: MOCK_GENERATE_RESULT,
    });
    const model = withImageResolution(inner, { env: ENV, fetchImpl });

    await model.doGenerate({ prompt: promptWith(filePart(PROXY_URL)) } as never);

    const received = JSON.stringify(inner.doGenerateCalls[0]!.prompt);
    expect(received).toContain(PNG_BASE64);
    expect(received).not.toContain(PROXY_URL);
    expect(inner.provider).toBe('mock');
    expect(inner.modelId).toBe('mock-1');
  });

  it('passes string model ids through unchanged', () => {
    expect(withImageResolution('google/gemini-2.5-flash')).toBe('google/gemini-2.5-flash');
  });
});

describe('BYOK provider wiring (R7 follow-up)', () => {
  it('attaches the middleware to every provider model', async () => {
    for (const id of PROVIDER_IDS) {
      const spec = BYOK_PROVIDERS[id];
      const model = spec.factory('test-key')(spec.defaultModels.technical) as {
        supportedUrls: Record<string, RegExp[]> | PromiseLike<Record<string, RegExp[]>>;
      };
      const supported = await model.supportedUrls;
      const patterns = [...(supported['image/*'] ?? []), ...(supported['image'] ?? [])];
      expect(
        patterns.some((pattern) => pattern.test(PROXY_URL)),
        `provider ${id} is missing the image middleware`,
      ).toBe(true);
    }
  });
});
