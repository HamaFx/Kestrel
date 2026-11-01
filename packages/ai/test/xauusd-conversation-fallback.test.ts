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

// R14 — the XAUUSD streaming conversation previously had no retry and no
// failover. This pins both through the shared attempt helper.

import type { LanguageModel } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { openXauusdConversationStream } from '../src/mastra-v2/agents/xauusd/conversation-stream-attempt';
import type { ChatModelResolution } from '../src/models/model';

const mocks = vi.hoisted(() => ({
  candidates: [] as Array<{
    providerId: string;
    bareModelId: string;
    modelId: string;
    model: unknown;
  }>,
  failures: [] as string[],
}));

vi.mock('../src/models/circuit-breaker', () => ({
  isCircuitOpen: () => false,
  recordModelFailure: (modelId: string) => {
    mocks.failures.push(modelId);
    return false;
  },
  recordModelSuccess: () => undefined,
}));

vi.mock('../src/models/model', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../src/models/model');
  return { ...actual, resolveFallbackChain: () => mocks.candidates };
});

function resolution(modelId: string): ChatModelResolution {
  const slash = modelId.indexOf('/');
  return {
    model: { modelId } as unknown as LanguageModel,
    modelId,
    providerId: modelId.slice(0, slash) as ChatModelResolution['providerId'],
    bareModelId: modelId.slice(slash + 1),
  };
}

const RUN = { settings: {}, env: {} } as never;

describe('openXauusdConversationStream (R14)', () => {
  beforeEach(() => {
    mocks.candidates = [];
    mocks.failures = [];
  });

  it('retries the same model once before giving up on it', async () => {
    const stream = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('rate limited'), { statusCode: 429 }))
      .mockResolvedValue('recovered');

    const result = await openXauusdConversationStream({
      run: RUN,
      primary: resolution('google/gemini-2.5-flash'),
      stream,
    });

    expect(stream).toHaveBeenCalledTimes(2);
    expect(result.output).toBe('recovered');
    expect(result.resolution.modelId).toBe('google/gemini-2.5-flash');
    expect(result.fallbackParts).toEqual([]);
  });

  it('moves to the next configured model when the same-model retry also fails', async () => {
    mocks.candidates = [
      {
        providerId: 'anthropic',
        bareModelId: 'claude-sonnet-4',
        modelId: 'anthropic/claude-sonnet-4',
        model: { marker: 'fallback' },
      },
    ];
    const stream = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('rate limited'), { statusCode: 429 }))
      .mockRejectedValueOnce(Object.assign(new Error('rate limited'), { statusCode: 429 }))
      .mockResolvedValue('continued');

    const result = await openXauusdConversationStream({
      run: RUN,
      primary: resolution('google/gemini-2.5-flash'),
      stream,
    });

    expect(stream).toHaveBeenCalledTimes(3);
    expect(stream.mock.calls[2]![0]).toMatchObject({ modelId: 'anthropic/claude-sonnet-4' });
    expect(result.output).toBe('continued');
    expect(result.resolution.modelId).toBe('anthropic/claude-sonnet-4');
    expect(result.fallbackParts).toHaveLength(1);
    expect(mocks.failures).toEqual(['google/gemini-2.5-flash']);
  });

  it('does not fail over when an execution plan pinned the model', async () => {
    mocks.candidates = [
      {
        providerId: 'anthropic',
        bareModelId: 'claude-sonnet-4',
        modelId: 'anthropic/claude-sonnet-4',
        model: { marker: 'fallback' },
      },
    ];
    const stream = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('upstream'), { statusCode: 503 }));

    await expect(
      openXauusdConversationStream({
        run: { settings: {}, env: {}, executionPlan: { model: { providerId: 'google' } } } as never,
        primary: resolution('google/gemini-2.5-flash'),
        stream,
      }),
    ).rejects.toMatchObject({ statusCode: 503 });

    expect(stream).toHaveBeenCalledTimes(2);
    expect(stream.mock.calls.every((call) => call[0].modelId === 'google/gemini-2.5-flash')).toBe(
      true,
    );
  });

  it('stops immediately when the caller cancelled the turn', async () => {
    const controller = new AbortController();
    controller.abort(new DOMException('Aborted', 'AbortError'));
    const stream = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { statusCode: 429 }));

    await expect(
      openXauusdConversationStream({
        run: { settings: {}, env: {}, signal: controller.signal } as never,
        primary: resolution('google/gemini-2.5-flash'),
        stream,
      }),
    ).rejects.toBeInstanceOf(DOMException);

    expect(stream).not.toHaveBeenCalled();
  });
});
