import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveMastraModel } from '../src/model-resolution';

const { resolveChatModel, resolveModelForProvider } = vi.hoisted(() => ({
  resolveChatModel: vi.fn((settings: { chatModel: string | null }) => ({
    model: { modelId: settings.chatModel ?? 'default' },
    modelId: settings.chatModel ?? 'google/gemini-2.5-flash',
    providerId: 'google' as const,
    bareModelId: settings.chatModel?.split(':').at(-1) ?? 'gemini-2.5-flash',
  })),
  resolveModelForProvider: vi.fn(() => ({
    model: { modelId: 'snapshot' },
    modelId: 'google/gemini-2.5-flash',
    providerId: 'google' as const,
    bareModelId: 'gemini-2.5-flash',
  })),
}));

vi.mock('../src/model-chat', () => ({ resolveChatModel, resolveModelForProvider }));

const settings = { aiApiKeys: null, chatModel: null };
const env = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.MASTRA_MODE_MODEL;
  delete process.env.MASTRA_WORKER_MODEL;
  delete process.env.MASTRA_XAUUSD_MODEL;
});

describe('resolveMastraModel', () => {
  it('uses an immutable snapshot for worker jobs', () => {
    const result = resolveMastraModel({
      purpose: 'worker',
      settings,
      env,
      domain: 'technical',
      snapshot: { providerId: 'google', bareModelId: 'gemini-2.5-flash' },
    });
    expect(resolveModelForProvider).toHaveBeenCalledWith(
      'google',
      settings,
      env,
      'gemini-2.5-flash',
      'technical',
    );
    expect(resolveChatModel).not.toHaveBeenCalled();
    expect(result.modelId).toBe('google/gemini-2.5-flash');
  });

  it('applies explicit overrides before operator pins', () => {
    process.env.MASTRA_MODE_MODEL = 'openai:gpt-4.1-mini';
    resolveMastraModel({
      purpose: 'mode',
      settings,
      env,
      domain: 'technical',
      modelOverride: 'google:gemini-2.5-flash',
    });
    expect(resolveChatModel).toHaveBeenCalledWith(
      { aiApiKeys: null, chatModel: 'google:gemini-2.5-flash' },
      env,
      'technical',
    );
  });

  it('rejects malformed overrides', () => {
    expect(() =>
      resolveMastraModel({
        purpose: 'canonical-chat',
        settings,
        env,
        domain: 'summary',
        modelOverride: 'not-qualified',
      }),
    ).toThrow(/provider:model/);
  });
});
