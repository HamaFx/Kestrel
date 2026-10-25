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

// Previous-day and Asian-session levels, derived bar by bar.

import type { FeatureMatrix } from './feature-types';

function utcDayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear().toString().padStart(4, '0')}-${(d.getUTCMonth() + 1)
    .toString()
    .padStart(2, '0')}-${d.getUTCDate().toString().padStart(2, '0')}`;
}

export function applySessionLevels(matrix: FeatureMatrix): void {
  const { t } = matrix.bars;
  const { h, l } = matrix.bars;
  const { pdh, pdl, asianHigh, asianLow } = matrix.smc;

  let dayKey = '';
  let dayHigh = Number.NEGATIVE_INFINITY;
  let dayLow = Number.POSITIVE_INFINITY;
  let prevDayHigh = 0;
  let prevDayLow = 0;

  let asianSessionHigh = Number.NEGATIVE_INFINITY;
  let asianSessionLow = Number.POSITIVE_INFINITY;
  let prevAsianHigh = 0;
  let prevAsianLow = 0;
  let asianComplete = false;

  for (let i = 0; i < t.length; i += 1) {
    const ms = t[i]!;
    const key = utcDayKey(ms);
    const hour = new Date(ms).getUTCHours();

    if (key !== dayKey) {
      if (dayKey !== '') {
        prevDayHigh = dayHigh;
        prevDayLow = dayLow;
        prevAsianHigh = asianSessionHigh;
        prevAsianLow = asianSessionLow;
      }
      dayKey = key;
      dayHigh = h[i]!;
      dayLow = l[i]!;
      asianSessionHigh = Number.NEGATIVE_INFINITY;
      asianSessionLow = Number.POSITIVE_INFINITY;
      asianComplete = false;
    } else {
      if (h[i]! > dayHigh) dayHigh = h[i]!;
      if (l[i]! < dayLow) dayLow = l[i]!;
    }

    if (hour < 7) {
      if (h[i]! > asianSessionHigh) asianSessionHigh = h[i]!;
      if (l[i]! < asianSessionLow) asianSessionLow = l[i]!;
    } else if (!asianComplete && Number.isFinite(asianSessionHigh)) {
      asianComplete = true;
    }

    pdh[i] = prevDayHigh;
    pdl[i] = prevDayLow;
    if (asianComplete) {
      asianHigh[i] = asianSessionHigh;
      asianLow[i] = asianSessionLow;
    } else {
      asianHigh[i] = prevAsianHigh;
      asianLow[i] = prevAsianLow;
    }
  }
}
