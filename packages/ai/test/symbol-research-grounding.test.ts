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

import { describe, expect, it } from 'vitest';

import {
  assertCanonicalEvidence,
  CanonicalEvidenceBlockedError,
  checkCanonicalEvidence,
} from '../src/mastra-v2/agents/canonical/evidence';

describe('symbol research conversation grounding (P1-05)', () => {
  const dummyPacket = {
    packetId: 'packet-1',
    symbol: 'XAUUSD',
    price: {
      data: {
        tick: { bid: 2650.2, ask: 2650.6, mid: 2650.4 },
      },
    },
    timeframes: [
      {
        timeframe: '1h',
        candles: [{ o: 2640.0, h: 2655.0, l: 2638.0, c: 2650.4 }],
      },
    ],
  };

  const toolEvidence = [
    { name: 'symbol_research_packet', resultText: JSON.stringify(dummyPacket) },
  ];

  it('allows conversation text whose numbers are grounded in the packet', () => {
    const text = 'Gold is trading at 2650.4, with the 1h high at 2655.0 and low at 2638.0.';
    const check = checkCanonicalEvidence(text, toolEvidence);
    expect(check.ok).toBe(true);
    expect(() => assertCanonicalEvidence(check)).not.toThrow();
  });

  it('blocks conversation text containing hallucinated price levels', () => {
    const text = 'Gold is at 2650.4, but key resistance is at 2890.5 and support at 2510.0.';
    const check = checkCanonicalEvidence(text, toolEvidence);
    expect(check.ok).toBe(false);
    expect(check.findings.some((f) => f.includes('2890.5'))).toBe(true);
    expect(() => assertCanonicalEvidence(check)).toThrow(CanonicalEvidenceBlockedError);
  });
});
