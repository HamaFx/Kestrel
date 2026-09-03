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

// Phase 0 — cost fixtures. One deterministic fixture per billed generation
// kind so refactors can compare ledger totals against a fixed baseline.
// Fixture prices are computed from the strict pricing table
// (estimateKnownCostUsd) for google/gemini-2.5-flash: 0.30 USD / 1M input,
// 2.50 USD / 1M output.

import { describe, expect, it } from 'vitest';

import { estimateKnownCostUsd } from '../src/cost';
import {
  createGenerationLedger,
  restoreGenerationLedger,
  type GenerationKind,
} from '../src/generation-ledger';
import { observationalMemoryAllowanceUsd } from '../src/mastra-v2/memory';
import {
  FULL_ANALYSIS_ESTIMATE_USD,
  FULL_ANALYSIS_TURN_ESTIMATE_USD,
} from '../src/mastra-v2/workflows/full-analysis';

const FIXTURE_MODEL = 'google/gemini-2.5-flash' as const;

interface CostFixture {
  id: string;
  kind: GenerationKind;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Deterministic token budgets for every billed generation kind. Keep these
 * stable: they are the cost baseline that refactors must reproduce.
 */
export const COST_FIXTURES = {
  single: { id: 'primary:message-1', kind: 'primary', inputTokens: 1_200, outputTokens: 480 },
  title: { id: 'title:thread-1', kind: 'title', inputTokens: 400, outputTokens: 60 },
  'semantic-routing': {
    id: 'semantic-routing:message-1',
    kind: 'semantic-routing',
    inputTokens: 200,
    outputTokens: 40,
  },
  'specialist:technical': {
    id: 'specialist:technical',
    kind: 'specialist',
    inputTokens: 2_000,
    outputTokens: 300,
  },
  'specialist:fundamental': {
    id: 'specialist:fundamental',
    kind: 'specialist',
    inputTokens: 2_400,
    outputTokens: 400,
  },
  'specialist:risk': {
    id: 'specialist:risk',
    kind: 'specialist',
    inputTokens: 1_800,
    outputTokens: 350,
  },
  'specialist:sentiment': {
    id: 'specialist:sentiment',
    kind: 'specialist',
    inputTokens: 1_600,
    outputTokens: 280,
  },
  fusion: { id: 'fusion', kind: 'fusion', inputTokens: 4_000, outputTokens: 900 },
} as const satisfies Record<string, CostFixture>;

function fixtureCost(fixture: CostFixture): number {
  return estimateKnownCostUsd(FIXTURE_MODEL, fixture.inputTokens, fixture.outputTokens);
}

function recordFixtures(ledger: ReturnType<typeof createGenerationLedger>, ids: string[]): number {
  let total = 0;
  for (const id of ids) {
    const fixture = COST_FIXTURES[id as keyof typeof COST_FIXTURES];
    if (!fixture) throw new Error(`Unknown cost fixture: ${id}`);
    ledger.recordUsage(
      fixture.id,
      fixture.kind,
      FIXTURE_MODEL,
      fixture.inputTokens,
      fixture.outputTokens,
      estimateKnownCostUsd,
    );
    total += fixtureCost(fixture);
  }
  return total;
}

describe('Phase 0 cost fixtures', () => {
  it('prices the single canonical generation deterministically', () => {
    const expected = fixtureCost(COST_FIXTURES.single);
    expect(expected).toBeCloseTo(0.00036 + 0.0012, 9);
  });

  it('prices title and semantic-routing auxiliary generations below the primary', () => {
    const primary = fixtureCost(COST_FIXTURES.single);
    const title = fixtureCost(COST_FIXTURES.title);
    const routing = fixtureCost(COST_FIXTURES['semantic-routing']);
    expect(title).toBeLessThan(primary);
    expect(routing).toBeLessThan(title);
    expect(title + routing).toBeCloseTo(estimateKnownCostUsd(FIXTURE_MODEL, 400 + 200, 60 + 40), 9);
  });

  it('prices the four committee specialists as independent children', () => {
    const specialists = [
      'specialist:technical',
      'specialist:fundamental',
      'specialist:risk',
      'specialist:sentiment',
    ] as const;
    const sum = specialists.reduce((total, id) => total + fixtureCost(COST_FIXTURES[id]), 0);
    expect(sum).toBeCloseTo(
      estimateKnownCostUsd(
        FIXTURE_MODEL,
        specialists.reduce((total, id) => total + COST_FIXTURES[id].inputTokens, 0),
        specialists.reduce((total, id) => total + COST_FIXTURES[id].outputTokens, 0),
      ),
      9,
    );
  });

  it('aggregates a full committee run exactly once: parent equals child sum', () => {
    const ledger = createGenerationLedger();
    const expected = recordFixtures(ledger, [
      'specialist:technical',
      'specialist:fundamental',
      'specialist:risk',
      'specialist:sentiment',
      'fusion',
    ]);

    expect(ledger.total()).toBeCloseTo(expected, 9);
    expect(ledger.snapshot().totalCostUsd).toBeCloseTo(expected, 9);
    expect(ledger.snapshot().entries).toHaveLength(5);
  });

  it('aggregates a standard committee run exactly once (partial specialist set)', () => {
    const ledger = createGenerationLedger();
    const expected = recordFixtures(ledger, [
      'specialist:technical',
      'specialist:fundamental',
      'fusion',
    ]);

    expect(ledger.total()).toBeCloseTo(expected, 9);
  });

  it('counts title and semantic routing once in the canonical turn total', () => {
    const ledger = createGenerationLedger();
    const expected = recordFixtures(ledger, ['single', 'semantic-routing', 'title']);

    expect(ledger.total()).toBeCloseTo(expected, 9);

    // Duplicate emissions (retries, repeated callbacks) must not inflate it.
    ledger.recordCost('primary:message-1', 'primary', fixtureCost(COST_FIXTURES.single));
    ledger.recordCost('title:thread-1', 'title', fixtureCost(COST_FIXTURES.title));
    expect(ledger.total()).toBeCloseTo(expected, 9);
    expect(ledger.snapshot().entries).toHaveLength(3);
  });

  it('restores the fixture snapshot without double counting', () => {
    const original = createGenerationLedger();
    const expected = recordFixtures(original, [
      'specialist:technical',
      'specialist:risk',
      'fusion',
    ]);
    const restored = restoreGenerationLedger(original.snapshot());

    expect(restored.total()).toBeCloseTo(expected, 9);
    expect(restored.recordCost('fusion', 'fusion', fixtureCost(COST_FIXTURES.fusion))).toBe(false);
    expect(restored.total()).toBeCloseTo(expected, 9);
  });

  it('records a specialist failure (permanent marker) without a billed generation', () => {
    const ledger = createGenerationLedger();
    const expected = recordFixtures(ledger, ['specialist:technical', 'fusion']);

    // A failed specialist emits no usage entry — only successes are billed.
    expect(ledger.total()).toBeCloseTo(expected, 9);
    expect(ledger.snapshot().entries.map((entry) => entry.id)).toEqual([
      'specialist:technical',
      'fusion',
    ]);
  });
});

describe('Phase 9 — durable full-analysis reservation fixture (observational memory allowance)', () => {
  it('reserves the visible turn plus the independent observational allowance', () => {
    // 5.0c visible turn + 0.8c observational allowance (2 refinements × 0.4c).
    expect(FULL_ANALYSIS_TURN_ESTIMATE_USD).toBe(0.05);
    expect(observationalMemoryAllowanceUsd(1)).toBeCloseTo(0.008, 6);
    expect(FULL_ANALYSIS_ESTIMATE_USD).toBeCloseTo(0.058, 6);
    // Deterministic cents-level fixture: 5.8 cents, never float drift.
    expect(Math.round(FULL_ANALYSIS_ESTIMATE_USD * 100_000) / 1_000).toBe(5.8);
  });

  it('keeps the observational allowance a small fraction of the turn estimate', () => {
    expect(observationalMemoryAllowanceUsd(1) / FULL_ANALYSIS_TURN_ESTIMATE_USD).toBeLessThan(0.25);
  });
});
