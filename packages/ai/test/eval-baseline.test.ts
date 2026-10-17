import { describe, expect, it } from 'vitest';

import {
  compareEvalBaseline,
  EVAL_BASELINE_RELATIVE_DROP_LIMIT,
  parseEvalBaseline,
  serializeEvalBaseline,
  type EvalBaselineArtifact,
} from '../src/eval/baseline';

const baseline: EvalBaselineArtifact = {
  schemaVersion: 'kestrel.eval-baseline.v1',
  generatedAt: '2026-10-11T03:00:00.000Z',
  runCount: 42,
  recordCount: 120,
  observed: { overallPassRate: 0.95, averageCitationScore: 0.92 },
};

describe('eval baseline artifact (audit plan §5.1)', () => {
  it('round-trips through serialize/parse', () => {
    const parsed = parseEvalBaseline(serializeEvalBaseline(baseline));
    expect(parsed).toEqual(baseline);
  });

  it('parse returns null for absent/empty artifacts', () => {
    expect(parseEvalBaseline(null)).toBeNull();
    expect(parseEvalBaseline('')).toBeNull();
    expect(parseEvalBaseline('   \n')).toBeNull();
  });

  it('rejects unknown schema versions loudly', () => {
    expect(() => parseEvalBaseline('{"schemaVersion":"kestrel.eval-baseline.v2"}')).toThrow(
      /schema/,
    );
    expect(() => serializeEvalBaseline({ ...baseline, schemaVersion: 'other' as never })).toThrow(
      /schema/,
    );
  });
});

describe('compareEvalBaseline relative-drop rule', () => {
  it('fails only when the drop exceeds 5% of the baseline value', () => {
    // 0.95 baseline → floor is 0.9025.
    expect(
      compareEvalBaseline(baseline, {
        overallPassRate: 0.93,
        averageCitationScore: 0.92,
      }).ok,
    ).toBe(true);
    const regressed = compareEvalBaseline(baseline, {
      overallPassRate: 0.9,
      averageCitationScore: 0.92,
    });
    expect(regressed.ok).toBe(false);
    expect(regressed.failures.join(' ')).toContain('overallPassRate');
  });

  it('compares citation only when both sides record a value', () => {
    const citationDrop = compareEvalBaseline(baseline, {
      overallPassRate: 0.95,
      averageCitationScore: 0.5,
    });
    expect(citationDrop.ok).toBe(false);
    expect(citationDrop.failures.join(' ')).toContain('averageCitationScore');

    const noCurrentCitation = compareEvalBaseline(baseline, {
      overallPassRate: 0.95,
      averageCitationScore: null,
    });
    expect(noCurrentCitation.ok).toBe(true);
  });

  it('never fails on improvements or zero baselines', () => {
    expect(compareEvalBaseline(baseline, { overallPassRate: 1, averageCitationScore: 1 }).ok).toBe(
      true,
    );
    expect(
      compareEvalBaseline(
        { ...baseline, observed: { overallPassRate: 0, averageCitationScore: null } },
        { overallPassRate: 0, averageCitationScore: null },
      ).ok,
    ).toBe(true);
  });

  it('documents the limit as 5 percent', () => {
    expect(EVAL_BASELINE_RELATIVE_DROP_LIMIT).toBe(0.05);
  });
});
