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

// Alert-relevant scalar read from one indicator series value.
//
// Structured indicators expose several sub-series; alerts compare the same
// canonical field as the live evaluator (MACD line, Bollinger middle, pivot
// point). Shared by the live reader and the historical simulator so a preview
// can never disagree with what the alert will actually watch.

export interface IndicatorScalar {
  value: number;
  /** Sub-series label used in the reading source, e.g. `bollinger.middle`. */
  field?: string;
}

export function indicatorScalar(
  value: number | Record<string, number | null> | null | undefined,
): IndicatorScalar | null {
  if (typeof value === 'number' && Number.isFinite(value)) return { value };
  if (!value || typeof value !== 'object') return null;
  if (typeof value['macd'] === 'number') return { value: value['macd'], field: 'macd' };
  if (typeof value['middle'] === 'number') {
    return { value: value['middle'], field: 'bollinger.middle' };
  }
  if (typeof value['pp'] === 'number') return { value: value['pp'], field: 'pivots.pp' };
  return null;
}
