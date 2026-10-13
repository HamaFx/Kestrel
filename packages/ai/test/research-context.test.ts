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
  buildGuardrailInputProcessors: vi.fn(
    (_options: {
      settings: { aiApiKeys: unknown; chatModel: unknown };
      env: unknown;
      strategy: 'block' | 'rewrite';
      mode: 'strict' | 'availability';
    }) => ({ processors: ['plan-guardrail'], warnings: [], mode: 'strict' }),
  ),
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
  // Audit plan §1.9: the run context derives every guardrail set from
  // `buildGuardrailInputProcessors` with the plan's strategy + mode.
  buildGuardrailInputProcessors: mocks.buildGuardrailInputProcessors,
  buildConversationGuardrails: vi.fn(() => ({
    processors: ['legacy-conversation-guardrail'],
  })),
  buildResearchGuardrails: vi.fn(() => ({ processors: ['legacy-research-guardrail'] })),
  buildResearchGuardrailsAvailability: vi.fn(),
  GuardrailUnavailableError: class GuardrailUnavailableError extends Error {},
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

const guardrailSettings = { aiApiKeys: null, chatModel: null };

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
    expect(mocks.buildGuardrailInputProcessors).not.toHaveBeenCalled();
  });

  it('builds only the conversation policy set when requested', async () => {
    const ctx = await prepareResearchRunContext({
      ...baseArgs,
      includeConversationPolicies: true,
    });

    expect(ctx.conversation).toEqual({
      guardrails: { processors: ['plan-guardrail'], warnings: [], mode: 'strict' },
      scorers: { entries: ['conv-scorer'] },
    });
    expect(ctx.research).toBeNull();
    // §1.9: without a plan the untrusted-capability manifest defaults apply
    // (block + strict), no longer the legacy rewrite+availability builder.
    expect(mocks.buildGuardrailInputProcessors).toHaveBeenCalledTimes(1);
    expect(mocks.buildGuardrailInputProcessors).toHaveBeenCalledWith({
      settings: guardrailSettings,
      env: baseArgs.env,
      strategy: 'block',
      mode: 'strict',
    });
  });

  it('builds only the research policy set when requested', async () => {
    const ctx = await prepareResearchRunContext({
      ...baseArgs,
      includeResearchPolicies: true,
    });

    expect(ctx.research).toEqual({
      guardrails: { processors: ['plan-guardrail'], warnings: [], mode: 'strict' },
      scorers: { entries: ['research-scorer'] },
    });
    expect(ctx.conversation).toBeNull();
    // §1.2: research guardrails default to strict (manifest-derived mode).
    expect(mocks.buildGuardrailInputProcessors).toHaveBeenCalledWith({
      settings: guardrailSettings,
      env: baseArgs.env,
      strategy: 'block',
      mode: 'strict',
    });
  });

  it('honors the legacy guardrailMode for research-only callers without a plan policy', async () => {
    // mode-runner (committee path) passes only `guardrailMode` today; its
    // behavior must be preserved when no full guardrailPolicy is provided.
    await prepareResearchRunContext({
      ...baseArgs,
      includeResearchPolicies: true,
      guardrailMode: 'availability',
    });

    expect(mocks.buildGuardrailInputProcessors).toHaveBeenCalledWith(
      expect.objectContaining({ strategy: 'block', mode: 'availability' }),
    );
  });

  it('derives conversation guardrails from the execution-plan policy (§1.9)', async () => {
    // xauusd-conversation: untrusted manifest → strict + block, exactly the
    // policy the canonical path derives from executionPlan.guardrail.
    const ctx = await prepareResearchRunContext({
      ...baseArgs,
      includeConversationPolicies: true,
      guardrailPolicy: { strategy: 'block', mode: 'strict' },
    });

    expect(ctx.conversation?.guardrails).toEqual({
      processors: ['plan-guardrail'],
      warnings: [],
      mode: 'strict',
    });
    expect(mocks.buildGuardrailInputProcessors).toHaveBeenCalledTimes(1);
    expect(mocks.buildGuardrailInputProcessors).toHaveBeenCalledWith({
      settings: guardrailSettings,
      env: baseArgs.env,
      strategy: 'block',
      mode: 'strict',
    });
  });

  it('derives both guardrail sets from one plan policy (report + followup path)', async () => {
    // The XAUUSD report path builds both sets from the single plan-derived
    // policy; the legacy conversation/research builders are no longer used.
    const ctx = await prepareResearchRunContext({
      ...baseArgs,
      includeConversationPolicies: true,
      includeResearchPolicies: true,
      guardrailPolicy: { strategy: 'block', mode: 'strict' },
    });

    expect(ctx.conversation?.guardrails).toEqual({
      processors: ['plan-guardrail'],
      warnings: [],
      mode: 'strict',
    });
    expect(ctx.research?.guardrails).toEqual({
      processors: ['plan-guardrail'],
      warnings: [],
      mode: 'strict',
    });
    expect(ctx.research?.scorers).toEqual({ entries: ['research-scorer'] });
    expect(mocks.buildGuardrailInputProcessors).toHaveBeenCalledTimes(2);
    for (const [options] of mocks.buildGuardrailInputProcessors.mock.calls) {
      expect(options).toEqual({
        settings: guardrailSettings,
        env: baseArgs.env,
        strategy: 'block',
        mode: 'strict',
      });
    }
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
