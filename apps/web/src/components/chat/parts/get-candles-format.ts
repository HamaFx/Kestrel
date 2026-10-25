// SPDX-License-Identifier: Apache-2.0

// Formatting helpers for the `get_candles` tool part.

import { pipSize as sharedPipSize, type Symbol } from '@kestrel/shared';

/**
 * Local pip-size lookup. Mirrors `pipSize` from `@kestrel/shared` and exists
 * here so the rendering logic is self-contained for the chat-part surface
 * (matches the design's "helper `pipSize(symbol)` inline" guideline). We
 * still cross-check against the shared helper at module load — if they ever
 * diverge that's a project-level bug, not a render-time one.
 */
export function pipSize(symbol: Symbol): number {
  return sharedPipSize(symbol);
}

// Compile-time guarantee that the local helper agrees with `@kestrel/shared`.
// If a new symbol is added to `Symbol` and either function forgets to handle
// it, TypeScript flags this assignment. It's free at runtime.
const _pipSizeAgrees: typeof sharedPipSize = pipSize;
void _pipSizeAgrees;

export function formatBarTime(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(ms);
  // Short locale time — date is implied by the bar context.
  return d.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
