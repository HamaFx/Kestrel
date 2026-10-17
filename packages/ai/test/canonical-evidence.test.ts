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

  it('recognizes all 13 canonical/specialist tools as market data tools (P1-06)', () => {
    const technicalResult = [
      { name: 'analyze_technical', resultText: '{"summary":{"trend":"bullish","rsi":65.5,"keyLevels":[2650.5]}}' },
    ];
    expect(checkCanonicalEvidence('RSI is at 65.5 and level is 2650.5.', technicalResult)).toEqual({
      ok: true,
      findings: [],
      numericClaimCount: 2,
    });

    const sessionResult = [
      { name: 'get_session_levels', resultText: '{"london":{"high":2665.2,"low":2630.1}}' },
    ];
    expect(checkCanonicalEvidence('London high was 2665.2.', sessionResult)).toEqual({
      ok: true,
      findings: [],
      numericClaimCount: 1,
    });

    const riskResult = [
      { name: 'compute_risk', resultText: '{"var95":1250.75}' },
    ];
    expect(checkCanonicalEvidence('Value at risk is 1250.75.', riskResult)).toEqual({
      ok: true,
      findings: [],
      numericClaimCount: 1,
    });

    const committeeResult = [
      { name: 'convene_committee', resultText: '{"fusion":{"entry":2645.5}}' },
    ];
    expect(checkCanonicalEvidence('Committee recommended entry at 2645.5.', committeeResult)).toEqual({
      ok: true,
      findings: [],
      numericClaimCount: 1,
    });
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

describe('canonical evidence check (P1-06 contextual claims)', () => {
  it('treats a market-context percentage as a checkable claim', () => {
    const text = 'Gold rallied 2.6% in the London session.';
    expect(checkCanonicalEvidence(text, [])).toMatchObject({
      ok: false,
      numericClaimCount: 1,
    });
    expect(
      checkCanonicalEvidence(text, [{ name: 'get_price', resultText: '{"changePct":2.6}' }]).ok,
    ).toBe(true);
    expect(
      checkCanonicalEvidence(text, [{ name: 'get_price', resultText: '{"changePct":0.4}' }]),
    ).toMatchObject({ ok: false, numericClaimCount: 1 });
  });

  it('treats signed percentages as claims without market context', () => {
    expect(checkCanonicalEvidence('Position change: +1.4%.', [])).toMatchObject({
      ok: false,
      numericClaimCount: 1,
    });
    expect(
      checkCanonicalEvidence('Position change: +1.4%.', [
        { name: 'get_price', resultText: '{"changePct":1.4}' },
      ]).ok,
    ).toBe(true);
  });

  it('keeps advice percentages and risk sizing free', () => {
    expect(
      checkCanonicalEvidence(
        'Keep per-trade risk at or below 1%; size the position at 0.5% of account equity.',
        [],
      ),
    ).toEqual({ ok: true, findings: [], numericClaimCount: 0 });
    expect(checkCanonicalEvidence('Risk 0.5%-1.0% of account equity.', [])).toMatchObject({
      ok: true,
      numericClaimCount: 0,
    });
  });

  it('treats small integers near market readings as claims', () => {
    expect(checkCanonicalEvidence('RSI is at 72.', [])).toMatchObject({
      ok: false,
      numericClaimCount: 1,
    });
    expect(
      checkCanonicalEvidence('RSI is at 72.', [
        { name: 'get_indicators', resultText: '{"rsi":71.6}' },
      ]).ok,
    ).toBe(true);
    expect(checkCanonicalEvidence('The 4-scenario plan covers 2 wins.', [])).toMatchObject({
      ok: true,
      numericClaimCount: 0,
    });
  });
});
