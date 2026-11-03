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

// F7 — the single per-tool deadline policy.
//
// The Mastra-native read-only path (`mastra-v2/shared/tool-telemetry.ts`)
// enforces this deadline table; keeping the values in a dependency-free leaf
// lets the wrapper import them without participating in the Mastra tool
// import cycle.

/** Custom error class for tool timeout detection. */
export class ToolTimeoutError extends Error {
  readonly code = 'TIMEOUT';

  constructor(toolName: string, ms: number) {
    super(`Tool ${toolName} timed out after ${ms}ms`);
    this.name = 'ToolTimeoutError';
  }
}

/** Default per-tool timeout in milliseconds. */
const DEFAULT_TOOL_TIMEOUT_MS = 25_000;

/** Per-tool timeout overrides for especially slow or fast tools (ms). */
const TOOL_TIMEOUT_OVERRIDES: Record<string, number> = {
  // Vision model analysis can take longer.
  analyze_chart_image: 45_000,
  // Historical backtests can be slow.
  replay_setup: 40_000,
  // Fast tools can be stricter.
  get_price: 5_000,
  get_candles: 10_000,
  get_indicators: 10_000,
};

/**
 * Resolve the deadline for one tool invocation. Accepts both the legacy
 * registry name (`get_price`) and the Mastra-native qualified id
 * (`kestrel-get_price`) so one override table serves both paths.
 */
export function resolveToolTimeoutMs(toolName: string): number {
  const bare = toolName.startsWith('kestrel-') ? toolName.slice('kestrel-'.length) : toolName;
  return (
    TOOL_TIMEOUT_OVERRIDES[toolName] ?? TOOL_TIMEOUT_OVERRIDES[bare] ?? DEFAULT_TOOL_TIMEOUT_MS
  );
}
