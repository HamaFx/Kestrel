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

// Audit plan §1.4 — fusion verifier. The free-form committee synthesis is
// grounded against the packet + verified opinions; a hallucinated number
// triggers one bounded repair, and a second failure is terminal (Q3 strict).

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { fusionRepairPrompt, verifyFusionAnswer } from '../src/committee/fusion-verifier';
import {
  FusionAnswerSchema,
  renderFusionAnswer,
  synthesizeCommitteeAnswer,
} from '../src/committee/synthesizer';
import { MastraModeStrictFailureError } from '../src/committee/types';
import type { SymbolResearchPacket } from '../src/mastra-v2/packets/symbol-research';

const mocks = vi.hoisted(() => ({
  /** Queued fusion generate() results; consumed in order, last one repeats. */
  fusionTexts: [] as string[],
  /** Queued structured objects (§3.3); when set, results carry `.object`. */
  fusionObjects: [] as unknown[],
  generate: vi.fn(),
}));

vi.mock('@mastra/core/agent', () => ({
  Agent: class {
    readonly id: string;

    constructor(options: { id: string }) {
      this.id = options.id;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this as any).generate = mocks.generate;
    }
  },
}));

beforeEach(() => {
  mocks.fusionTexts = [];
  mocks.fusionObjects = [];
  mocks.generate.mockReset().mockImplementation(async () => {
    const text = mocks.fusionTexts.length > 1 ? mocks.fusionTexts.shift() : mocks.fusionTexts[0];
    const object = mocks.fusionObjects.length > 1 ? mocks.fusionObjects.shift() : mocks.fusionObjects[0];
    return {
      text,
      ...(mocks.fusionObjects.length > 0 ? { object } : {}),
      usage: { inputTokens: 10, outputTokens: 5 },
      steps: [{}],
    };
  });
});

const packet = {
  packetId: 'packet-1',
  kind: 'symbol_research_packet' as const,
  symbol: 'XAUUSD',
  generatedAt: '2026-10-10T12:00:00.000Z',
  status: 'ready' as const,
  dataQuality: 'complete' as const,
  price: {
    evidenceId: 'price-1',
    symbol: 'XAUUSD',
    source: 'biquote',
    fetchedAt: '2026-10-10T12:00:00.000Z',
    dataAsOf: '2026-10-10T12:00:00.000Z',
    freshness: 'fresh' as const,
    quality: 'complete' as const,
    warnings: [],
    tick: { symbol: 'XAUUSD', bid: 2648.2, ask: 2648.4, mid: 2648.3, ts: 1760000000000, source: 'biquote' },
  },
  timeframes: [
    {
      evidenceId: 'research-1',
      symbol: 'XAUUSD',
      timeframe: '1h' as const,
      source: 'biquote',
      fetchedAt: '2026-10-10T12:00:00.000Z',
      dataAsOf: '2026-10-10T12:00:00.000Z',
      freshness: 'fresh' as const,
      quality: 'complete' as const,
      warnings: [],
      candles: [
        {
          symbol: 'XAUUSD',
          tf: '1h' as const,
          t: 1760000000000,
          o: 2647.1,
          h: 2649.9,
          l: 2646.0,
          c: 2648.2,
          v: 100,
          source: 'biquote',
          fetchedAt: 1760000000000,
        },
      ],
      indicators: [
        {
          symbol: 'XAUUSD',
          tf: '1h' as const,
          kind: 'rsi' as const,
          params: { period: 14 },
          values: [61.4],
          fetchedAt: 1760000000000,
        },
      ],
    },
  ],
  optionalContext: { available: false, reason: 'not configured' },
  missingData: [],
  warnings: [],
} as unknown as SymbolResearchPacket;

const opinions = [
  {
    agentName: 'technical' as const,
    bias: 'bullish' as const,
    confidence: 0.7,
    reasoning: 'Price holds 2648 with RSI at 61 and bullish EMA alignment on the 1h.',
    rawData: {},
    model: 'test/model',
    providerId: 'test',
    inputTokens: 10,
    outputTokens: 5,
    costUsd: 0.001,
    latencyMs: 100,
  },
];

describe('verifyFusionAnswer (§1.4)', () => {
  it('accepts fusion text grounded in packet evidence', () => {
    const verification = verifyFusionAnswer(
      'Gold trades at 2648.3 with RSI 61; upside continuation is favored.',
      packet,
    );
    expect(verification.ok).toBe(true);
  });

  it('accepts numbers quoted from a verified specialist opinion', () => {
    const verification = verifyFusionAnswer(
      'The technical desk notes EMA alignment around 2648.',
      packet,
    );
    expect(verification.ok).toBe(true);
  });

  it('accepts scenario projections without packet matches', () => {
    const verification = verifyFusionAnswer(
      'Bullish continuation targets 2720 with invalidation below 2600.',
      packet,
    );
    expect(verification.ok).toBe(true);
  });

  it('rejects hallucinated prices that exist nowhere in packet or opinions', () => {
    const verification = verifyFusionAnswer(
      'Gold support sits at 9999 with strong buying interest.',
      packet,
    );
    expect(verification.ok).toBe(false);
    expect(verification.findings.join(' ')).toContain('9999');
  });

  it('rejects empty fusion answers', () => {
    const verification = verifyFusionAnswer('   ', packet);
    expect(verification.ok).toBe(false);
    expect(verification.findings).toContain('fusion answer is empty');
  });

  it('rejects numeric answers when the packet is blocked', () => {
    const verification = verifyFusionAnswer(
      'Price is 2600 today.',
      { ...packet, status: 'blocked' },
    );
    expect(verification.ok).toBe(false);
    expect(verification.findings[0]).toContain('packet data is unavailable');
  });

  it('builds a bounded repair prompt with the findings', () => {
    const prompt = fusionRepairPrompt('Analyze gold', ['unsupported numeric value 9999']);
    expect(prompt).toContain('Analyze gold');
    expect(prompt).toContain('failed deterministic verification');
    expect(prompt).toContain('- unsupported numeric value 9999');
  });
});

describe('synthesizeCommitteeAnswer strict fusion repair (§1.4, Q3)', () => {
  const recordCost = vi.fn();
  const deps = {
    model: {} as never,
    modelId: 'test/model',
    providerId: 'test',
    memory: {} as never,
    fusionCallOptions: {} as never,
    ledger: { recordCost, total: () => 0 } as never,
    maxSteps: 1,
  };
  const requestContext = { get: () => 'x' } as never;

  it('returns the repaired answer when the repair grounds the numbers', async () => {
    mocks.fusionTexts = [
      'Gold is supported at 12345 and looks strong.',
      'Gold trades at 2648.3 with RSI at 61; the committee leans bullish.',
    ];
    const result = await synthesizeCommitteeAnswer({
      mode: 'full',
      prompt: 'Full committee analysis',
      packet,
      opinions,
      executionStats: [],
      requestContext,
      deps,
    });
    expect(result.finalText).toContain('2648.3');
    // One initial fusion attempt + one bounded repair.
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    // Both attempts are ledgered as a single fusion cost entry.
    expect(recordCost).toHaveBeenCalledTimes(1);
  });

  it('throws MastraModeStrictFailureError when the repair also hallucinates', async () => {
    mocks.fusionTexts = ['Gold is supported at 12345 and looks strong.'];
    await expect(
      synthesizeCommitteeAnswer({
        mode: 'full',
        prompt: 'Full committee analysis',
        packet,
        opinions,
        executionStats: [],
        requestContext,
        deps,
      }),
    ).rejects.toBeInstanceOf(MastraModeStrictFailureError);
    expect(mocks.generate).toHaveBeenCalledTimes(2);
  });

  it('accepts a grounded first fusion without any repair call', async () => {
    mocks.fusionTexts = ['Gold trades at 2648.3 with RSI at 61; the committee leans bullish.'];
    const result = await synthesizeCommitteeAnswer({
      mode: 'full',
      prompt: 'Full committee analysis',
      packet,
      opinions,
      executionStats: [],
      requestContext,
      deps,
    });
    expect(result.finalText).toContain('2648.3');
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });

  it('reports the model the fusion pass actually used (§3.1, Q2)', async () => {
    mocks.fusionTexts = ['Gold trades at 2648.3 with RSI at 61; the committee leans bullish.'];
    const primary = await synthesizeCommitteeAnswer({
      mode: 'full',
      prompt: 'Full committee analysis',
      packet,
      opinions,
      executionStats: [],
      requestContext,
      deps,
    });
    // Without diversity the fusion span model is the run's primary model.
    expect(primary.fusionModelId).toBe('test/model');
    expect(primary.fusionProviderId).toBe('test');

    mocks.fusionTexts = ['Gold trades at 2648.3 with RSI at 61; the committee leans bullish.'];
    const diverse = await synthesizeCommitteeAnswer({
      mode: 'full',
      prompt: 'Full committee analysis',
      packet,
      opinions,
      executionStats: [],
      requestContext,
      deps: {
        ...deps,
        resolveModelForAgent: () => ({
          model: {} as never,
          modelId: 'other/fusion-model',
          providerId: 'other',
        }),
      },
    });
    // With PHASE3_MODEL_DIVERSITY the real per-agent model id is reported.
    expect(diverse.fusionModelId).toBe('other/fusion-model');
    expect(diverse.fusionProviderId).toBe('other');
  });
});

describe('synthesizeCommitteeAnswer structured fusion repair render (§3.3, P1-3)', () => {
  const recordCost = vi.fn();
  const deps = {
    model: {} as never,
    modelId: 'test/model',
    providerId: 'test',
    memory: {} as never,
    fusionCallOptions: {} as never,
    ledger: { recordCost, total: () => 0 } as never,
    maxSteps: 1,
  };
  const requestContext = { get: () => 'x' } as never;

  /** Valid FusionAnswer object; only the bottom line varies per scenario. */
  const structuredAnswer = (bottomLine: string) => ({
    bottomLine,
    reasoning: 'The technical desk holds the level with EMA alignment.',
    risks: ['A close below 2648 invalidates the tilt.'],
    invalidation: 'Daily close below 2648.',
    scenarioTable: [
      { scenario: 'Continuation', bias: 'bullish' as const, trigger: 'Hold above 2648' },
      { scenario: 'Reversal', bias: 'bearish' as const, trigger: 'Break below 2648' },
    ],
  });
  const groundedAnswer = structuredAnswer(
    'Gold trades at 2648.3 with RSI at 61; the committee leans bullish.',
  );
  const hallucinatedAnswer = structuredAnswer('Gold is supported at 12345 and looks strong.');

  afterEach(() => {
    delete process.env.PHASE3_STRUCTURED_FUSION;
  });

  it('renders the structured repair through the same helper, not the raw text', async () => {
    process.env.PHASE3_STRUCTURED_FUSION = 'true';
    mocks.fusionTexts = ['raw-first-attempt-text', 'raw-repair-text'];
    mocks.fusionObjects = [hallucinatedAnswer, groundedAnswer];

    const result = await synthesizeCommitteeAnswer({
      mode: 'full',
      prompt: 'Full committee analysis',
      packet,
      opinions,
      executionStats: [],
      requestContext,
      deps,
    });

    // The repaired answer is the deterministic rendered markdown of the
    // repair's structured object — never the repair's raw `.text`.
    expect(result.finalText).toBe(renderFusionAnswer(FusionAnswerSchema.parse(groundedAnswer)));
    expect(result.finalText).not.toBe('raw-repair-text');
    expect(result.finalText).toContain('| Scenario | Bias | Trigger |');
    // One structured first attempt + one structured bounded repair.
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    for (const call of mocks.generate.mock.calls) {
      const options = call[1] as { structuredOutput?: { schema?: unknown } };
      expect(options.structuredOutput?.schema).toBe(FusionAnswerSchema);
    }
    // Both attempts are ledgered as a single fusion cost entry.
    expect(recordCost).toHaveBeenCalledTimes(1);
  });

  it('renders a grounded structured first attempt without any repair call', async () => {
    process.env.PHASE3_STRUCTURED_FUSION = 'true';
    mocks.fusionTexts = ['raw-first-attempt-text'];
    mocks.fusionObjects = [groundedAnswer];

    const result = await synthesizeCommitteeAnswer({
      mode: 'full',
      prompt: 'Full committee analysis',
      packet,
      opinions,
      executionStats: [],
      requestContext,
      deps,
    });

    expect(result.finalText).toBe(renderFusionAnswer(FusionAnswerSchema.parse(groundedAnswer)));
    expect(result.finalText).not.toBe('raw-first-attempt-text');
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });

  it('verifies the rendered structured repair and fails closed when it still hallucinates', async () => {
    process.env.PHASE3_STRUCTURED_FUSION = 'true';
    // The single queued object repeats for the repair, so the rendered
    // repair markdown still contains the unsupported 12345.
    mocks.fusionTexts = ['raw-first-attempt-text'];
    mocks.fusionObjects = [hallucinatedAnswer];

    await expect(
      synthesizeCommitteeAnswer({
        mode: 'full',
        prompt: 'Full committee analysis',
        packet,
        opinions,
        executionStats: [],
        requestContext,
        deps,
      }),
    ).rejects.toBeInstanceOf(MastraModeStrictFailureError);
    expect(mocks.generate).toHaveBeenCalledTimes(2);
  });
});
