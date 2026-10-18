// SPDX-License-Identifier: Apache-2.0

/**
 * P2-02 (audit 2026-10-18) — one candle fetch path for every research packet.
 *
 * The committee's `SymbolResearchPacket` collector and the XAUUSD verified
 * packet fetcher previously issued the same `getCandlesWithMeta` calls with
 * separately maintained window tables; this module is the single call site,
 * so the data-layer request shape (count, signal, cache key) can never drift
 * between the two packets. Windows stay in their owners:
 * `research-config.ts` (XAUUSD) and `symbol-research.ts` (committee).
 */

import { getCandlesWithMeta } from '@kestrel/data';
import type { Symbol, Timeframe } from '@kestrel/shared';

/** One requested candle window: a timeframe and its desired candle count. */
export interface PacketCandleWindow {
  readonly timeframe: Timeframe;
  readonly count: number;
}

export type PacketCandleResult = Awaited<ReturnType<typeof getCandlesWithMeta>>;

/**
 * Fetch every window in parallel, preserving per-window failures as settled
 * results so a single unavailable timeframe degrades the packet instead of
 * failing the run (fail-closed status is decided by the packet assembler).
 */
export async function fetchPacketCandles(
  symbol: Symbol,
  windows: readonly PacketCandleWindow[],
  signal?: AbortSignal,
): Promise<Map<Timeframe, PromiseSettledResult<PacketCandleResult>>> {
  const settled = await Promise.allSettled(
    windows.map(({ timeframe, count }) =>
      getCandlesWithMeta(symbol, timeframe, {
        count,
        ...(signal ? { signal } : {}),
      }),
    ),
  );
  return new Map(windows.map((window, index) => [window.timeframe, settled[index]!]));
}
