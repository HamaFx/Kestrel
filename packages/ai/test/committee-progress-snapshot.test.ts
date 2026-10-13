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

  it('marks every specialist done on complete and the current one as error on failure', () => {
    expect(committeeProgressSnapshot('single', 'technical', 'complete')).toMatchObject({
      status: 'complete',
      agents: [{ agentName: 'technical', status: 'done' }],
    });
    expect(committeeProgressSnapshot('full', 'risk', 'failed').agents[2]).toEqual({
      agentName: 'risk',
      status: 'error',
    });
  });
});
