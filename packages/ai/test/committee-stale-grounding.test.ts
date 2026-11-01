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

// Audit 2026-10-31 (R8): the committee grounding path shares the freshness
// rule. A specialist desk's own tool output only grounds a number when the
// emitter did not disclose it as stale; a number that also appears in a fresh
// tool output stays grounded.

import { describe, expect, it } from 'vitest';

import { extractNumbersFromToolOutput, isSupportedByEvidence } from '../src/committee/grounding';
import { verifyMastraOpinion } from '../src/committee/verifier';

function priceOutput(stale: boolean, ageSeconds: number, warnings: string[] = []) {
  return {
    ticks: [
      {
        symbol: 'XAUUSD',
        bid: 2649.8,
        ask: 2650.6,
        mid: 2650.4,
        ts: 1760000000000,
        source: 'biquote',
      },
    ],
    asOf: '2026-11-01T12:00:00.000Z',
    freshness: [
      { symbol: 'XAUUSD', source: 'biquote', stale, producedAt: 1760000000000, ageSeconds },
    ],
    warnings,
  };
}

const staleOutput = priceOutput(true, 812, [
  'XAUUSD: the quote was served from a stale cache after an upstream failure (age 812s) — do not present it as a live price.',
]);

const freshOutput = priceOutput(false, 3);

const staleCandles = {
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
};

const readyPacket = {
  symbol: 'XAUUSD',
  status: 'ready',
  timeframes: [],
  price: { tick: { bid: 2648.2, ask: 2648.4, mid: 2648.3 } },
} as never;

const opinion = {
  agentName: 'technical',
  bias: 'bullish',
  confidence: 0.7,
  reasoning: 'Session high sits at 2650.4.',
  rawData: {},
  model: 'test/model',
  providerId: 'test',
  inputTokens: 1,
  outputTokens: 1,
  costUsd: 0,
  latencyMs: 1,
} as {
  agentName: 'technical';
  bias: 'bullish';
  confidence: number;
  reasoning: string;
  rawData: Record<string, unknown>;
  model: string;
  providerId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
};

describe('committee grounding — stale tool outputs (R8)', () => {
  it('drops a value whose envelope says the quote was stale', () => {
    const values = extractNumbersFromToolOutput(staleOutput);
    expect(values).not.toContain(2650.4);
    expect(isSupportedByEvidence(2650.4, values)).toBe(false);
  });

  it('keeps a value from a fresh envelope', () => {
    const values = extractNumbersFromToolOutput(freshOutput);
    expect(isSupportedByEvidence(2650.4, values)).toBe(true);
  });

  it('keeps a value that also appears in a fresh tool output', () => {
    const merged = [
      ...extractNumbersFromToolOutput(staleOutput),
      ...extractNumbersFromToolOutput(freshOutput),
    ];
    expect(isSupportedByEvidence(2650.4, merged)).toBe(true);
  });

  it('drops a stale candle window, including its summary close', () => {
    const values = extractNumbersFromToolOutput(staleCandles);
    expect(isSupportedByEvidence(2648.2, values)).toBe(false);
  });

  it('rejects a desk opinion grounded only in a stale tool output', () => {
    const verification = verifyMastraOpinion(
      {
        ...opinion,
        rawData: { toolEvidenceValues: extractNumbersFromToolOutput(staleOutput) },
      } as never,
      readyPacket,
    );
    expect(verification.ok).toBe(false);
    expect(verification.findings.join(' ')).toContain('2650.4');
  });

  it('accepts the same opinion when the tool output was fresh', () => {
    const verification = verifyMastraOpinion(
      {
        ...opinion,
        rawData: { toolEvidenceValues: extractNumbersFromToolOutput(freshOutput) },
      } as never,
      readyPacket,
    );
    expect(verification).toEqual({ ok: true, findings: [] });
  });

  it('leaves outputs without a freshness envelope untouched', () => {
    expect(extractNumbersFromToolOutput({ symbol: 'XAUUSD', price: 2650.4 })).toContain(2650.4);
    // Packet-style `freshness: 'fresh'` strings are provenance labels, not envelopes.
    expect(extractNumbersFromToolOutput({ freshness: 'fresh', mid: 2650.4 })).toContain(2650.4);
  });
});
