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

import { guardXauusdFollowupText } from '../src/mastra-v2/agents/xauusd/followup-safety';
import type { XauusdResearchReport } from '../src/mastra-v2/agents/xauusd/report/report-types';
import type { XauusdResearchPacket } from '../src/mastra-v2/packets/research-types';

const report = {
  numericClaims: [{ label: 'price', value: 2400, evidenceId: 'price-1', tolerance: 0.01 }],
} as unknown as XauusdResearchReport;
const packet = {
  packetId: 'packet-1',
  status: 'ready',
  price: null,
} as unknown as XauusdResearchPacket;

describe('guardXauusdFollowupText', () => {
  it('keeps explanations that use trusted report numbers', () => {
    expect(
      guardXauusdFollowupText('The invalidation is below gold at 2400.', report, packet),
    ).toContain('2400');
  });

  it('fails closed for a new unsupported market number', () => {
    const text = guardXauusdFollowupText('Gold should break resistance at 9999.', report, packet);
    expect(text).toContain('stopped');
    expect(text).not.toContain('9999');
  });

  // — P1-11: parsed numeric sets instead of raw substring matching ———————

  it('no longer lets a substring of a trusted number pass (240 vs 2400)', () => {
    // The old raw `includes` check allowed "240" because "2400" contains it.
    const text = guardXauusdFollowupText('Gold support sits at 240.', report, packet);
    expect(text).toContain('stopped');
    expect(text).not.toContain('240.');
  });

  it('accepts comma-formatted trusted numbers as parsed values', () => {
    expect(
      guardXauusdFollowupText('The invalidation is below gold at 2,400.', report, packet),
    ).toContain('2,400');
  });

  it('fails closed for a comma-formatted unsupported number', () => {
    const text = guardXauusdFollowupText('Resistance is at 9,999 for gold.', report, packet);
    expect(text).toContain('stopped');
    expect(text).not.toContain('9,999');
  });

  it('guards order-intent verbs near a number (enter/buy/sell/exit/add/reduce)', () => {
    // "enter" carries the market context without a classic market noun.
    const entered = guardXauusdFollowupText('I would enter above 2500.', report, packet);
    expect(entered).toContain('stopped');
    const bought = guardXauusdFollowupText('Should I sell at 2600?', report, packet);
    expect(bought).toContain('stopped');
  });

  it('keeps order-intent phrasing when the number is trusted', () => {
    expect(guardXauusdFollowupText('You said to enter at 2400 — why?', report, packet)).toContain(
      '2400',
    );
  });

  it('requires exact parsed matches: 2400.5 is not the trusted 2400', () => {
    const text = guardXauusdFollowupText('Gold trades at 2400.5 right now.', report, packet);
    expect(text).toContain('stopped');
  });
});
