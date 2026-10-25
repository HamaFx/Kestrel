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

// R-multiple math: realized R is computed at close time so the column is
// reliable. Open trades have rMultiple=null and don't contribute to avgR/winRate.

import type { TradeSide } from '@kestrel/shared';

/**
 * R-multiple = (exit - entry) / |entry - stop|, signed by direction.
 * For longs: positive when exit > entry. For shorts: positive when exit < entry.
 */
export function computeRMultiple(args: {
  side: TradeSide;
  entry: number;
  stop: number;
  exit: number;
}): number {
  const risk = Math.abs(args.entry - args.stop);
  if (risk === 0) return 0;
  const reward = args.side === 'long' ? args.exit - args.entry : args.entry - args.exit;
  return reward / risk;
}
