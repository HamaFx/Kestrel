// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import { committeeProgressSnapshot } from '../src/mastra-v2/shared/progress';

describe('committeeProgressSnapshot', () => {
  it('emits the AgentProgress shape for a running specialist in full mode', () => {
    const snapshot = committeeProgressSnapshot('full', 'fundamental');
    expect(snapshot.mode).toBe('full');
    expect(snapshot.agents.map((a) => a.agentName)).toEqual([
      'technical',
      'fundamental',
      'risk',
      'sentiment',
    ]);
    expect(snapshot.agents.map((a) => a.status)).toEqual(['done', 'running', 'pending', 'pending']);
    expect(snapshot).not.toHaveProperty('step');
  });

  it('keeps specialists pending during collect-packet and marks them done on complete', () => {
    expect(committeeProgressSnapshot('full', 'collect-packet').agents.map((a) => a.status)).toEqual(
      ['pending', 'pending', 'pending', 'pending'],
    );
    expect(committeeProgressSnapshot('single', 'technical', 'complete')).toMatchObject({
      status: 'complete',
      agents: [{ agentName: 'technical', status: 'done' }],
    });
    expect(committeeProgressSnapshot('full', 'risk', 'failed').agents[2]).toEqual({
      agentName: 'risk',
      status: 'error',
    });
  });

  it('attaches structured specialist opinions when provided on completion', () => {
    const snapshot = committeeProgressSnapshot('full', 'fusion', 'complete', [
      {
        agentName: 'technical',
        bias: 'bullish',
        confidence: 0.82,
        reasoning: 'EMA20 above EMA50',
      },
      {
        agentName: 'fundamental',
        bias: 'neutral',
        confidence: 0.6,
        reasoning: 'CPI in line with expectations',
      },
    ]);
    expect(snapshot.status).toBe('complete');
    expect(snapshot.agents[0]?.opinion).toEqual({
      agentName: 'technical',
      bias: 'bullish',
      confidence: 0.82,
      reasoning: 'EMA20 above EMA50',
      summary: 'EMA20 above EMA50',
    });
    expect(snapshot.agents[1]?.opinion?.bias).toBe('neutral');
  });

  it('labels a multi-symbol comparison run with its symbols and omits the field otherwise (M-01)', () => {
    const comparison = committeeProgressSnapshot('single', 'technical', undefined, undefined, [
      'EURUSD',
      'XAUUSD',
    ]);
    expect(comparison.comparisonSymbols).toEqual(['EURUSD', 'XAUUSD']);

    // A single symbol is an ordinary single-desk run, not a comparison.
    const single = committeeProgressSnapshot('single', 'technical', undefined, undefined, [
      'EURUSD',
    ]);
    expect(single).not.toHaveProperty('comparisonSymbols');

    const full = committeeProgressSnapshot('full', 'technical');
    expect(full).not.toHaveProperty('comparisonSymbols');
  });

  it('carries the executing stage so the UI can illuminate the circuit spine', () => {
    const critique = committeeProgressSnapshot('full', 'critique');
    expect(critique.stage).toBe('critique');
    // Every specialist has finished by the critique round.
    expect(critique.agents.map((a) => a.status)).toEqual(['done', 'done', 'done', 'done']);

    expect(committeeProgressSnapshot('full', 'collect-packet').stage).toBe('collect-packet');
    expect(committeeProgressSnapshot('full', 'verify').stage).toBe('verify');
    expect(committeeProgressSnapshot('full', 'fusion', 'complete').stage).toBe('fusion');
  });

  it('attaches cross-examination critiques when provided', () => {
    const critiques = [
      {
        agentName: 'risk',
        confirms: false,
        revisedConfidence: 0.92,
        critique: 'Tight 2,852 stop is inside 1H ATR noise. Widened invalidation to 2,846.50.',
      },
    ];
    const snapshot = committeeProgressSnapshot(
      'full',
      'fusion',
      'complete',
      [
        {
          agentName: 'technical',
          bias: 'bullish',
          confidence: 0.88,
          reasoning: '15m FVG sweep',
        },
      ],
      undefined,
      critiques,
    );
    expect(snapshot.critiques).toEqual(critiques);
    expect(snapshot.status).toBe('complete');

    // No critiques → the field is omitted (older emitters stay valid).
    expect(committeeProgressSnapshot('full', 'fusion', 'complete')).not.toHaveProperty('critiques');
  });
});
