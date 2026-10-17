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
    expect(snapshot.agents.map((a) => a.status)).toEqual([
      'done',
      'running',
      'pending',
      'pending',
    ]);
    expect(snapshot).not.toHaveProperty('step');
  });

  it('keeps specialists pending during collect-packet and marks them done on complete', () => {
    expect(committeeProgressSnapshot('full', 'collect-packet').agents.map((a) => a.status)).toEqual([
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
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
});
