import { describe, expect, it } from 'vitest';

import { resolveMastraExecutionModel } from '../src/model';

describe('Mastra model resolution contract', () => {
  it('preserves purpose, domain, and provider snapshot', () => {
    const result = resolveMastraExecutionModel({
      purpose: 'worker',
      settings: { aiApiKeys: null, chatModel: null },
      env: {
        GOOGLE_GENERATIVE_AI_API_KEY: 'test-key',
        AI_DEFAULT_MODEL: 'google/gemini-3.6-flash',
      } as never,
      domain: 'summary',
    });

    expect(result.purpose).toBe('worker');
    expect(result.domain).toBe('summary');
    expect(result.snapshot).toEqual({
      providerId: result.providerId,
      bareModelId: result.bareModelId,
    });
    expect(result.modelId).toContain('/');
  });
});
