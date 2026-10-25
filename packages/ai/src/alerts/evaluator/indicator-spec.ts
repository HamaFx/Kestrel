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

// Indicator-spec parsing for `indicatorCross` alerts (DEC-05 split from
// evaluator.ts). Accepts `kind` or `kind:param[,param[,param]]` and maps the
// positional numbers to the indicator's named parameters.

import { indicatorRegistry } from '@kestrel/indicators';
import type { IndicatorKind } from '@kestrel/shared';

import { syncPluginIndicators } from '../../plugins/indicators';

/**
 * Build the indicator-spec pattern from the registry at call time.
 *
 * The previous hardcoded regex silently ignored plugin indicators even when
 * they were registered. Reading `indicatorRegistry.listKinds()` means a new
 * indicator (core or plugin) becomes alert-addressable with no edit here.
 */
function indicatorSpecPattern(): RegExp {
  // Make plugin-declared kinds alert-addressable before reading the registry.
  syncPluginIndicators();
  const kinds = indicatorRegistry
    .listKinds()
    .map((kind) => String(kind))
    .filter((kind) => /^[a-z][a-z0-9_]*$/i.test(kind))
    .sort((a, b) => b.length - a.length)
    .map((kind) => kind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // `(?!)` never matches, so an empty registry fails closed.
  const alternation = kinds.length > 0 ? kinds.join('|') : '(?!)';
  return new RegExp(`^(${alternation})(?::([0-9]+(?:,[0-9]+){0,2}))?$`, 'i');
}

export function parseIndicatorSpec(
  spec: string,
): { kind: IndicatorKind; params: Record<string, number> } | null {
  if (typeof spec !== 'string') return null;
  const m = indicatorSpecPattern().exec(spec.trim());
  if (!m) return null;
  const kind = m[1]!.toLowerCase() as IndicatorKind;
  if (!indicatorRegistry.has(kind)) return null;
  const nums = (m[2] ?? '')
    .split(',')
    .filter((s) => s.length > 0)
    .map(Number);
  if (nums.some((n) => !Number.isFinite(n) || n <= 0)) return null;

  if (kind === 'macd') {
    return {
      kind,
      params: {
        fast: nums[0] ?? 12,
        slow: nums[1] ?? 26,
        signal: nums[2] ?? 9,
      },
    };
  }
  if (kind === 'bollinger') {
    return { kind, params: { period: nums[0] ?? 20, multiplier: nums[1] ?? 2 } };
  }
  if (kind === 'pivots') {
    if (nums.length > 0) return null;
    return { kind, params: {} };
  }
  // sma, ema, rsi, atr — single optional period.
  if (nums.length > 1) return null;
  return { kind, params: { period: nums[0] ?? defaultPeriod(kind) } };
}

function defaultPeriod(kind: IndicatorKind): number {
  return kind === 'rsi' || kind === 'atr' ? 14 : 20;
}
