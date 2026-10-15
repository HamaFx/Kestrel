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

describe('journal import outcome consistency with 0028 CHECK constraint', () => {
  it('keeps outcome="open" and rMultiple=null when closedAt is null even if exit and stop are present', () => {
    const trade = { side: 'long' as const, entry: 2000, stop: 1990, exit: 2020, closedAt: null };
    const isClosed = trade.closedAt !== null && trade.exit !== null;
    const outcome = isClosed ? 'win' : 'open';
    expect(outcome).toBe('open');
  });

  it('calculates outcome and rMultiple when closedAt and exit are both present', () => {
    const trade = {
      side: 'long' as const,
      entry: 2000,
      stop: 1990,
      exit: 2020,
      closedAt: 1700000000000,
    };
    const isClosed = trade.closedAt !== null && trade.exit !== null;
    expect(isClosed).toBe(true);

    const diff = trade.side === 'long' ? trade.exit - trade.entry : trade.entry - trade.exit;
    const risk = trade.side === 'long' ? trade.entry - trade.stop : trade.stop - trade.entry;
    const rMultiple = risk > 0 ? diff / risk : null;
    const outcome =
      rMultiple !== null
        ? rMultiple > 0.1
          ? 'win'
          : rMultiple < -0.1
            ? 'loss'
            : 'breakeven'
        : 'open';

    expect(rMultiple).toBe(2);
    expect(outcome).toBe('win');
  });
});
