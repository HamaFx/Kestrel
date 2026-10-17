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

import type * as encryptionModule from '@kestrel/shared/encryption';
import { describe, expect, it, vi } from 'vitest';

import { buildByokEmbeddingModel } from '../src/byok-providers';
import { kestrelMemoryOptions } from '../src/mastra-v2/memory';
import { resolveEmbeddingModelDetails } from '../src/model-embedding';

vi.mock('@kestrel/shared/encryption', async (importOriginal) => {
  const actual = await importOriginal<typeof encryptionModule>();
  return {
    ...actual,
    decryptByok: (keys: unknown) => {
      if (typeof keys === 'object' && keys !== null) return keys;
      if (typeof keys === 'string') {
        try {
          return JSON.parse(keys);
        } catch {
          return null;
        }
      }
      return null;
    },
  };
});

describe('buildByokEmbeddingModel (P0-06)', () => {
  it('instantiates an embedding model for google', () => {
    const model = buildByokEmbeddingModel('google', 'google/gemini-embedding-001', 'AIzaTestKey');
    expect(model).toBeDefined();
    expect(typeof (model as { doEmbed?: unknown }).doEmbed).toBe('function');
  });

  it('instantiates an embedding model for openai', () => {
    const model = buildByokEmbeddingModel('openai', 'openai/text-embedding-3-small', 'sk-test-key');
    expect(model).toBeDefined();
    expect(typeof (model as { doEmbed?: unknown }).doEmbed).toBe('function');
  });

  it('instantiates an embedding model for mistral', () => {
    const model = buildByokEmbeddingModel('mistral', 'mistral/mistral-embed', 'test-mistral-key');
    expect(model).toBeDefined();
    expect(typeof (model as { doEmbed?: unknown }).doEmbed).toBe('function');
  });

  it('throws for unsupported embedding providers', () => {
    expect(() =>
      buildByokEmbeddingModel('anthropic' as never, 'anthropic/claude-3-5', 'sk-ant-test'),
    ).toThrow(/does not support direct text embeddings/);
  });
});

describe('resolveEmbeddingModelDetails (P0-06)', () => {
  it('instantiates direct BYOK model when user key is present', () => {
    const userSettings = {
      aiApiKeys: JSON.stringify({ google: 'AIzaGoogleKey123' }) as never,
      embeddingModel: 'google:gemini-embedding-001',
    };
    const resolved = resolveEmbeddingModelDetails(userSettings, {});
    expect(resolved.modelId).toBe('google/gemini-embedding-001');
    expect(typeof resolved.model).toBe('object');
    expect(typeof (resolved.model as { doEmbed?: unknown }).doEmbed).toBe('function');
  });

  it('falls back to string modelId when no provider key is available', () => {
    const userSettings = {
      aiApiKeys: null,
      embeddingModel: null,
    };
    const resolved = resolveEmbeddingModelDetails(userSettings, {});
    expect(resolved.modelId).toBe('openai/text-embedding-3-small');
    expect(resolved.model).toBe('openai/text-embedding-3-small');
  });
});

describe('kestrelMemoryOptions thread scoping (P0-07)', () => {
  it('scopes semanticRecall and observationalMemory strictly to thread while keeping workingMemory as resource', () => {
    const options = kestrelMemoryOptions({
      env: {} as never,
      forceObservationalMemory: true,
      semanticRecall: true,
    });

    expect(options.semanticRecall).toMatchObject({
      topK: 4,
      scope: 'thread',
    });
    expect(options.observationalMemory).toMatchObject({
      scope: 'thread',
    });
    expect(options.workingMemory).toMatchObject({
      enabled: true,
      scope: 'resource',
    });
  });
});
