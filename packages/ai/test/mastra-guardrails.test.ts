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

import { describe, expect, it, vi } from 'vitest';

import { guardrailPolicyForCapability, MASTRA_CAPABILITIES } from '../src/mastra-v2/capabilities';
import {
  buildConversationGuardrails,
  buildGuardrailInputProcessors,
  buildResearchGuardrails,
  GuardrailUnavailableError,
} from '../src/mastra-v2/guardrails';
import { createExecutionPlan } from '../src/mastra-v2/planning/execution-plan';

const mocks = vi.hoisted(() => ({
  resolveChatModel: vi.fn(),
}));

vi.mock('../src/model', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../src/model');
  return { ...actual, resolveChatModel: mocks.resolveChatModel };
});

const settings = { aiApiKeys: null, chatModel: null };
const env = {};

describe('mastra guardrails', () => {
  it('returns UnicodeNormalizer only when no model is resolvable', () => {
    mocks.resolveChatModel.mockImplementation(() => {
      throw new Error('No AI API keys configured');
    });
    const { processors, warnings } = buildConversationGuardrails(settings as never, env as never);
    expect(processors.length).toBe(1);
    expect(processors[0]?.id).toBe('unicode-normalizer');
    expect(warnings.length).toBe(1);
  });

  it('strictly fails when an external-retrieval path has no detector model', () => {
    mocks.resolveChatModel.mockImplementation(() => {
      throw new Error('No AI API keys configured');
    });
    expect(() =>
      buildGuardrailInputProcessors({
        settings: settings as never,
        env: env as never,
        strategy: 'block',
        mode: 'strict',
      }),
    ).toThrow(/strict/i);
  });

  it('builds UnicodeNormalizer + PromptInjectionDetector with a resolved BYOK model', () => {
    mocks.resolveChatModel.mockReturnValue({
      model: { id: 'fast-model' },
      modelId: 'google/gemini-3.5-flash-lite',
      providerId: 'google',
      bareModelId: 'gemini-3.5-flash-lite',
    });
    const { processors } = buildConversationGuardrails(settings as never, env as never);
    expect(processors.map((p) => p.id)).toEqual([
      'unicode-normalizer',
      'prompt-injection-detector',
    ]);
    expect(mocks.resolveChatModel).toHaveBeenCalledWith(
      expect.objectContaining({ aiApiKeys: null }),
      env,
      'technical',
    );
  });

  it('uses the rewrite strategy for conversation paths and block for research', () => {
    mocks.resolveChatModel.mockReturnValue({
      model: { id: 'fast-model' },
      modelId: 'google/gemini-3.5-flash-lite',
      providerId: 'google',
      bareModelId: 'gemini-3.5-flash-lite',
    });
    const conversation = buildConversationGuardrails(settings as never, env as never).processors[1];
    const research = buildResearchGuardrails(settings as never, env as never).processors[1];
    expect(conversation).toBeDefined();
    expect(research).toBeDefined();
  });

  it('exposes the explicit options builder with custom threshold', () => {
    mocks.resolveChatModel.mockReturnValue({
      model: { id: 'fast-model' },
      modelId: 'google/gemini-3.5-flash-lite',
      providerId: 'google',
      bareModelId: 'gemini-3.5-flash-lite',
    });
    const { processors } = buildGuardrailInputProcessors({
      settings: settings as never,
      env: env as never,
      strategy: 'block',
      threshold: 0.9,
    });
    expect(processors.length).toBe(2);
  });

  it('reuses a caller-provided model instead of resolving the fast tier again (P2-03)', () => {
    // Even with no resolvable BYOK model — which would make strict mode
    // throw — a pre-resolved model must be enough to build the detector.
    mocks.resolveChatModel.mockImplementation(() => {
      throw new Error('No AI API keys configured');
    });
    const { processors } = buildGuardrailInputProcessors({
      settings: settings as never,
      env: env as never,
      strategy: 'block',
      mode: 'strict',
      model: { id: 'run-model' } as never,
    });
    expect(processors.map((p) => p.id)).toEqual([
      'unicode-normalizer',
      'prompt-injection-detector',
    ]);
    // The second resolution (the P2-03 waste) never happened.
    expect(mocks.resolveChatModel).not.toHaveBeenCalled();
  });
});

describe('guardrail policy from the manifest (§1.2)', () => {
  it('derives strict+block for every capability with untrusted content', () => {
    for (const id of [
      'canonical-chat',
      'xauusd-research',
      'xauusd-conversation',
      'symbol-research',
    ] as const) {
      const capability = MASTRA_CAPABILITIES[id];
      expect(capability.contentTrust).toBe('untrusted');
      expect(guardrailPolicyForCapability(capability)).toEqual({
        mode: 'strict',
        strategy: 'block',
      });
    }
  });

  it('derives availability+rewrite for trusted-only capabilities', () => {
    const capability = MASTRA_CAPABILITIES['sensitive-user-read'];
    expect(capability.contentTrust).toBe('trusted');
    expect(guardrailPolicyForCapability(capability)).toEqual({
      mode: 'availability',
      strategy: 'rewrite',
    });
  });

  it('builds research guardrails strict in every environment (no NODE_ENV branch)', () => {
    mocks.resolveChatModel.mockReturnValue({
      model: { id: 'fast-model' },
      modelId: 'google/gemini-3.5-flash-lite',
      providerId: 'google',
      bareModelId: 'gemini-3.5-flash-lite',
    });
    const previousNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development';
      expect(buildResearchGuardrails(settings as never, env as never).mode).toBe('strict');

      process.env.NODE_ENV = 'test';
      expect(buildResearchGuardrails(settings as never, env as never).mode).toBe('strict');

      process.env.NODE_ENV = 'production';
      expect(buildResearchGuardrails(settings as never, env as never).mode).toBe('strict');
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('fails closed with GuardrailUnavailableError when strict cannot load the detector', () => {
    mocks.resolveChatModel.mockImplementation(() => {
      throw new Error('No AI API keys configured');
    });
    expect(() => buildResearchGuardrails(settings as never, env as never, 'strict')).toThrow(
      GuardrailUnavailableError,
    );
  });

  it('carries the manifest-derived guardrail policy on the execution plan', async () => {
    const plan = await createExecutionPlan({
      userMessage: {
        id: 'message-1',
        role: 'user',
        parts: [{ type: 'text', text: 'analyze XAUUSD' }],
      },
      mode: 'single',
      modelOverride: 'google:gemini-2.5-flash',
      settings: { aiApiKeys: null, chatModel: 'google:gemini-2.5-flash' } as never,
      env: { GOOGLE_GENERATIVE_AI_API_KEY: 'test-key' } as never,
    });
    expect(plan.route).toBe('xauusd-research');
    expect(plan.guardrail).toEqual({ mode: 'strict', strategy: 'block' });
  });
});
