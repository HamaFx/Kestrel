import { describe, expect, it } from 'vitest';

import { verifyMastraOpinion } from '../src/mastra';

const packet = {
  symbol: 'XAUUSD',
  status: 'ready',
} as never;

const opinion = {
  agentName: 'technical',
  bias: 'bullish',
  confidence: 0.7,
  reasoning: 'Structure remains constructive.',
  rawData: {},
  model: 'test/model',
  providerId: 'test',
  inputTokens: 1,
  outputTokens: 1,
  costUsd: 0,
  latencyMs: 1,
} as {
  agentName: 'technical';
  bias: 'bullish';
  confidence: number;
  reasoning: string;
  rawData: Record<string, unknown>;
  model: string;
  providerId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
};

describe('Mastra opinion verifier', () => {
  it('accepts a bounded opinion over a ready packet', () => {
    expect(verifyMastraOpinion(opinion, packet)).toEqual({ ok: true, findings: [] });
  });

  it('rejects numeric reasoning when the packet is unavailable', () => {
    expect(
      verifyMastraOpinion(
        { ...opinion, reasoning: 'Price is 2500.' } as never,
        { symbol: 'XAUUSD', status: 'blocked' } as never,
      ),
    ).toMatchObject({ ok: false });
  });
});
