import { describe, expect, it } from 'vitest';

import { SPECIALIST_DEFINITIONS } from '../src/committee/specialists';
import { verifyMastraOpinion } from '../src/mastra-v2';

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

describe('Mastra opinion verifier numeric grounding (P0-2 & Audit v3 Phase 4)', () => {
  const readyPacket = {
    symbol: 'XAUUSD',
    status: 'ready',
    timeframes: [],
    price: { tick: { bid: 2648.2, ask: 2648.4, mid: 2648.3 } },
  } as never;

  it('rejects a specialist reasoning that invents a price absent from packet evidence', () => {
    const verification = verifyMastraOpinion(
      { ...opinion, reasoning: 'Support sits at 9999 on the 1h.' } as never,
      readyPacket,
    );
    expect(verification.ok).toBe(false);
    expect(verification.findings.join(' ')).toContain('9999');
  });

  it('accepts a specialist reasoning whose price is grounded in packet evidence', () => {
    expect(
      verifyMastraOpinion({ ...opinion, reasoning: 'Holding above 2648.3.' } as never, readyPacket),
    ).toEqual({ ok: true, findings: [] });
  });

  it('rejects ungrounded support/resistance prices inside rawData.keyLevels (P1-5)', () => {
    const verification = verifyMastraOpinion(
      {
        ...opinion,
        reasoning: 'Holding above 2648.3.',
        rawData: {
          keyLevels: [{ price: 8888.5, kind: 'support' }],
        },
      } as never,
      readyPacket,
    );
    expect(verification.ok).toBe(false);
    expect(verification.findings.join(' ')).toContain('8888.5');
  });

  it('accepts numbers grounded in the specialist own tool outputs (Q8 toolEvidenceValues)', () => {
    const verification = verifyMastraOpinion(
      {
        ...opinion,
        reasoning: 'Session high sits at 2662.5 while holding 2648.3.',
        rawData: {
          toolEvidenceValues: [2662.5],
          keyLevels: [{ price: 2662.5, kind: 'resistance' }],
        },
      } as never,
      readyPacket,
    );
    expect(verification).toEqual({ ok: true, findings: [] });
  });

  it('assigns each of the 4 specialist desks its own goal, skillPlaybook, and dedicated toolNames (Q8)', () => {
    for (const desk of ['technical', 'fundamental', 'risk', 'sentiment'] as const) {
      const def = SPECIALIST_DEFINITIONS[desk];
      expect(def.goal.length).toBeGreaterThan(20);
      expect(def.skillPlaybook).toContain('Skill Playbook');
      expect(def.toolNames.length).toBeGreaterThanOrEqual(5);
    }
    expect(SPECIALIST_DEFINITIONS.fundamental.toolNames).toContain('get_news');
    expect(SPECIALIST_DEFINITIONS.fundamental.toolNames).toContain('get_calendar');
    expect(SPECIALIST_DEFINITIONS.sentiment.toolNames).toContain('get_cot');
    expect(SPECIALIST_DEFINITIONS.sentiment.toolNames).toContain('get_social_sentiment');
    expect(SPECIALIST_DEFINITIONS.technical.toolNames).toContain('get_market_structure');
    expect(SPECIALIST_DEFINITIONS.risk.toolNames).toContain('compute_risk');
  });
});

describe('Mastra opinion verifier temporal disclosure (P1-01)', () => {
  const degradedPacket = {
    symbol: 'XAUUSD',
    status: 'ready',
    dataQuality: 'degraded',
    warnings: ['Candles were served from stale-while-error cache'],
    missingData: [],
    timeframes: [],
    price: { tick: { bid: 2648.2, ask: 2648.4, mid: 2648.3 } },
  } as never;

  it('rejects a non-disclosing opinion over a degraded packet', () => {
    const verification = verifyMastraOpinion(
      { ...opinion, reasoning: 'Structure remains constructive.' } as never,
      degradedPacket,
    );
    expect(verification.ok).toBe(false);
    expect(verification.findings.join(' ')).toContain('does not disclose');
  });

  it('accepts a reasoning that discloses the degraded data', () => {
    expect(
      verifyMastraOpinion(
        {
          ...opinion,
          reasoning: 'Structure remains constructive, though candle data is stale.',
        } as never,
        degradedPacket,
      ),
    ).toEqual({ ok: true, findings: [] });
  });

  it('accepts an explicit rawData.missingEvidence list instead of a reasoning sentence', () => {
    expect(
      verifyMastraOpinion(
        {
          ...opinion,
          rawData: { missingEvidence: ['Candles are stale after a provider failover.'] },
        } as never,
        degradedPacket,
      ),
    ).toEqual({ ok: true, findings: [] });
  });

  it('leaves complete, warning-free packets unchanged', () => {
    expect(verifyMastraOpinion(opinion, packet)).toEqual({ ok: true, findings: [] });
  });
});
