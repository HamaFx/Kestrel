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

// Grade + go/no-go thresholds for the committee verdict set.

import type { CommitteeVerdict, ConveneCommitteeOutput } from '@kestrel/shared';

export function computeGradeAndGoNoGo(args: {
  side: 'long' | 'short';
  stop?: number;
  entry: number;
  target?: number;
  verdicts: CommitteeVerdict[];
}): { grade: ConveneCommitteeOutput['grade']; goNoGo: ConveneCommitteeOutput['goNoGo'] } {
  const { side, stop, entry, target, verdicts } = args;
  const desiredVerdict = side === 'long' ? 'bullish' : 'bearish';
  const alignedCount = verdicts.filter((v) => v.verdict === desiredVerdict).length;
  const opposedCount = verdicts.filter(
    (v) => v.verdict !== 'neutral' && v.verdict !== desiredVerdict,
  ).length;
  const validStop = stop !== undefined && (side === 'long' ? stop < entry : stop > entry);
  const rr =
    validStop && target !== undefined && Math.abs(entry - stop) > 0
      ? Math.abs(target - entry) / Math.abs(entry - stop)
      : null;

  if (!validStop && stop !== undefined) {
    return { grade: 'F', goNoGo: 'no-go' };
  }
  // Thresholds scale with the verdict count so the 3-verdict committee that
  // predates the dedicated sentiment desk grades exactly as it used to.
  const fullAlignment = verdicts.length;
  const strongAlignment = Math.max(2, verdicts.length - 1);
  const weakAlignment = Math.max(1, verdicts.length - 2);
  if (alignedCount === fullAlignment && validStop && (rr === null || rr >= 1.8)) {
    return { grade: 'A', goNoGo: 'go' };
  }
  if (alignedCount >= strongAlignment && (validStop || stop === undefined) && opposedCount === 0) {
    return { grade: 'B', goNoGo: validStop ? 'go' : 'caution' };
  }
  if (alignedCount >= weakAlignment && opposedCount <= 1) {
    return { grade: 'C', goNoGo: 'caution' };
  }
  return { grade: 'D', goNoGo: 'no-go' };
}
