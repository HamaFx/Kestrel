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

// HCNSEC tool-argument repair.

/** Default indicator bundle used when HCNSEC omits the required list. */
const HCNSEC_DEFAULT_INDICATORS = [
  { kind: 'rsi', params: {} },
  { kind: 'macd', params: {} },
  { kind: 'ema', params: { period: 20 } },
  { kind: 'ema', params: { period: 50 } },
] as const;

/**
 * Normalize HCNSEC's common aliases to Kestrel tool-input names.
 *
 * DeepSeek-compatible endpoints are often trained/documented with
 * `timeframe`/`limit`, while Kestrel's schemas intentionally use the
 * shorter `tf`/`count` names. HCNSEC has also emitted a bare
 * `get_indicators` call without an indicator list. Repairing that payload
 * at the provider boundary keeps the canonical tool schemas strict for
 * every other provider while making this provider interoperable.
 */
export function normalizeHcnsecToolArguments(toolName: string, rawArguments: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArguments) as unknown;
  } catch {
    return rawArguments;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return rawArguments;

  const args = { ...(parsed as Record<string, unknown>) };
  if (args.tf === undefined && typeof args.timeframe === 'string') {
    args.tf = args.timeframe;
    delete args.timeframe;
  }
  if (args.count === undefined && args.limit !== undefined) {
    args.count = args.limit;
    delete args.limit;
  }
  if (toolName === 'get_indicators' && !Array.isArray(args.indicators)) {
    args.indicators = HCNSEC_DEFAULT_INDICATORS;
  }
  return JSON.stringify(args);
}
