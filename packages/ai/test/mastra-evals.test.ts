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

import { computeCitationScore } from '../src/eval/citation-oracle';
import { createCitationScorer } from '../src/mastra-v2/evals/custom';
import {
  createMastraEvalGate,
  createScoreThresholdGate,
  recordsToGateObserved,
} from '../src/mastra-v2/evals/gate';
import {
  buildConversationScorers,
  buildPrebuiltScorers,
  buildResearchScorers,
  createDeterministicScorer,
  resolveJudgeModel,
} from '../src/mastra-v2/evals/scorers';
import type { ScoreRecord } from '../src/mastra-v2/evals/scores';

const mocks = vi.hoisted(() => ({
  resolveChatModel: vi.fn(),
}));

vi.mock('../src/models/model', () => ({
  resolveChatModel: mocks.resolveChatModel,
}));

const settings = { aiApiKeys: null, chatModel: null };
const env = {};

function fakeResolution() {
  return {
    model: { id: 'fast-model' },
    modelId: 'google/gemini-3.5-flash-lite',
    providerId: 'google',
    bareModelId: 'gemini-3.5-flash-lite',
  };
}

describe('mastra evals — scorers', () => {
  it('skips all scorers when no judge model resolves (graceful degradation)', () => {
    mocks.resolveChatModel.mockImplementation(() => {
      throw new Error('No AI API keys configured');
    });
    const built = buildPrebuiltScorers({
      settings: settings as never,
      env: env as never,
    });
    expect(built.scorers).toHaveLength(0);
    expect(Object.keys(built.entries)).toHaveLength(0);
    expect(built.judgeModel).toBeNull();
    expect(built.skipped).toHaveLength(5);
    expect(built.warnings.length).toBeGreaterThan(0);
  });

  it('resolves the judge model through the BYOK fast tier', () => {
    mocks.resolveChatModel.mockReturnValue(fakeResolution());
    const { model } = resolveJudgeModel(settings as never, env as never);
    expect(model).not.toBeNull();
    expect(mocks.resolveChatModel).toHaveBeenCalledWith(
      expect.objectContaining({ aiApiKeys: null }),
      env,
      'technical',
    );
  });

  it('builds all five prebuilt scorers with ratio sampling', () => {
    mocks.resolveChatModel.mockReturnValue(fakeResolution());
    const built = buildPrebuiltScorers({
      settings: settings as never,
      env: env as never,
      sampling: { type: 'ratio', rate: 0.1 },
    });
    expect(Object.keys(built.entries).sort()).toEqual([
      'answer-relevancy',
      'bias',
      'faithfulness',
      'hallucination',
      'toxicity',
    ]);
    for (const entry of Object.values(built.entries)) {
      expect(entry.sampling).toEqual({ type: 'ratio', rate: 0.1 });
    }
  });

  it('builds conversation (5%) and research (10%) presets with custom scorers', () => {
    mocks.resolveChatModel.mockReturnValue(fakeResolution());
    const conversation = buildConversationScorers(settings as never, env as never);
    // Prebuilt scorers (sampled) + the generic citation scorer. Report
    // grounding requires an explicit packet and is attached at verification,
    // not to a generic prompt/output agent run.
    expect(Object.keys(conversation.entries).sort()).toEqual([
      'answer-relevancy',
      'faithfulness',
      'kestrel-citation',
      'toxicity',
    ]);
    // Prebuilt scorers carry sampling; custom scorers do not.
    expect(conversation.entries['answer-relevancy']?.sampling).toEqual({
      type: 'ratio',
      rate: 0.05,
    });
    expect(conversation.entries['kestrel-citation']?.sampling).toBeUndefined();

    const research = buildResearchScorers(settings as never, env as never);
    expect(Object.keys(research.entries).sort()).toEqual([
      'bias',
      'hallucination',
      'kestrel-citation',
      'toxicity',
    ]);
    expect(research.entries['hallucination']?.sampling).toEqual({ type: 'ratio', rate: 0.1 });
  });

  it('creates a deterministic scorer that scores by predicate', async () => {
    const scorer = createDeterministicScorer(
      'test-numeric',
      'Scores 1 when output contains a number',
      ({ output }) => String(output).includes('2.0'),
    );
    const passing = await scorer.run({
      runId: 'run-1',
      input: 'prompt',
      output: 'price is 2.0',
      requestContext: {},
    });
    expect(passing.score).toBe(1);
    const failing = await scorer.run({
      runId: 'run-2',
      input: 'prompt',
      output: 'no number here',
      requestContext: {},
    });
    expect(failing.score).toBe(0);
  });
});

describe('mastra evals — custom scorers', () => {
  it('citation scorer computes the oracle ratio 0..1', async () => {
    const scorer = createCitationScorer();
    // Price claim with no supporting tool → unsupported.
    const unsupported = await scorer.run({
      runId: 'run-cite-1',
      input: {
        text: 'XAUUSD is trading at 2350.10 now.',
        toolCalls: [{ name: 'get_news' }],
      },
      output: null,
      requestContext: {},
    });
    expect(unsupported.score).toBe(0);
    // Same claim backed by a numeric support tool → 1.
    const supported = await scorer.run({
      runId: 'run-cite-2',
      input: {
        text: 'XAUUSD is trading at 2350.10 now.',
        toolCalls: [{ name: 'get_price' }],
      },
      output: null,
      requestContext: {},
    });
    expect(supported.score).toBe(1);
  });

  it('citation oracle scores 1.0 for text with no claims', () => {
    expect(computeCitationScore('No numbers or events here.', [])).toBe(1);
  });
});

describe('mastra evals — gate', () => {
  function record(partial: Partial<ScoreRecord>): ScoreRecord {
    return {
      id: 's1',
      scorerId: 'faithfulness',
      runId: 'run-1',
      entityId: 'e1',
      score: 1,
      createdAt: new Date(),
      source: 'TEST',
      ...partial,
    };
  }

  it('passes when all records meet thresholds', () => {
    const result = recordsToGateObserved([
      record({ scorerId: 'faithfulness', score: 1 }),
      record({ scorerId: 'hallucination', score: 0 }),
      record({ scorerId: 'kestrel-citation', score: 0.95 }),
    ]);
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it('fails when a scorer falls below the pass threshold', () => {
    const result = recordsToGateObserved(
      [
        record({ scorerId: 'faithfulness', score: 0.4 }),
        record({ scorerId: 'hallucination', score: 0 }),
        record({ scorerId: 'kestrel-citation', score: 1 }),
      ],
      { minOverallPassRate: 0.95 } as never,
    );
    expect(result.passed).toBe(false);
    expect(result.failures.length).toBeGreaterThan(0);
  });

  it('Mastra gate scorer fails on empty records and passes on good ones', async () => {
    const gate = createMastraEvalGate();
    const empty = await gate.run({
      runId: 'gate-empty',
      input: { records: [] },
      output: null,
      requestContext: {},
    });
    expect(empty.score).toBe(0);

    const good = await gate.run({
      runId: 'gate-good',
      input: {
        records: [
          record({ scorerId: 'faithfulness', score: 1 }),
          record({ scorerId: 'hallucination', score: 0 }),
          record({ scorerId: 'kestrel-citation', score: 1 }),
        ],
      },
      output: null,
      requestContext: {},
    });
    expect(good.score).toBe(1);
  });

  it('threshold gate enforces min on a specific scorer', async () => {
    const gate = createScoreThresholdGate('hallucination', { min: 0, max: 0.2 });
    const pass = await gate.run({
      runId: 'tg-1',
      input: { records: [record({ scorerId: 'hallucination', score: 0.1 })] },
      output: null,
      requestContext: {},
    });
    expect(pass.score).toBe(1);
    const fail = await gate.run({
      runId: 'tg-2',
      input: { records: [record({ scorerId: 'hallucination', score: 0.5 })] },
      output: null,
      requestContext: {},
    });
    expect(fail.score).toBe(0);
  });
});
