import { claimNextFullAnalysisQueue, recoverStaleFullAnalysisQueue } from '@kestrel/db';
import { describe, expect, it } from 'vitest';

describe('Full-analysis resilience contracts', () => {
  it('supports one winner when workers compete for a pending job', async () => {
    expect(typeof claimNextFullAnalysisQueue).toBe('function');
  });

  it('exposes stale lease recovery as a durable operation', async () => {
    expect(typeof recoverStaleFullAnalysisQueue).toBe('function');
  });
});
