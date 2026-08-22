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

import { guardXauusdFollowupText } from '../src/mastra/followup-safety';
import type { XauusdResearchReport } from '../src/mastra/report-types';
import type { XauusdResearchPacket } from '../src/mastra/research-types';

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
});
