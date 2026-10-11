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

// Audit plan §3.1 (Q1: quality always) — per-committee-agent model
// resolution. Every configured pick is a user-chosen top-tier model; the
// resolver never downgrades to a cheaper tier, and unresolvable picks fall
// back to the run's primary model.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LanguageModel } from 'ai';

import { createCommitteeWorkflow } from '../src/committee/workflow';
import { RequestContext } from '@mastra/core/request-context';
import { committeeModelResolver } from '../src/mastra/mode-runner';

const mocks = vi.hoisted(() => ({
  collectSymbolResearchPacket: vi.fn(),
  /** Captured agent model ids by agent id. */
  agentModels: new Map<string, string>(),
}));

vi.mock('../src/mastra/symbol-research', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../src/mastra/symbol-research');
  return { ...actual, collectSymbolResearchPacket: mocks.collectSymbolResearchPacket };
});

vi.mock('@mastra/core/agent', () => ({
  Agent: class {
    readonly id: string;
    readonly modelId: string;

    constructor(options: { id: string; model: { modelId?: string } }) {
      this.id = options.id;
      this.modelId = options.model?.modelId ?? 'unknown';
      mocks.agentModels.set(options.id, this.modelId);
    }

    async generate(): Promise<unknown> {
      if (this.id.includes('decision')) {
        return { text: 'Synthesized read.', usage: { inputTokens: 20, outputTokens: 10 }, steps: [{}] };
      }
      if (this.id.includes('-critique')) {
        return {
          object: { confirms: true, revisedConfidence: 0.6, critique: `${this.id} agrees` },
          usage: { inputTokens: 8, outputTokens: 4 },
          steps: [{}],
        };
      }
      return {
        object: { bias: 'neutral', confidence: 0.6, reasoning: `${this.id} opinion`, details: {} },
        usage: { inputTokens: 10, outputTokens: 5 },
        steps: [{}],
      };
    }
  },
}));

const readyPacket = {
  packetId: 'packet-1',
  kind: 'symbol_research_packet' as const,
  symbol: 'EURUSD',
  generatedAt: '2026-08-19T12:00:00.000Z',
  status: 'ready' as const,
  dataQuality: 'complete' as const,
  price: null,
  timeframes: [],
  optionalContext: { available: false, reason: 'not configured' },
  missingData: [],
  warnings: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.agentModels.clear();
  mocks.collectSymbolResearchPacket.mockResolvedValue(readyPacket);
  delete process.env.PHASE3_MODEL_DIVERSITY;
  delete process.env.MASTRA_COMMITTEE_MODELS;
});

describe('committee model diversity (§3.1, Q1)', () => {
  it('uses the resolved per-agent top-tier models when provided', async () => {
    const resolveModelForAgent = (agent: 'technical' | 'fundamental' | 'risk' | 'sentiment' | 'fusion') => ({
      model: {
        modelId: `top-tier/${agent}`,
      } as unknown as LanguageModel,
      modelId: `top-tier/${agent}`,
      providerId: 'top-tier',
    });

    const workflow = createCommitteeWorkflow(
      {
        model: { modelId: 'primary/model' } as unknown as LanguageModel,
        modelId: 'primary/model',
        providerId: 'primary',
        memory: undefined as never,
        specialistCallOptions: {} as never,
        fusionCallOptions: {} as never,
        resolveModelForAgent: resolveModelForAgent as never,
      },
      'full',
    );

    const run = await workflow.createRun({ runId: 'wf-diversity' });
    const result = (await run.start({
      inputData: { prompt: 'Full committee analysis', symbol: 'EURUSD', mode: 'full' },
      requestContext: new RequestContext([
        ['userId', 'user-1'],
        ['runId', 'wf-diversity'],
        ['threadId', 'thread-1'],
        ['symbol', 'EURUSD'],
      ]) as never,
    })) as unknown as { status: string; result?: { opinions?: Array<{ model: string }> } };

    expect(result.status).toBe('success');
    const opinions = result.result?.opinions ?? [];
    expect(opinions).toHaveLength(4);
    // Every opinion carries its own resolved model id — diversity is
    // observable, and none of them is a cheaper tier.
    expect(new Set(opinions.map((opinion) => opinion.model))).toEqual(
      new Set([
        'top-tier/technical',
        'top-tier/fundamental',
        'top-tier/risk',
        'top-tier/sentiment',
      ]),
    );
    // The fusion agent got its own top-tier model too.
    expect(mocks.agentModels.get('kestrel-mastra-decision')).toBe('top-tier/fusion');
  });

  it('falls back to the primary model for agents without a pick', async () => {
    const resolveModelForAgent = (agent: 'technical' | 'fusion') =>
      agent === 'technical'
        ? { model: { modelId: 'top-tier/technical' } as unknown as LanguageModel, modelId: 'top-tier/technical', providerId: 'top-tier' }
        : null;

    const workflow = createCommitteeWorkflow(
      {
        model: { modelId: 'primary/model' } as unknown as LanguageModel,
        modelId: 'primary/model',
        providerId: 'primary',
        memory: undefined as never,
        specialistCallOptions: {} as never,
        fusionCallOptions: {} as never,
        resolveModelForAgent: resolveModelForAgent as never,
      },
      'full',
    );

    const run = await workflow.createRun({ runId: 'wf-fallback' });
    const result = (await run.start({
      inputData: { prompt: 'Full committee analysis', symbol: 'EURUSD', mode: 'full' },
      requestContext: new RequestContext([
        ['userId', 'user-1'],
        ['runId', 'wf-fallback'],
        ['threadId', 'thread-1'],
        ['symbol', 'EURUSD'],
      ]) as never,
    })) as unknown as { status: string; result?: { opinions?: Array<{ model: string }> } };

    expect(result.status).toBe('success');
    const models = (result.result?.opinions ?? []).map((opinion) => opinion.model);
    expect(models).toContain('top-tier/technical');
    // Everyone without a pick used the primary top-tier model.
    expect(models.filter((model) => model === 'primary/model')).toHaveLength(3);
    expect(mocks.agentModels.get('kestrel-mastra-decision')).toBe('primary/model');
  });

  it('returns no resolver while PHASE3_MODEL_DIVERSITY is off (rollback flag)', () => {
    const resolver = committeeModelResolver(
      { aiApiKeys: null, chatModel: null, agentModelOverrides: { technical: 'google:gemini-2.5-pro' } },
      {} as never,
    );
    expect(resolver).toBeUndefined();
  });

  it('builds a resolver from user overrides when the flag is on', () => {
    process.env.PHASE3_MODEL_DIVERSITY = '1';
    const resolver = committeeModelResolver(
      { aiApiKeys: null, chatModel: null, agentModelOverrides: { technical: 'google:gemini-2.5-pro' } },
      {} as never,
    );
    expect(resolver).toBeTypeOf('function');
    // Agents without an override fall back (null → primary model).
    expect(resolver?.('fundamental')).toBeNull();
  });
});
