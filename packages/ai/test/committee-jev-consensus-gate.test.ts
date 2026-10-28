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

// Phase 2 (Jev System One) — adaptive committee consensus & debate gate.
// High-consensus runs skip the Critique/Debate LLM waves; conflicting desks
// always deliberate. The deterministic pre-check must short-circuit before any
// network call.

import { describe, expect, it, vi } from 'vitest';

import { shouldRunCommitteeDeliberation } from '../src/committee/jev-consensus-gate';
import type { MastraModeOpinion } from '../src/committee/types';

const makeOpinions = (biases: Array<'bullish' | 'bearish' | 'neutral'>): MastraModeOpinion[] =>
  (['technical', 'fundamental', 'risk', 'sentiment'] as const).map((agentName, i) => ({
    agentName,
    bias: biases[i] ?? 'bullish',
    confidence: 0.84,
    reasoning: `${agentName} sees clear structure aligned with ${biases[i] ?? 'bullish'} momentum.`,
    rawData: {},
    model: 'google/gemini-2.5-pro',
    providerId: 'google',
    inputTokens: 300,
    outputTokens: 120,
    costUsd: 0.002,
    latencyMs: 900,
  }));

describe('Committee Jev adaptive consensus & debate gate', () => {
  it('skips both Critique and Debate when all 4 desks agree and Jev finds no material contradiction', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        model: 'jev-1.13-free',
        answers: {
          has_material_contradiction: { type: 'noul', noul: 0.08 },
          needs_debate_round: { type: 'noul', noul: 0.05 },
          consensus_strength: { type: 'score', probabilities: [0.02, 0.08, 0.9] },
        },
        usage: { input_tokens: 310, output_tokens: 12 },
      }),
    });

    const decision = await shouldRunCommitteeDeliberation(
      makeOpinions(['bullish', 'bullish', 'bullish', 'bullish']),
      {
        critiqueEnabled: true,
        debateEnabled: true,
        env: { OPENCODE_API_KEY: 'oc-free' },
        fetchImpl: fetchMock as unknown as typeof fetch,
      },
    );

    expect(decision.shouldCritique).toBe(false);
    expect(decision.shouldDebate).toBe(false);
    expect(decision.reason).toContain('high-consensus');
  });

  it('triggers Critique and Debate when desks have conflicting biases (bullish vs bearish)', async () => {
    const decision = await shouldRunCommitteeDeliberation(
      makeOpinions(['bullish', 'bearish', 'neutral', 'bullish']),
      {
        critiqueEnabled: true,
        debateEnabled: true,
      },
    );

    expect(decision.shouldCritique).toBe(true);
    expect(decision.shouldDebate).toBe(true);
  });

  it('runs both waves when Jev is unavailable (no provider configured)', async () => {
    const fetchMock = vi.fn();
    const decision = await shouldRunCommitteeDeliberation(
      makeOpinions(['bullish', 'bullish', 'neutral', 'bullish']),
      {
        critiqueEnabled: true,
        debateEnabled: true,
        env: {},
        fetchImpl: fetchMock as unknown as typeof fetch,
      },
    );

    expect(decision.shouldCritique).toBe(true);
    expect(decision.shouldDebate).toBe(true);
    expect(decision.reason).toContain('jev-unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never skips on an incomplete Wave 1 even if the remaining desks agree', async () => {
    const fetchMock = vi.fn();
    const decision = await shouldRunCommitteeDeliberation(makeOpinions(['bullish']).slice(0, 3), {
      critiqueEnabled: true,
      debateEnabled: true,
      env: { OPENCODE_API_KEY: 'oc-free' },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(decision.shouldCritique).toBe(true);
    expect(decision.shouldDebate).toBe(true);
    expect(decision.reason).toContain('incomplete-wave1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('runs both waves when Jev sees a material contradiction despite equal biases', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        model: 'jev-1.13-free',
        answers: {
          has_material_contradiction: { type: 'noul', noul: 0.71 },
          needs_debate_round: { type: 'noul', noul: 0.66 },
          consensus_strength: { type: 'score', probabilities: [0.3, 0.5, 0.2] },
        },
        usage: { input_tokens: 300, output_tokens: 12 },
      }),
    });

    const decision = await shouldRunCommitteeDeliberation(
      makeOpinions(['bullish', 'bullish', 'bullish', 'bullish']),
      {
        critiqueEnabled: true,
        debateEnabled: true,
        env: { OPENCODE_API_KEY: 'oc-free' },
        fetchImpl: fetchMock as unknown as typeof fetch,
      },
    );

    expect(decision.shouldCritique).toBe(true);
    expect(decision.shouldDebate).toBe(true);
    expect(decision.reason).toContain('jev-deliberation-required');
  });
});
