import { describe, expect, it } from 'vitest';

import { terminalActionForFullAnalysis } from '../src/jobs/full-analysis-lifecycle.js';

describe('terminalActionForFullAnalysis', () => {
  it('completes a provider-successful run', () => {
    expect(
      terminalActionForFullAnalysis({ hasResult: true, leaseLost: false, cancelled: false }),
    ).toBe('complete');
  });

  it('fails a run without a result', () => {
    expect(
      terminalActionForFullAnalysis({ hasResult: false, leaseLost: false, cancelled: false }),
    ).toBe('fail');
  });

  it('cancels an aborted run without a result', () => {
    expect(
      terminalActionForFullAnalysis({ hasResult: false, leaseLost: false, cancelled: true }),
    ).toBe('cancel');
  });

  it('discards lease-lost attempts before cancellation or completion', () => {
    expect(
      terminalActionForFullAnalysis({ hasResult: true, leaseLost: true, cancelled: true }),
    ).toBe('discard-lease-loss');
  });
});
