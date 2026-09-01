import { describe, expect, it } from 'vitest';

import { PERSISTENCE_OWNERSHIP, persistenceOwnerFor } from '../src/mastra';
import { resolveMastraExecutionModel } from '../src/model';

describe('P2 architecture contracts', () => {
  it('exposes explicit Drizzle/Mastra persistence ownership', () => {
    expect(persistenceOwnerFor('chat')).toBe('drizzle');
    expect(persistenceOwnerFor('workflow')).toBe('mastra');
    expect(persistenceOwnerFor('memory')).toBe('mastra');
    expect(PERSISTENCE_OWNERSHIP.projection.length).toBeGreaterThan(0);
  });

  it('returns an immutable-style model snapshot with the resolution', () => {
    const resolved = resolveMastraExecutionModel({
      purpose: 'canonical-chat',
      settings: { aiApiKeys: null, chatModel: null },
      env: {
        AI_DEFAULT_MODEL: 'google/gemini-3.6-flash',
        GOOGLE_GENERATIVE_AI_API_KEY: 'test-key',
      } as never,
      domain: 'technical',
    });

    expect(resolved.snapshot).toEqual({
      providerId: resolved.providerId,
      bareModelId: resolved.bareModelId,
    });
    expect(resolved.purpose).toBe('canonical-chat');
    expect(resolved.domain).toBe('technical');
  });
});
