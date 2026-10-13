import { describe, expect, it } from 'vitest';

import {
  assertCanonicalEvidence,
  CanonicalEvidenceBlockedError,
  checkCanonicalEvidence,
} from '../src/mastra';

const goldQuote = [{ name: 'get_gold_price', resultText: '{"symbol":"XAUUSD","price":2650.4}' }];

describe('canonical evidence check', () => {
  it('flags numeric market claims without market-data tools', () => {
    expect(checkCanonicalEvidence('Resistance is 2500.', [])).toMatchObject({
      ok: false,
      numericClaimCount: 1,
    });
  });

  it('allows numeric claims grounded in the market-data tool output', () => {
    expect(checkCanonicalEvidence('Gold is trading at 2650.4.', goldQuote)).toEqual({
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

  it('does not treat small integers, percentages, or scenario counts as market claims', () => {
    expect(checkCanonicalEvidence('Watch 2 scenarios; RSI near 62; size at 2.5% risk.', [])).toEqual(
      {
        ok: true,
        findings: [],
        numericClaimCount: 0,
      },
    );
  });
});

describe('canonical evidence gate (P0-3)', () => {
  it('blocks an ungrounded numeric answer instead of returning it', () => {
    expect(() => assertCanonicalEvidence(checkCanonicalEvidence('Gold is at 9999.', []))).toThrow(
      CanonicalEvidenceBlockedError,
    );
  });

  it('blocks a fabricated value even when a market-data tool ran', () => {
    const evidence = checkCanonicalEvidence('Gold is at 9999.', goldQuote);
    expect(evidence.ok).toBe(false);
    expect(evidence.findings.join(' ')).toContain('9999');
    expect(() => assertCanonicalEvidence(evidence)).toThrow(CanonicalEvidenceBlockedError);
  });

  it('does not block grounded numeric answers or date-only prose', () => {
    expect(() =>
      assertCanonicalEvidence(checkCanonicalEvidence('Gold is at 2650.', goldQuote)),
    ).not.toThrow();
    expect(() =>
      assertCanonicalEvidence(
        checkCanonicalEvidence('As of 2026-05-26 the trend is unchanged.', []),
      ),
    ).not.toThrow();
    expect(() =>
      assertCanonicalEvidence(
        checkCanonicalEvidence('Since 2024 the regime has been bullish.', []),
      ),
    ).not.toThrow();
  });
});
