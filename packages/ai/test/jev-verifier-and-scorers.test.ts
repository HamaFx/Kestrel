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

// Phase 2 (Jev System One) — semantic disclosure verifier (catches adversarial
// negations the DISCLOSURE_TERMS regex missed) and 100% live rubric scorers
// (one `/v1/systemone` batch per turn replaces the 5–10% sampled LLM judges).

import { describe, expect, it, vi } from 'vitest';

import {
  hasNegatedDisclosure,
  packetNeedsDisclosure,
  verifySemanticDisclosureWithJev,
} from '../src/jev/semantic-verifier';
import type { JevEnv } from '../src/jev/types';
import {
  buildJevRubricScorers,
  evaluateJevRubricScores,
} from '../src/mastra-v2/evals/scorers/jev-scorers';
import type { SymbolResearchPacket } from '../src/mastra-v2/packets/symbol-research';

const degradedPacket = {
  symbol: 'XAUUSD',
  status: 'ready',
  dataQuality: 'degraded',
  warnings: ['Candles were served from stale-while-error cache'],
  missingData: [],
  timeframes: [],
  optionalContext: { available: false, reason: 'not configured' },
} as unknown as SymbolResearchPacket;

describe('Jev semantic disclosure verifier & 100% live eval rubric scorers', () => {
  it('detects negated disclosure phrases like "not stale" or "never degraded"', () => {
    expect(hasNegatedDisclosure('The price data is not stale and completely fresh.')).toBe(true);
    expect(hasNegatedDisclosure('Note: 15m candle data is stale and served from cache.')).toBe(false);
    expect(hasNegatedDisclosure('The packet data is not stale or degraded.')).toBe(true);
  });

  it('scores faithfulness, answerRelevancy, hallucination, bias, and toxicity in one Jev call', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        model: 'jev-1.13-free',
        answers: {
          faithfulness: { type: 'score', probabilities: [0.01, 0.04, 0.95] },
          answer_relevancy: { type: 'score', probabilities: [0.02, 0.08, 0.9] },
          no_hallucination: { type: 'noul', noul: 0.97 },
          unbiased_scenarios: { type: 'noul', noul: 0.93 },
          non_toxic: { type: 'noul', noul: 0.99 },
        },
        usage: { input_tokens: 280, output_tokens: 20 },
      }),
    });

    const scores = await evaluateJevRubricScores({
      input: 'What is the XAUUSD 1h structure?',
      output: 'XAUUSD 1h is trading at 2750.0 inside the 2720-2765 range.',
      env: { OPENCODE_API_KEY: 'oc-free' },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(scores).not.toBeNull();
    expect(scores!.faithfulness).toBeGreaterThan(0.9);
    expect(scores!.noHallucination).toBe(0.97);
    expect(scores!.answerRelevancy).toBeCloseTo(0.94, 2);
    expect(scores!.unbiasedScenarios).toBe(0.93);
    expect(scores!.nonToxic).toBe(0.99);
    // One batch call — not five separate requests.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('flags a superficially negated disclosure as a blocking finding over a degraded packet', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        model: 'jev-1.13-free',
        answers: {
          honestly_discloses_degraded_data: { type: 'noul', noul: 0.06 },
          uses_scenario_framing: { type: 'noul', noul: 0.9 },
          includes_invalidation_level: { type: 'noul', noul: 0.88 },
        },
        usage: { input_tokens: 260, output_tokens: 9 },
      }),
    });

    const result = await verifySemanticDisclosureWithJev(
      'The packet data is not stale or degraded; structure is fully confirmed.',
      degradedPacket,
      {
        env: { OPENCODE_API_KEY: 'oc-free' },
        fetchImpl: fetchMock as unknown as typeof fetch,
      },
    );

    expect(result).not.toBeNull();
    expect(result!.ok).toBe(false);
    expect(result!.findings.join(' ')).toContain('disclose');
  });

  it('accepts an honest disclosure and reports scenario/invalidation as advisory', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        model: 'jev-1.13-free',
        answers: {
          honestly_discloses_degraded_data: { type: 'noul', noul: 0.94 },
          uses_scenario_framing: { type: 'noul', noul: 0.3 },
          includes_invalidation_level: { type: 'noul', noul: 0.92 },
        },
      }),
    });

    const result = await verifySemanticDisclosureWithJev(
      'Candle data is degraded, so this read carries lower conviction.',
      degradedPacket,
      {
        env: { OPENCODE_API_KEY: 'oc-free' },
        fetchImpl: fetchMock as unknown as typeof fetch,
      },
    );

    expect(result!.ok).toBe(true);
    expect(result!.findings.join(' ')).toContain('advisory');
  });

  it('returns null when Jev is unconfigured so callers keep the deterministic path', async () => {
    expect(
      await verifySemanticDisclosureWithJev('text', degradedPacket, {
        env: {},
        fetchImpl: vi.fn() as unknown as typeof fetch,
      }),
    ).toBeNull();
  });

  it('only demands disclosure when the packet metadata says so', () => {
    expect(packetNeedsDisclosure(degradedPacket)).toBe(true);
    expect(
      packetNeedsDisclosure({
        status: 'ready',
        dataQuality: 'complete',
        warnings: [],
        missingData: [],
      } as unknown as SymbolResearchPacket),
    ).toBe(false);
  });

  it('builds a 100%-sampled rubric scorer only when a Jev endpoint resolves', () => {
    expect(buildJevRubricScorers('conversation', {}, null)).toBeNull();

    const jevEnv: JevEnv = { OPENCODE_API_KEY: 'oc-free' };
    const built = buildJevRubricScorers('research', jevEnv, null);
    expect(built).not.toBeNull();
    expect(Object.keys(built!.entries)).toContain('kestrel-jev-rubric');
    expect(built!.entries['kestrel-jev-rubric']!.sampling).toEqual({ type: 'ratio', rate: 1 });
  });
});
