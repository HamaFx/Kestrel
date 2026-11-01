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

// Tool: get_correlation.
//
// Returns a Pearson correlation matrix over close-to-close returns for
// all pairs of supported symbols at a given timeframe + window, plus a
// derived USD-strength proxy ("DXY proxy") computed from the FX legs.
//
// The proxy is **not** a true DXY (no JPY, CAD, SEK, CHF) — it is an
// intentionally narrow intermarket feature using EURUSD and GBPUSD. The formula is captured verbatim in
// `dxyProxy.formula` so any agent answer that quotes the value can also
// quote the formula, and the UI labels the value as a proxy clearly.
//
// R8 (audit 2026-10-31): when an input is missing this tool reports absence
// (`dxyProxy: null`, an omitted matrix pair) and says so in `notes`. It never
// substitutes 0 for an unknown measurement, because a number present in tool
// output is treated as grounded evidence by the verifier.

import { getCandles } from '@kestrel/data';
import {
  GetCorrelationInputSchema,
  SYMBOLS,
  type CorrelationCell,
  type GetCorrelationOutput,
  type Symbol,
} from '@kestrel/shared';
import { tool, type Tool } from 'ai';
import type { z } from 'zod';

const InputSchema = GetCorrelationInputSchema;

declare module '@kestrel/shared' {
  interface ToolIOMap {
    get_correlation: { input: z.infer<typeof InputSchema> };
  }
}

const _FX_PAIRS_FOR_DXY: Array<{ symbol: Symbol; weight: number }> = [
  { symbol: 'EURUSD', weight: 0.5 },
  { symbol: 'GBPUSD', weight: 0.5 },
];
void _FX_PAIRS_FOR_DXY;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const getCorrelationTool: Tool<z.infer<typeof InputSchema>, GetCorrelationOutput> = tool({
  description:
    "Pearson correlation matrix over close-to-close returns for the legacy CFTC/intermarket trio XAUUSD/EURUSD/GBPUSD at the given timeframe + window, plus a USD-strength proxy ('DXY proxy') computed from EURUSD and GBPUSD with 50/50 weights. This intentionally narrow feature does not limit the broader product catalog. Use for any 'are EUR and GBP both selling off' / 'how correlated is gold to the dollar' / 'what's the dollar doing today' prompt. Returns the formula verbatim so you can cite it.",
  inputSchema: InputSchema,
  execute: async ({ tf, windowBars }): Promise<GetCorrelationOutput> => {
    const need = windowBars + 1;
    const candlesBySymbol = new Map<Symbol, SymbolReturns>();
    let partial = false;
    let stale = false;
    for (const symbol of SYMBOLS) {
      try {
        const result = await getCandles(symbol, tf, { count: need });
        stale = stale || result.stale;
        candlesBySymbol.set(symbol, bareReturns(result.candles));
      } catch {
        // Per-symbol failure tolerated; the pair is omitted below rather than
        // being assigned an invented correlation.
        partial = true;
      }
    }

    const matrix: CorrelationCell[] = [];
    for (let i = 0; i < SYMBOLS.length; i += 1) {
      for (let j = i + 1; j < SYMBOLS.length; j += 1) {
        const a = SYMBOLS[i]!;
        const b = SYMBOLS[j]!;
        const ra = candlesBySymbol.get(a);
        const rb = candlesBySymbol.get(b);
        // R8 (audit 2026-10-31): an absent or too-short window means there is
        // no correlation to report, so the pair is omitted. It used to fall
        // through to r = 0, which reads as "no relationship" and grounds a
        // claim the data cannot support.
        if (!ra || !rb || ra.returns.length < windowBars || rb.returns.length < windowBars)
          continue;
        const r = pearson(ra.returns.slice(-windowBars), rb.returns.slice(-windowBars));
        // Zero variance makes Pearson undefined; an undefined correlation is
        // not a zero correlation.
        if (r === null) continue;
        matrix.push({ a, b, r });
      }
    }

    const dxyProxy = computeDxyProxy(candlesBySymbol);

    return {
      tf,
      windowBars,
      asOf: Date.now(),
      matrix,
      dxyProxy,
      notes: buildNotes({
        dxyProxy,
        matrixSize: matrix.length,
        partial,
        stale,
      }),
      partial,
      stale,
    };
  },
});

// ---------------------------------------------------------------------------
// Returns / Pearson
// ---------------------------------------------------------------------------

interface SymbolReturns {
  /** Closes oldest-first; same length as the input candle window. */
  closes: number[];
  /** Close-to-close log returns, length = closes.length - 1. */
  returns: number[];
  /** Bar timestamps (ms epoch UTC), aligned to `closes`. */
  times: number[];
}

function bareReturns(bars: { c: number; t: number }[]): SymbolReturns {
  const closes: number[] = [];
  const times: number[] = [];
  for (const b of bars) {
    if (Number.isFinite(b.c)) {
      closes.push(b.c);
      times.push(b.t);
    }
  }
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    const prev = closes[i - 1]!;
    const curr = closes[i]!;
    if (prev > 0) returns.push(Math.log(curr / prev));
  }
  return { closes, returns, times };
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const x = xs[i]!;
    const y = ys[i]!;
    sx += x;
    sy += y;
    sxy += x * y;
    sxx += x * x;
    syy += y * y;
  }
  const num = n * sxy - sx * sy;
  const denomX = n * sxx - sx * sx;
  const denomY = n * syy - sy * sy;
  const den = Math.sqrt(denomX * denomY);
  if (den === 0 || !Number.isFinite(den)) return null;
  const r = num / den;
  if (!Number.isFinite(r)) return null;
  return Math.max(-1, Math.min(1, r));
}

// ---------------------------------------------------------------------------
// DXY proxy
// ---------------------------------------------------------------------------

function computeDxyProxy(data: Map<Symbol, SymbolReturns>): GetCorrelationOutput['dxyProxy'] {
  const eur = data.get('EURUSD');
  const gbp = data.get('GBPUSD');

  const formula =
    'DXY proxy = 100 / (EURUSD^0.5 * GBPUSD^0.5). Two-leg approximation; not a true DXY (no JPY/CAD/SEK/CHF).';

  // R8 (audit 2026-10-31): never fabricate a numeric proxy. Returning null
  // keeps the value out of the tool output entirely, so the numeric evidence
  // gate cannot ground a claim like "the DXY proxy is 0".
  if (!eur || !gbp || eur.closes.length === 0 || gbp.closes.length === 0) {
    return null;
  }

  const lastEur = eur.closes[eur.closes.length - 1]!;
  const lastGbp = gbp.closes[gbp.closes.length - 1]!;
  const value = 100 / (Math.pow(lastEur, 0.5) * Math.pow(lastGbp, 0.5));
  if (!Number.isFinite(value) || value <= 0) return null;

  // 24h change — find the bar closest to 24h before the last bar. When no
  // usable bar is found the change is unknown, so it stays null instead of 0.
  const lastTime = eur.times[eur.times.length - 1] ?? Date.now();
  const targetTime = lastTime - ONE_DAY_MS;
  const eurAtTarget = closestPrice(eur, targetTime);
  const gbpAtTarget = closestPrice(gbp, targetTime);

  let change24h: number | null = null;
  if (eurAtTarget !== null && gbpAtTarget !== null) {
    const past = 100 / (Math.pow(eurAtTarget, 0.5) * Math.pow(gbpAtTarget, 0.5));
    if (past > 0 && Number.isFinite(past)) change24h = ((value - past) / past) * 100;
  }

  return {
    value,
    change24h,
    samples: Math.min(eur.closes.length, gbp.closes.length),
    formula,
  };
}

/**
 * Deterministic interpretation. Every reading that could not be computed is
 * stated as unavailable rather than restated as a number (R8).
 */
function buildNotes(args: {
  dxyProxy: GetCorrelationOutput['dxyProxy'];
  matrixSize: number;
  partial: boolean;
  stale: boolean;
}): string {
  const proxyLine =
    args.dxyProxy === null
      ? 'USD-strength proxy unavailable: EURUSD and/or GBPUSD closes could not be read, so no proxy value is reported.'
      : args.dxyProxy.change24h === null
        ? 'USD-strength proxy value available; its 24h change is unavailable because no bar sits near a day before the last close.'
        : 'USD-strength proxy computed from the latest EURUSD and GBPUSD closes.';
  const matrixLine =
    args.matrixSize === 0
      ? 'Correlation matrix unavailable: no symbol pair had enough overlapping returns in this window.'
      : 'Correlation matrix computed over close-to-close returns in the requested window.';
  const missingLine = args.partial
    ? ' One or more symbol candle windows could not be fetched.'
    : '';
  const staleLine = args.stale
    ? ' At least one candle window was served from a stale cache; treat this reading as provisional.'
    : '';
  return `${proxyLine} ${matrixLine}${missingLine}${staleLine}`;
}

function closestPrice(s: SymbolReturns, targetMs: number): number | null {
  if (s.times.length === 0) return null;
  let bestIdx = 0;
  let bestDiff = Math.abs(s.times[0]! - targetMs);
  for (let i = 1; i < s.times.length; i += 1) {
    const d = Math.abs(s.times[i]! - targetMs);
    if (d < bestDiff) {
      bestDiff = d;
      bestIdx = i;
    }
  }
  return s.closes[bestIdx] ?? null;
}
