import { describe, expect, it } from 'vitest';

import { createGenerationLedger, restoreGenerationLedger } from '../src/generation-ledger';

describe('createGenerationLedger', () => {
  it('aggregates each generation once by id', () => {
    const ledger = createGenerationLedger();

    expect(ledger.recordCost('specialist:technical', 'specialist', 0.1)).toBe(true);
    expect(ledger.recordCost('fusion', 'fusion', 0.2)).toBe(true);
    expect(ledger.recordCost('fusion', 'fusion', 0.2)).toBe(false);

    expect(ledger.total()).toBeCloseTo(0.3);
    expect(ledger.snapshot().entries).toHaveLength(2);
  });

  it('round-trips and restores a durable snapshot without double counting', () => {
    const original = createGenerationLedger();
    original.recordCost('specialist:technical', 'specialist', 0.1);
    original.recordCost('fusion', 'fusion', 0.2);
    const restored = restoreGenerationLedger(original.snapshot());
    expect(restored.total()).toBeCloseTo(0.3);
    expect(restored.recordCost('fusion', 'fusion', 0.2)).toBe(false);
  });

  it('rejects invalid costs', () => {
    const ledger = createGenerationLedger();
    expect(() => ledger.recordCost('bad', 'primary', -1)).toThrow();
    expect(() => ledger.recordCost('bad', 'primary', Number.NaN)).toThrow();
  });
});
