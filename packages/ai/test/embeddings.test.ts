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

import { embedMany } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { embedTexts, vectorLiteral } from '../src/embeddings';
import { resolveEmbeddingModel } from '../src/model';

// Mock AI SDK embedMany before importing
vi.mock('ai', () => ({
  embedMany: vi.fn(),
}));

// Mock model resolver
vi.mock('../src/model', () => ({
  resolveEmbeddingModel: vi.fn(() => 'mocked-embedding-model'),
}));

describe('vectorLiteral', () => {
  it('formats a vector array as pgvector literal', () => {
    expect(vectorLiteral([1, 2, 3])).toBe('[1,2,3]');
  });

  it('handles floating point numbers', () => {
    expect(vectorLiteral([0.1, 0.5, 0.99])).toBe('[0.1,0.5,0.99]');
  });

  it('handles empty array', () => {
    expect(vectorLiteral([])).toBe('[]');
  });

  it('handles negative values', () => {
    expect(vectorLiteral([-0.5, 0, 0.5])).toBe('[-0.5,0,0.5]');
  });

  it('is readonly-safe (accepts readonly arrays)', () => {
    const vec: readonly number[] = [1, 2, 3];
    expect(vectorLiteral(vec)).toBe('[1,2,3]');
  });
});

describe('embedTexts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses default model when no args provided', async () => {
    vi.mocked(embedMany).mockResolvedValueOnce({
      embeddings: [[0.1, 0.2]],
      usage: { tokens: 10 },
    } as never);

    const result = await embedTexts({ texts: ['hello'] });

    expect(result.model).toBe('openai/text-embedding-3-small');
    expect(result.inputTokens).toBe(10);
    expect(result.embeddings).toEqual([[0.1, 0.2]]);
  });

  it('uses explicit model override', async () => {
    vi.mocked(embedMany).mockResolvedValueOnce({
      embeddings: [[0.5]],
      usage: { tokens: 5 },
    } as never);

    const result = await embedTexts({ texts: ['test'], model: 'custom-model' });

    expect(result.model).toBe('custom-model');
  });

  it('uses env.AI_EMBEDDING_MODEL when no userSettings or model', async () => {
    vi.mocked(embedMany).mockResolvedValueOnce({
      embeddings: [[0.1]],
      usage: { tokens: 3 },
    } as never);

    const result = await embedTexts({
      texts: ['test'],
      env: { AI_EMBEDDING_MODEL: 'env-embedding-model' } as never,
    });

    expect(result.model).toBe('env-embedding-model');
  });

  it('passes abortSignal when signal is provided', async () => {
    const ac = new AbortController();
    vi.mocked(embedMany).mockResolvedValueOnce({
      embeddings: [[0.1]],
      usage: { tokens: 3 },
    } as never);

    await embedTexts({ texts: ['test'], signal: ac.signal });

    expect(vi.mocked(embedMany).mock.calls[0]?.[0]?.abortSignal).toBe(ac.signal);
  });

  it('resolves model from userSettings', async () => {
    vi.mocked(embedMany).mockResolvedValueOnce({
      embeddings: [[0.1]],
      usage: { tokens: 3 },
    } as never);

    const result = await embedTexts({
      texts: ['test'],
      userSettings: { aiApiKeys: null, embeddingModel: 'user-model' } as never,
    });

    expect(result.model).toBe('mocked-embedding-model');
    expect(resolveEmbeddingModel).toHaveBeenCalled();
  });
});
