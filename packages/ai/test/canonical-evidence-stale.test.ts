/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// SPDX-License-Identifier: Apache-2.0

// Audit 2026-10-31 (R8): the numeric evidence gate must refuse a value whose
// only support is a tool output the emitter itself flagged stale (or older
// than the live window it documents). A value that also appears in a fresh
// output stays grounded, and outputs without a freshness envelope are gated
// exactly as before.

import { describe, expect, it } from 'vitest';

import {
  assertCanonicalEvidence,
  CANONICAL_EVIDENCE_BLOCKED_MESSAGE,
  CanonicalEvidenceBlockedError,
  canonicalEvidenceBlockedMessage,
  checkCanonicalEvidence,
  type CanonicalStaleDatum,
} from '../src/mastra-v2/agents/canonical/evidence';

interface StalePriceOverrides {
  stale?: boolean;
  ageSeconds?: number | null;
  warnings?: string[];
  mid?: number;
}

function priceTool(overrides: StalePriceOverrides = {}) {
  const { stale = true, ageSeconds = 812, warnings, mid = 2650.4 } = overrides;
  return {
    name: 'get_price',
    resultText: JSON.stringify({
      ticks: [
        {
          symbol: 'XAUUSD',
          bid: mid - 0.3,
          ask: mid + 0.3,
          mid,
          ts: 1760000000000,
          source: 'biquote',
        },
      ],
      asOf: '2026-11-01T12:00:00.000Z',
      freshness: [
        { symbol: 'XAUUSD', source: 'biquote', stale, producedAt: 1760000000000, ageSeconds },
      ],
      warnings: warnings ?? [],
    }),
  };
}

const stalePrice = priceTool();

const freshPrice = priceTool({ stale: false, ageSeconds: 3 });

const agedPrice = priceTool({
  stale: false,
  ageSeconds: 400,
  warnings: ['XAUUSD: the quote is 400s old (source biquote) — disclose that it is not live.'],
});

describe('canonical evidence gate — stale-only values (R8)', () => {
  it('refuses a claim whose only support is a stale-cache price', () => {
    const check = checkCanonicalEvidence('Gold is trading at 2650.4.', [stalePrice]);

    expect(check.ok).toBe(false);
    expect(check.staleData).toEqual<CanonicalStaleDatum[]>([
      { value: 2650.4, label: 'XAUUSD', reason: 'flagged', ageSeconds: 812 },
    ]);
    expect(check.findings.join(' ')).toContain('2650.4');
    expect(check.findings.join(' ')).toContain('stale');
    expect(() => assertCanonicalEvidence(check)).toThrow(CanonicalEvidenceBlockedError);
  });

  it('refuses a quote older than the live window the price tool documents', () => {
    const check = checkCanonicalEvidence('Gold is trading at 2650.4.', [agedPrice]);

    expect(check.ok).toBe(false);
    expect(check.staleData).toEqual<CanonicalStaleDatum[]>([
      { value: 2650.4, label: 'XAUUSD', reason: 'aged', ageSeconds: 400 },
    ]);
  });

  it('keeps a fresh-grounded answer', () => {
    expect(checkCanonicalEvidence('Gold is trading at 2650.4.', [freshPrice])).toEqual({
      ok: true,
      findings: [],
      numericClaimCount: 1,
    });
    expect(() =>
      assertCanonicalEvidence(checkCanonicalEvidence('Gold is trading at 2650.4.', [freshPrice])),
    ).not.toThrow();
  });

  it('keeps a value that also appears in a fresh source', () => {
    const freshCandles = {
      name: 'get_candles',
      resultText: JSON.stringify({
        symbol: 'XAUUSD',
        tf: '1h',
        candles: [],
        summary: { close: 2650.4 },
        freshness: {
          stale: false,
          producedAt: 1760000000000,
          ageSeconds: 4,
          lastClosedBarAgeSeconds: 30,
        },
        warnings: [],
      }),
    };

    const check = checkCanonicalEvidence('Gold is trading at 2650.4.', [stalePrice, freshCandles]);

    expect(check).toEqual({ ok: true, findings: [], numericClaimCount: 1 });
  });

  it('refuses a stale candle window but keeps a fresh symbol in the same output', () => {
    const multiSymbol = {
      name: 'get_price',
      resultText: JSON.stringify({
        ticks: [
          {
            symbol: 'XAUUSD',
            bid: 2649.8,
            ask: 2650.6,
            mid: 2650.4,
            ts: 1760000000000,
            source: 'biquote',
          },
          {
            symbol: 'EURUSD',
            bid: 1.0848,
            ask: 1.0852,
            mid: 1.085,
            ts: 1760000000000,
            source: 'biquote',
          },
        ],
        asOf: '2026-11-01T12:00:00.000Z',
        freshness: [
          {
            symbol: 'XAUUSD',
            source: 'biquote',
            stale: true,
            producedAt: 1760000000000,
            ageSeconds: 812,
          },
          {
            symbol: 'EURUSD',
            source: 'biquote',
            stale: false,
            producedAt: 1760000000000,
            ageSeconds: 2,
          },
        ],
        warnings: [
          'XAUUSD: the quote was served from a stale cache after an upstream failure (age 812s) — do not present it as a live price.',
        ],
      }),
    };

    expect(checkCanonicalEvidence('EURUSD is at 1.085.', [multiSymbol])).toMatchObject({
      ok: true,
      numericClaimCount: 1,
    });

    const staleOnly = checkCanonicalEvidence('XAUUSD is at 2650.4.', [multiSymbol]);
    expect(staleOnly.ok).toBe(false);
    expect(staleOnly.staleData?.[0]).toMatchObject({ label: 'XAUUSD', reason: 'flagged' });
  });

  it('refuses a stale candle window disclosed by get_candles', () => {
    const staleCandles = {
      name: 'get_candles',
      resultText: JSON.stringify({
        symbol: 'XAUUSD',
        tf: '1h',
        candles: [],
        summary: { close: 2648.2 },
        freshness: {
          stale: true,
          producedAt: 1760000000000,
          ageSeconds: 90,
          lastClosedBarAgeSeconds: 30,
        },
        warnings: [
          'XAUUSD 1h: the candle window was served from a stale cache after an upstream failure (age 90s) — recent bars may be missing; do not present it as the current window.',
        ],
      }),
    };

    const check = checkCanonicalEvidence('The 1h close was 2648.2.', [staleCandles]);
    expect(check.ok).toBe(false);
    expect(check.staleData).toEqual<CanonicalStaleDatum[]>([
      { value: 2648.2, label: 'XAUUSD 1h', reason: 'flagged', ageSeconds: 90 },
    ]);
  });

  it('leaves an output without a freshness envelope exactly as before', () => {
    const envelopeFree = { name: 'get_price', resultText: '{"price":2650.4}' };
    expect(checkCanonicalEvidence('Gold is trading at 2650.4.', [envelopeFree])).toEqual({
      ok: true,
      findings: [],
      numericClaimCount: 1,
    });
  });

  it('still refuses an invented value that matches no stale output either', () => {
    const check = checkCanonicalEvidence('Gold is trading at 9999.', [stalePrice]);
    expect(check.ok).toBe(false);
    expect(check.staleData).toBeUndefined();
    expect(check.findings.join(' ')).toContain('9999');
  });

  it('names the stale datum and age in the refusal message', () => {
    const check = checkCanonicalEvidence('Gold is trading at 2650.4.', [stalePrice]);
    let thrown: unknown;
    try {
      assertCanonicalEvidence(check);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(CanonicalEvidenceBlockedError);
    expect((thrown as Error).message).toBe(
      `${CANONICAL_EVIDENCE_BLOCKED_MESSAGE} XAUUSD was served from a stale cache (age 812s).`,
    );
    expect((thrown as CanonicalEvidenceBlockedError).staleData).toHaveLength(1);
  });

  it('falls back to the historical refusal sentence when nothing was stale', () => {
    expect(canonicalEvidenceBlockedMessage([])).toBe(CANONICAL_EVIDENCE_BLOCKED_MESSAGE);
  });
});
