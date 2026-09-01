import { describe, expect, it } from 'vitest';

import { checkCanonicalEvidence } from '../src/mastra';

describe('canonical evidence check', () => {
  it('flags numeric claims without market-data tools', () => {
    expect(checkCanonicalEvidence('Resistance is 2500.', [])).toMatchObject({
      ok: false,
      numericClaimCount: 1,
    });
  });

  it('allows numeric claims when a market-data tool was used', () => {
    expect(checkCanonicalEvidence('The price is 2500.', ['get_price'])).toEqual({
      ok: true,
      findings: [],
      numericClaimCount: 1,
    });
  });

  it('does not flag ordinary prose without numbers', () => {
    expect(checkCanonicalEvidence('The trend remains uncertain.', [])).toEqual({
      ok: true,
      findings: [],
      numericClaimCount: 0,
    });
  });
});
