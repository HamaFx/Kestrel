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

// Phase 3 (Jev roadmap) — Brier scoring of historical desk opinions and the
// empirical desk reliability weights injected into Committee Fusion.

import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it } from 'vitest';

import {
  computeDeskReliabilityWeights,
  deskReliabilityBlock,
  evaluateOpinionOutcome,
  hasDeskReliabilitySamples,
} from '../src/committee/calibration-weights';
import { fusionInstructionsForRequest } from '../src/committee/prompts';
import { contextWithPacket, type ModeRequestContext } from '../src/committee/types';
import type { SymbolResearchPacket } from '../src/mastra-v2/packets/symbol-research';
import { computeBrierScore } from '../src/mastra-v2/shared/confidence';

const PACKET = {
  packetId: 'packet-XAUUSD',
  kind: 'symbol_research_packet',
  symbol: 'XAUUSD',
  generatedAt: '2026-10-28T12:00:00.000Z',
  status: 'ready',
  dataQuality: 'complete',
  price: null,
  timeframes: [],
  optionalContext: { available: false, reason: 'Optional context not attached for this test.' },
  missingData: [],
  warnings: [],
} as unknown as SymbolResearchPacket;

function baseContext(withWeights: boolean): RequestContext<ModeRequestContext> {
  const entries: Array<[string, unknown]> = [
    ['userId', 'user-1'],
    ['runId', 'run-1'],
    ['threadId', 'thread-1'],
    ['symbol', 'XAUUSD'],
  ];
  if (withWeights) {
    entries.push(['deskReliability', SYNCED_WEIGHTS]);
  }
  return new RequestContext<ModeRequestContext>(entries as never);
}

const SYNCED_WEIGHTS = computeDeskReliabilityWeights({
  technical: Array.from({ length: 8 }, () => ({ confidence: 0.85, correct: true })),
  fundamental: Array.from({ length: 8 }, () => ({ confidence: 0.85, correct: false })),
  risk: [],
  sentiment: [],
});

describe('Brier score & Committee desk reliability weighting', () => {
  it('computes Brier score mean((confidence - outcome)^2)', () => {
    const brier = computeBrierScore([
      { confidence: 0.9, correct: true }, // (0.9 - 1)^2 = 0.01
      { confidence: 0.8, correct: false }, // (0.8 - 0)^2 = 0.64
    ]);
    expect(brier).toBeCloseTo(0.325, 4);
  });

  it('grades bullish, bearish, and neutral opinions against 4h realized price and ATR', () => {
    expect(
      evaluateOpinionOutcome({ bias: 'bullish', confidence: 0.8 }, 2700, 2715, 10).correct,
    ).toBe(true);
    expect(
      evaluateOpinionOutcome({ bias: 'bearish', confidence: 0.8 }, 2700, 2715, 10).correct,
    ).toBe(false);
    expect(
      evaluateOpinionOutcome({ bias: 'neutral', confidence: 0.7 }, 2700, 2704, 10).correct,
    ).toBe(true);
  });

  it('treats a neutral opinion outside the ATR band as incorrect and falls back to a 0.3% band', () => {
    expect(
      evaluateOpinionOutcome({ bias: 'neutral', confidence: 0.7 }, 2700, 2715, 10).correct,
    ).toBe(false);
    // No ATR supplied: entryPrice * 0.003 = 8.1, so a 4.0 move stays in-band.
    expect(evaluateOpinionOutcome({ bias: 'neutral', confidence: 0.7 }, 2700, 2704).correct).toBe(
      true,
    );
    expect(evaluateOpinionOutcome({ bias: 'neutral', confidence: 0.7 }, 2700, 2720).correct).toBe(
      false,
    );
  });

  it('assigns higher fusion synthesis weight to desks with lower Brier error', () => {
    const weights = computeDeskReliabilityWeights({
      technical: Array.from({ length: 10 }, () => ({ confidence: 0.85, correct: true })),
      fundamental: Array.from({ length: 10 }, () => ({ confidence: 0.85, correct: false })),
      risk: Array.from({ length: 10 }, () => ({ confidence: 0.75, correct: true })),
      sentiment: [],
    });

    expect(weights.technical.weight).toBeGreaterThan(weights.fundamental.weight);
    expect(weights.sentiment.weight).toBeCloseTo(0.25, 1); // Prior default when sampleSize < 5
    expect(weights.technical.weight + weights.fundamental.weight + weights.risk.weight).toBeCloseTo(
      0.75,
      6,
    );
    expect(weights.fundamental.sampleSize).toBe(10);
    expect(weights.fundamental.accuracy).toBe(0);
  });

  it('keeps equal priors while every desk is below the minimum sample size', () => {
    const weights = computeDeskReliabilityWeights({
      technical: [{ confidence: 0.9, correct: true }],
      fundamental: [],
      risk: [],
      sentiment: [],
    });

    expect(weights.technical.weight).toBeCloseTo(0.25, 6);
    expect(weights.fundamental.weight).toBeCloseTo(0.25, 6);
    expect(hasDeskReliabilitySamples(weights)).toBe(false);
  });

  it('renders a concise markdown reliability block for the fusion prompt', () => {
    const weights = computeDeskReliabilityWeights({
      technical: Array.from({ length: 8 }, () => ({ confidence: 0.85, correct: true })),
      fundamental: Array.from({ length: 8 }, () => ({ confidence: 0.85, correct: false })),
      risk: [],
      sentiment: [],
    });

    const block = deskReliabilityBlock(weights);
    expect(block).toContain('EMPIRICAL DESK RELIABILITY');
    expect(block).toContain('technical');
    expect(block).toContain('n=8');
    expect(block).toContain('Brier');
    expect(hasDeskReliabilitySamples(weights)).toBe(true);
  });

  it('carries the reliability block through the request context into the fusion instructions', () => {
    const prompt = fusionInstructionsForRequest({
      requestContext: contextWithPacket(baseContext(true), PACKET, []),
    });

    expect(prompt).toContain('EMPIRICAL DESK RELIABILITY');
    expect(prompt).toContain('technical: weight');
    expect(prompt).toContain('n=8');

    const unweighted = fusionInstructionsForRequest({
      requestContext: contextWithPacket(baseContext(false), PACKET, []),
    });
    expect(unweighted).not.toContain('EMPIRICAL DESK RELIABILITY');
  });
});
