import { describe, expect, it } from 'vitest';

import { summarizeConfidenceCalibration } from '../src/mastra';

describe('confidence calibration', () => {
  it('summarizes confidence against observed accuracy', () => {
    const summary = summarizeConfidenceCalibration([
      { confidence: 0.8, correct: true },
      { confidence: 0.6, correct: false },
    ]);
    expect(summary.count).toBe(2);
    expect(summary.meanConfidence).toBeCloseTo(0.7);
    expect(summary.accuracy).toBe(0.5);
    expect(summary.calibrationError).toBeCloseTo(0.2);
  });

  it('returns a neutral empty summary', () => {
    expect(summarizeConfidenceCalibration([])).toEqual({
      count: 0,
      meanConfidence: 0,
      accuracy: 0,
      calibrationError: 0,
    });
  });
});
