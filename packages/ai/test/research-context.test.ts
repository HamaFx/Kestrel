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

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prepareResearchRunContext } from '../src/mastra-v2/research-context';

const mocks = vi.hoisted(() => ({
  createKestrelMemory: vi.fn(() => ({ id: 'test-memory' })),
  prepareKestrelMemory: vi.fn(async ({ memory }: { memory: { id: string } }) => ({
    memory,
    callOptions: { threadId: 'thread-1' },
    threadId: 'thread-1',
  })),
  buildConversationGuardrails: vi.fn(() => ({ processors: ['conv-guardrail'] })),
  buildResearchGuardrails: vi.fn(() => ({ processors: ['research-guardrail'] })),
  buildConversationScorers: vi.fn(() => ({ entries: ['conv-scorer'] })),
  buildResearchScorers: vi.fn(() => ({ entries: ['research-scorer'] })),
}));

vi.mock('../src/mastra-v2/memory', () => ({
  createKestrelMemory: mocks.createKestrelMemory,
}));
vi.mock('../src/mastra-v2/context', () => ({
  prepareKestrelMemory: mocks.prepareKestrelMemory,
}));
vi.mock('../src/mastra-v2/guardrails', () => ({
  buildConversationGuardrails: mocks.buildConversationGuardrails,
  buildResearchGuardrails: mocks.buildResearchGuardrails,
}));
vi.mock('../src/mastra-v2/evals/scorers', () => ({
  buildConversationScorers: mocks.buildConversationScorers,
  buildResearchScorers: mocks.buildResearchScorers,
}));

const baseArgs = {
  userId: 'user-1',
  threadId: 'thread-1',
  settings: { aiApiKeys: null, chatModel: null },
  env: {},
} as Parameters<typeof prepareResearchRunContext>[0];

describe('prepareResearchRunContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prepares memory and call options regardless of policy flags', async () => {
    const ctx = await prepareResearchRunContext(baseArgs);

    expect(mocks.createKestrelMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: { aiApiKeys: null, embeddingModel: null },
      }),
    );
    expect(mocks.prepareKestrelMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        threadId: 'thread-1',
        backfill: true,
      }),
    );
    expect(ctx.memory).toEqual({ id: 'test-memory' });
    expect(ctx.prepared.callOptions).toEqual({ threadId: 'thread-1' });
    // No policies requested => no guardrail/scorer builders run.
    expect(ctx.conversation).toBeNull();
    expect(ctx.research).toBeNull();
    expect(mocks.buildConversationGuardrails).not.toHaveBeenCalled();
    expect(mocks.buildResearchGuardrails).not.toHaveBeenCalled();
  });

  it('builds only the conversation policy set when requested', async () => {
    const ctx = await prepareResearchRunContext({
      ...baseArgs,
      includeConversationPolicies: true,
    });

    expect(ctx.conversation).toEqual({
      guardrails: { processors: ['conv-guardrail'] },
      scorers: { entries: ['conv-scorer'] },
    });
    expect(ctx.research).toBeNull();
    expect(mocks.buildConversationGuardrails).toHaveBeenCalledWith(
      { aiApiKeys: null, chatModel: null },
      baseArgs.env,
    );
    expect(mocks.buildResearchGuardrails).not.toHaveBeenCalled();
  });

  it('builds only the research policy set when requested', async () => {
    const ctx = await prepareResearchRunContext({
      ...baseArgs,
      includeResearchPolicies: true,
    });

    expect(ctx.research).toEqual({
      guardrails: { processors: ['research-guardrail'] },
      scorers: { entries: ['research-scorer'] },
    });
    expect(ctx.conversation).toBeNull();
    expect(mocks.buildResearchGuardrails).toHaveBeenCalledWith(
      { aiApiKeys: null, chatModel: null },
      baseArgs.env,
    );
    expect(mocks.buildConversationGuardrails).not.toHaveBeenCalled();
  });

  it('builds both policy sets when both are requested (report + followup path)', async () => {
    const ctx = await prepareResearchRunContext({
      ...baseArgs,
      includeConversationPolicies: true,
      includeResearchPolicies: true,
    });

    expect(ctx.conversation?.guardrails).toEqual({ processors: ['conv-guardrail'] });
    expect(ctx.research?.scorers).toEqual({ entries: ['research-scorer'] });
  });

  it('forwards the memory backfill idempotency exclusion key', async () => {
    await prepareResearchRunContext({
      ...baseArgs,
      backfillExcludeMessageIdempotencyKey: 'ui:msg-1',
    });

    expect(mocks.prepareKestrelMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        excludeMessageIdempotencyKey: 'ui:msg-1',
      }),
    );
  });

  it('passes only model-visible preferences into working-memory preparation', async () => {
    await prepareResearchRunContext({
      ...baseArgs,
      settings: {
        aiApiKeys: 'encrypted-key',
        chatModel: 'google:gemini-2.5-flash',
        embeddingModel: 'openai:text-embedding-3-small',
        defaultSymbol: 'EURUSD',
        language: 'ar',
        timezone: 'Asia/Riyadh',
      },
    });

    expect(mocks.createKestrelMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: {
          aiApiKeys: 'encrypted-key',
          embeddingModel: 'openai:text-embedding-3-small',
        },
      }),
    );
    expect(mocks.prepareKestrelMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: { defaultSymbol: 'EURUSD', language: 'ar', timezone: 'Asia/Riyadh' },
      }),
    );
    const preparation = mocks.prepareKestrelMemory.mock.calls.at(-1)?.[0] as {
      settings?: Record<string, unknown>;
    };
    expect(preparation.settings).not.toHaveProperty('chatModel');
    expect(preparation.settings).not.toHaveProperty('embeddingModel');
  });
});
