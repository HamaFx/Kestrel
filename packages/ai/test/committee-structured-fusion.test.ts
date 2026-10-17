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

// Audit plan §3.3 — structured fusion (opt-in via PHASE3_STRUCTURED_FUSION).
// The parsed object renders deterministic markdown; the grounding verifier
// still runs on the rendered text (Q3 strict).

import { beforeEach, describe, expect, it } from 'vitest';

import { FusionAnswerSchema, renderFusionAnswer } from '../src/committee/synthesizer';

const validAnswer = {
  bottomLine: 'Cautious bullish tilt while above 2648.',
  reasoning: 'Technical holds the level with RSI at 61; peers agree after review.',
  risks: ['A close below 2648 invalidates the tilt.'],
  invalidation: 'Daily close below 2648.',
  scenarioTable: [
    { scenario: 'Continuation', bias: 'bullish' as const, trigger: 'Hold above 2648' },
    { scenario: 'Reversal', bias: 'bearish' as const, trigger: 'Break below 2648' },
  ],
};

describe('structured fusion (§3.3)', () => {
  beforeEach(() => {
    delete process.env.PHASE3_STRUCTURED_FUSION;
  });

  it('validates the structured answer shape', () => {
    expect(FusionAnswerSchema.safeParse(validAnswer).success).toBe(true);
    expect(FusionAnswerSchema.safeParse({ ...validAnswer, risks: [] }).success).toBe(false);
    expect(FusionAnswerSchema.safeParse({ ...validAnswer, scenarioTable: [] }).success).toBe(false);
  });

  it('renders deterministic markdown with a scenario table', () => {
    const markdown = renderFusionAnswer(FusionAnswerSchema.parse(validAnswer));
    expect(markdown).toContain('**Bottom line:** Cautious bullish tilt while above 2648.');
    expect(markdown).toContain('| Scenario | Bias | Trigger |');
    expect(markdown).toContain('| Continuation | bullish | Hold above 2648 |');
    expect(markdown).toContain('**Invalidation:** Daily close below 2648.');
    expect(markdown).toContain('- A close below 2648 invalidates the tilt.');
  });
});
