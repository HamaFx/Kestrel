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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BYOK_PROVIDERS,
  defaultModelFor,
  resolveChatModel,
  resolveEmbeddingModel,
  resolveModel,
  resolveModelForProvider,
  resolveOverrideModel,
  resolveVisionModel,
  testProviderKey,
} from '../src/models/model';

vi.mock('server-only', () => ({}));

let byokPayload: Record<string, string> = {};
vi.mock('@kestrel/shared/encryption', () => ({
  PROVIDER_IDS: [
    'google',
    'anthropic',
    'openai',
    'groq',
    'mistral',
    'openrouter',
    'xai',
    'deepseek',
    'iamhc',
    'hcnsec',
  ],
  decryptByok: () => byokPayload,
  encryptByok: () => '',
  configuredProviders: (keys: Record<string, unknown>) => Object.keys(keys) as never[],
  __setByok: (p: Record<string, string>) => {
    byokPayload = p;
  },
}));

const mockLanguageModel = vi.fn(() => ({ modelId: 'mock-model' }));
vi.mock('@ai-sdk/google', () => ({
  google: vi.fn(() => mockLanguageModel()),
  createGoogle: vi.fn(() => (modelId: string) => ({ modelId })),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => (modelId: string) => ({ modelId })),
}));

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn(() => (modelId: string) => ({ modelId })),
}));

const generateTextMock = vi.fn();
vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
}));

vi.mock('@kestrel/db', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => Promise.resolve([]),
          limit: () => Promise.resolve([]),
        }),
      }),
    }),
  }),
  schema: {
    chatTelemetry: {},
    chatMessages: {},
  },
}));

const ENV = {
  AI_GATEWAY_API_KEY: '',
  GOOGLE_GENERATIVE_AI_API_KEY: '',
  AI_EMBEDDING_MODEL: '',
} as const;

const mod = await import('@kestrel/shared/encryption' as never);
const __setByok = (mod as { __setByok: (p: Record<string, string>) => void }).__setByok;

beforeEach(() => {
  __setByok({});
  generateTextMock.mockReset();
});

describe('resolveModel — low-level model resolver', () => {
  it('returns string model id when AI_GATEWAY_API_KEY is set', () => {
    const env = { ...ENV, AI_GATEWAY_API_KEY: 'gw-key' };
    const result = resolveModel('openai/gpt-4o', env);
    expect(result).toBe('openai/gpt-4o');
  });

  it('returns LanguageModel for google/ prefix with GOOGLE_GENERATIVE_AI_API_KEY', () => {
    const env = { ...ENV, GOOGLE_GENERATIVE_AI_API_KEY: 'ai-key' };
    const result = resolveModel('google/gemini-2.5-flash', env);
    expect(result).not.toBeInstanceOf(String);
    expect(typeof result).toBe('object');
  });

  it('throws when google/ prefix is used without key or gateway', () => {
    expect(() => resolveModel('google/gemini-2.5-flash', ENV)).toThrow(
      /GOOGLE_GENERATIVE_AI_API_KEY is required/,
    );
  });

  it('throws when no transport is configured for the prefix', () => {
    expect(() => resolveModel('unknown/model', ENV)).toThrow(/Cannot resolve model/);
  });

  it('gateway takes priority over google/ prefix', () => {
    const env = {
      ...ENV,
      AI_GATEWAY_API_KEY: 'gw-key',
      GOOGLE_GENERATIVE_AI_API_KEY: 'ai-key',
    };
    const result = resolveModel('google/gemini-2.5-flash', env);
    expect(result).toBe('google/gemini-2.5-flash');
  });
});

describe('resolveOverrideModel', () => {
  // envFallbackKeys also reads common operator env vars (ANTHROPIC_API_KEY,
  // OPENAI_API_KEY, …). Blank them so "no key configured" cases are
  // deterministic on machines that export real keys.
  beforeEach(() => {
    for (const name of [
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'GROQ_API_KEY',
      'MISTRAL_API_KEY',
      'OPENROUTER_API_KEY',
      'XAI_API_KEY',
      'DEEPSEEK_API_KEY',
      'IAMHC_API_KEY',
      'HCNSEC_API_KEY',
    ]) {
      vi.stubEnv(name, '');
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ['an empty override', ''],
    ['a gateway-style slash id', 'openai/gpt-4o'],
    ['an unknown provider id', 'mystery-provider'],
    ['a known provider with no BYOK or env key', 'anthropic'],
    [
      'a known provider + explicit model with no BYOK or env key',
      'anthropic:claude-sonnet-4-20250514',
    ],
  ])('returns null for %s', (_label, override) => {
    const result = resolveOverrideModel({
      override,
      userSettings: { aiApiKeys: null },
      env: ENV,
    });
    expect(result).toBeNull();
  });

  it('falls back to operator env keys for a provider-only override', () => {
    const env = { ...ENV, GOOGLE_GENERATIVE_AI_API_KEY: 'env-key-1234567890' };
    const result = resolveOverrideModel({
      override: 'google',
      userSettings: { aiApiKeys: null },
      env,
    });
    expect(result).not.toBeNull();
    expect(result?.providerId).toBe('google');
    // modelId is the registry-prefixed form: "google/<model>"
    expect(result?.modelId.startsWith('google/')).toBe(true);
  });

  it('honours an explicit model id in a provider:model override', () => {
    const env = { ...ENV, GOOGLE_GENERATIVE_AI_API_KEY: 'env-key-1234567890' };
    const result = resolveOverrideModel({
      override: 'google:gemini-2.5-pro',
      userSettings: { aiApiKeys: null },
      env,
    });
    expect(result).not.toBeNull();
    expect(result?.providerId).toBe('google');
    expect(result?.modelId).toBe('google/gemini-2.5-pro');
  });

  it('prefers the stored BYOK key over operator env keys', () => {
    __setByok({ anthropic: 'sk-ant-stored-key' });
    const env = { ...ENV, GOOGLE_GENERATIVE_AI_API_KEY: 'env-key-1234567890' };
    const result = resolveOverrideModel({
      override: 'anthropic',
      userSettings: { aiApiKeys: null },
      env,
    });
    expect(result?.providerId).toBe('anthropic');
  });
});

describe('resolveModelForProvider', () => {
  it('returns ChatModelResolution for google provider with key', () => {
    __setByok({ google: 'a'.repeat(40) });
    const result = resolveModelForProvider('google', { aiApiKeys: null }, ENV);
    expect(result.providerId).toBe('google');
    expect(result.bareModelId).toBe(BYOK_PROVIDERS.google.defaultModels.technical);
    expect(result.modelId).toBe(`google/${BYOK_PROVIDERS.google.defaultModels.technical}`);
    expect(result.model).toBeDefined();
  });

  it('returns ChatModelResolution for anthropic provider with key', () => {
    __setByok({ anthropic: 'sk-ant-test-key' });
    const result = resolveModelForProvider('anthropic', { aiApiKeys: null }, ENV);
    expect(result.providerId).toBe('anthropic');
    expect(result.bareModelId).toBe(BYOK_PROVIDERS.anthropic.defaultModels.technical);
    expect(result.modelId).toBe(`anthropic/${BYOK_PROVIDERS.anthropic.defaultModels.technical}`);
  });

  it('uses an explicitly requested model instead of the technical default', () => {
    __setByok({ google: 'a'.repeat(40) });
    const requestedModel = BYOK_PROVIDERS.google.defaultModels.summary;
    const result = resolveModelForProvider('google', { aiApiKeys: null }, ENV, requestedModel);
    expect(result.bareModelId).toBe(requestedModel);
    expect(result.modelId).toBe(`google/${requestedModel}`);
  });

  it('rejects an unknown explicitly requested model', () => {
    __setByok({ google: 'a'.repeat(40) });
    expect(() =>
      resolveModelForProvider('google', { aiApiKeys: null }, ENV, 'not-a-real-model'),
    ).toThrow(/Unknown model for provider google/);
  });

  it('throws when provider has no API key', () => {
    __setByok({ google: 'goog-key' });
    expect(() => resolveModelForProvider('anthropic', { aiApiKeys: null }, ENV)).toThrow(
      /No API key configured for provider: anthropic/,
    );
  });

  it('throws for unknown provider id', () => {
    __setByok({ google: 'goog-key' });
    __setByok({ nonexistent: 'some-key-that-is-long-enough-for-test' });
    expect(() => resolveModelForProvider('nonexistent' as never, { aiApiKeys: null }, ENV)).toThrow(
      /Unknown provider/,
    );
  });

  it('uses env fallback keys when BYOK is empty', () => {
    __setByok({});
    const env = { ...ENV, GOOGLE_GENERATIVE_AI_API_KEY: 'env-key' };
    const result = resolveModelForProvider('google', { aiApiKeys: null }, env);
    expect(result.providerId).toBe('google');
  });
});

describe('resolveChatModel — different providers', () => {
  it('returns google model when google key is configured', () => {
    __setByok({ google: 'a'.repeat(40) });
    const result = resolveChatModel({ aiApiKeys: null, chatModel: null }, ENV);
    expect(result.providerId).toBe('google');
  });

  it('returns anthropic model when only anthropic key is configured', () => {
    __setByok({ anthropic: 'sk-ant-key' });
    const result = resolveChatModel({ aiApiKeys: null, chatModel: null }, ENV);
    expect(result.providerId).toBe('anthropic');
  });

  it('returns openai model when only openai key is configured', () => {
    __setByok({ openai: 'sk-openai-key' });
    const result = resolveChatModel({ aiApiKeys: null, chatModel: null }, ENV);
    expect(result.providerId).toBe('openai');
  });

  it('uses env fallback GOOGLE_GENERATIVE_AI_API_KEY when no BYOK is set', () => {
    const env = { ...ENV, GOOGLE_GENERATIVE_AI_API_KEY: 'env-key' };
    const result = resolveChatModel({ aiApiKeys: null, chatModel: null }, env);
    expect(result.providerId).toBe('google');
  });

  it('throws when no keys are configured at all', () => {
    expect(() => resolveChatModel({ aiApiKeys: null, chatModel: null }, ENV)).toThrow(
      /No AI API keys configured/,
    );
  });

  it('honors explicit chatModel override when valid', () => {
    __setByok({ anthropic: 'sk-ant-key' });
    const result = resolveChatModel(
      { aiApiKeys: null, chatModel: 'anthropic:claude-sonnet-4-5' },
      ENV,
    );
    expect(result.providerId).toBe('anthropic');
    expect(result.bareModelId).toBe('claude-sonnet-4-5');
  });
});

describe('resolveVisionModel — vision-capable model', () => {
  it('returns vision model when anthropic is configured', () => {
    __setByok({ anthropic: 'sk-ant-test' });
    const result = resolveVisionModel({ aiApiKeys: null, visionModel: null }, ENV);
    expect(result.providerId).toBe('anthropic');
    expect(result.bareModelId).toBe(BYOK_PROVIDERS.anthropic.defaultModels.vision);
  });

  it('returns vision model when google is configured', () => {
    __setByok({ google: 'a'.repeat(40) });
    const result = resolveVisionModel({ aiApiKeys: null, visionModel: null }, ENV);
    expect(result.providerId).toBe('google');
    expect(result.bareModelId).toBe(BYOK_PROVIDERS.google.defaultModels.vision);
  });

  it('skips providers without vision capability (deepseek)', () => {
    __setByok({ deepseek: 'sk-ds-key', google: 'a'.repeat(40) });
    const result = resolveVisionModel({ aiApiKeys: null, visionModel: null }, ENV);
    expect(result.providerId).toBe('google');
  });

  it('honors userSettings.visionModel when valid', () => {
    __setByok({ google: 'a'.repeat(40) });
    const result = resolveVisionModel(
      {
        aiApiKeys: null,
        visionModel: 'google:gemini-2.5-pro',
      },
      ENV,
    );
    expect(result.providerId).toBe('google');
    expect(result.bareModelId).toBe('gemini-2.5-pro');
  });

  it('silently ignores an invalid user pick and falls back to the provider default', () => {
    __setByok({ google: 'a'.repeat(40) });
    const result = resolveVisionModel(
      {
        aiApiKeys: null,
        visionModel: 'google:nonexistent-model',
      },
      ENV,
    );
    expect(result.providerId).toBe('google');
    expect(result.bareModelId).toBe(BYOK_PROVIDERS.google.defaultModels.vision);
  });

  it('throws when no vision-capable provider is configured', () => {
    expect(() => resolveVisionModel({ aiApiKeys: null, visionModel: null }, ENV)).toThrow(
      /No vision-capable model available/,
    );
  });
});

describe('resolveEmbeddingModel — embedding model', () => {
  it('returns google embedding model when google is configured', () => {
    __setByok({ google: 'a'.repeat(40) });
    const result = resolveEmbeddingModel({ aiApiKeys: null, embeddingModel: null }, ENV);
    expect(result).toBe(`google/${BYOK_PROVIDERS.google.defaultModels.embedding}`);
  });

  it('returns openai embedding model when openai is configured', () => {
    __setByok({ openai: 'sk-openai' });
    const result = resolveEmbeddingModel({ aiApiKeys: null, embeddingModel: null }, ENV);
    expect(result).toMatch(/^openai\//);
  });

  it('returns env AI_EMBEDDING_MODEL when set', () => {
    const env = { ...ENV, AI_EMBEDDING_MODEL: 'custom/embedding-model' };
    const result = resolveEmbeddingModel({ aiApiKeys: null, embeddingModel: null }, env);
    expect(result).toBe('custom/embedding-model');
  });

  it('returns universal default when nothing is configured', () => {
    const result = resolveEmbeddingModel({ aiApiKeys: null, embeddingModel: null }, ENV);
    expect(result).toBe('openai/text-embedding-3-small');
  });

  it('skips providers without embedding capability (anthropic)', () => {
    __setByok({ anthropic: 'sk-ant', google: 'a'.repeat(40) });
    const result = resolveEmbeddingModel({ aiApiKeys: null, embeddingModel: null }, ENV);
    expect(result).toMatch(/^google\//);
  });

  it('honors userSettings.embeddingModel when valid', () => {
    __setByok({ google: 'a'.repeat(40) });
    const result = resolveEmbeddingModel(
      {
        aiApiKeys: null,
        embeddingModel: 'google:text-embedding-004',
      },
      ENV,
    );
    expect(result).toBe('google/text-embedding-004');
  });

  it('silently ignores an invalid user pick and falls back to the provider default', () => {
    __setByok({ google: 'a'.repeat(40) });
    const result = resolveEmbeddingModel(
      {
        aiApiKeys: null,
        embeddingModel: 'google:nonexistent-model',
      },
      ENV,
    );
    expect(result).toMatch(/^google\//);
  });
});

describe('testProviderKey — key validation', () => {
  it('rejects unknown provider with friendly message', async () => {
    const result = await testProviderKey('nonexistent' as never, 'some-key');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Unknown provider');
    }
  });

  it('rejects too-short key', async () => {
    const result = await testProviderKey('openai', 'ab');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('too short');
    }
  });

  it('rejects removed vertex provider id', async () => {
    const result = await testProviderKey('vertex' as never, 'some-key');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('removed');
    }
  });

  it('returns ok=false when generateText throws', async () => {
    const apiError = new Error('Provider API error: 401 Unauthorized') as Error & {
      statusCode?: number;
    };
    apiError.statusCode = 401;
    generateTextMock.mockRejectedValueOnce(apiError);

    const result = await testProviderKey('google', 'a'.repeat(40));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('401');
      expect(result.error.toLowerCase()).toContain('unauthorized');
    }
    expect(generateTextMock).toHaveBeenCalledOnce();
  });

  it('returns ok=false with a friendly message on plain network error', async () => {
    generateTextMock.mockRejectedValueOnce(new Error('fetch failed'));

    const result = await testProviderKey('groq', 'gsk-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Plain Error path — no statusCode → just the extracted message.
      expect(result.error).toContain('fetch failed');
    }
    expect(generateTextMock).toHaveBeenCalledOnce();
  });

  it('returns ok=true when generateText resolves', async () => {
    generateTextMock.mockResolvedValueOnce({ text: 'ok' });

    const result = await testProviderKey('openai', 'sk-abcdefghijklmnopqrstuvwxyz1234567890');
    expect(result.ok).toBe(true);
    expect(generateTextMock).toHaveBeenCalledOnce();

    // The prompt should be tiny (maxOutputTokens: 1) — confirm we asked for
    // the right shape, since the call is what's actually costing the user.
    const callArgs = generateTextMock.mock.calls[0]?.[0] as {
      prompt: string;
      maxOutputTokens: number;
    };
    expect(callArgs.maxOutputTokens).toBe(1);
    expect(typeof callArgs.prompt).toBe('string');
  });
});

describe('defaultModelFor', () => {
  it.each([
    ['groq', 'fundamental', 'llama-3.3-70b-versatile'],
    ['google', 'fundamental', BYOK_PROVIDERS.google.defaultModels.fundamental],
    ['anthropic', 'vision', BYOK_PROVIDERS.anthropic.defaultModels.vision],
    ['unknown', 'fundamental', null],
    ['deepseek', 'vision', null],
  ] as const)('resolves %s/%s to %s', (provider, domain, expected) => {
    expect(defaultModelFor(provider as never, domain as never)).toBe(expected);
  });
});
