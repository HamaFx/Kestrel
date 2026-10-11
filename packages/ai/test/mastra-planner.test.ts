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

// Audit plan §5.1 — lightweight planner. Complex fundamental prompts are
// decomposed; simple prompts skip the call; planner failures degrade to the
// trivial plan instead of failing the run.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  ledger: { recordCost: vi.fn() },
}));

vi.mock('@mastra/core/agent', () => ({
  Agent: class {
    async generate(): Promise<unknown> {
      return mocks.generate();
    }
  },
}));

import { plannerRequired, runPlanner } from '../src/mastra-v2/workflows/planner';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('planner (§5.1)', () => {
  it('gates on prompt complexity — simple prompts skip the LLM call', async () => {
    expect(plannerRequired('analyze gold')).toBe(false);
    expect(
      plannerRequired('Compare XAUUSD to the dollar index and this week\'s calendar risk'),
    ).toBe(true);

    const result = await runPlanner({
      prompt: 'analyze gold',
      model: {} as never,
      modelId: 'test/model',
    });
    expect(result.plan.planRequired).toBe(false);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(result.costUsd).toBe(0);
  });

  it('returns the structured plan for complex prompts and ledgers the cost', async () => {
    mocks.generate.mockResolvedValue({
      object: {
        planRequired: true,
        subtasks: [
          { kind: 'packet', symbol: 'XAUUSD', focus: 'gold structure' },
          { kind: 'correlation', symbol: 'XAUUSD', focus: 'DXY sensitivity' },
          { kind: 'calendar', symbol: 'XAUUSD', focus: 'USD event risk' },
        ],
        rationale: 'Multi-aspect fundamental request.',
      },
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const result = await runPlanner({
      prompt: 'Compare XAUUSD to the dollar index and this week\'s calendar risk for a position',
      model: {} as never,
      modelId: 'test/model',
      ledger: mocks.ledger as never,
    });

    expect(result.plan.subtasks).toHaveLength(3);
    expect(result.plan.subtasks[1]?.kind).toBe('correlation');
    expect(result.costUsd).toBeGreaterThan(0);
    expect(mocks.ledger.recordCost).toHaveBeenCalledWith(
      'planner',
      'auxiliary',
      expect.any(Number),
    );
  });

  it('degrades to the trivial plan when the planner call fails', async () => {
    mocks.generate.mockRejectedValue(new Error('provider unavailable'));
    const result = await runPlanner({
      prompt: 'Compare XAUUSD to the dollar index and this week\'s calendar risk for a position',
      model: {} as never,
      modelId: 'test/model',
    });
    expect(result.plan.planRequired).toBe(false);
    expect(result.plan.subtasks).toHaveLength(1);
    expect(result.plan.subtasks[0]?.kind).toBe('packet');
  });
});
