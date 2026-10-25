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

// Bespoke renderer for the `get_candles` tool part.
//
// The tool returns an OHLC series for a symbol/timeframe. We render a
// compact, mobile-first card:
//
//   1. A header row that names the symbol, the timeframe, and the bar
//      count — so the user knows exactly what data the agent looked at.
//   2. The most recent bar's OHLC summary, with `text-bull` / `text-bear`
//      colouring on the close vs. open delta and a per-symbol pip count.
//   3. An optional 5-row tail of the closed bars (timestamp + close) for
//      quick eyeball context.
//
// Server component — no state, no events. Formatting helpers live in
// `get-candles-format.ts`; the sparkline and placeholder states are their
// own files.

import { priceDecimals, type GetCandlesOutput } from '@kestrel/shared';

import { cn } from '@/lib/formatters/cn';

import { formatBarTime, pipSize } from './get-candles-format';
import { CandleSparkline } from './get-candles-sparkline';
import { CandlesCardError, CandlesCardSkeleton } from './get-candles-states';

interface GetCandlesPartProps {
  /** Tool output, or `null` while streaming / before completion. */
  output: GetCandlesOutput | null;
  state: 'loading' | 'done' | 'error';
  errorMessage?: string;
}

export function GetCandlesPart({ output, state, errorMessage }: GetCandlesPartProps) {
  if (state === 'error') {
    return <CandlesCardError message={errorMessage} />;
  }
  if (state === 'loading' || !output) {
    return <CandlesCardSkeleton />;
  }
  if (output.candles.length === 0) {
    return (
      <div className="border-border bg-bg-elev-1 text-fg-muted rounded-sm border p-3 text-xs">
        {output.symbol} · {output.tf} · no bars returned
      </div>
    );
  }

  // Last bar drives the headline OHLC summary. `output.candles[0]` is the
  // oldest, `output.candles[length - 1]` the most recent.
  const last = output.candles[output.candles.length - 1]!;
  const symbol = last.symbol;
  const decimals = priceDecimals(symbol);
  const change = last.c - last.o;
  const isBull = last.c >= last.o;
  const tone = isBull ? 'text-bull' : 'text-bear';
  const pips = change / pipSize(symbol);
  const sign = change > 0 ? '+' : change < 0 ? '−' : '';

  // Last 5 closed bars (oldest → newest) for the tail list.
  const tail = output.candles.slice(-5);

  return (
    <div className="border-border bg-bg-elev-1 rounded-sm border p-3">
      <div className="text-fg-muted mb-2 flex items-baseline justify-between text-xs">
        <span>
          <span className="text-fg font-medium">{output.symbol}</span> · {output.tf} · last{' '}
          {output.candles.length} {output.candles.length === 1 ? 'bar' : 'bars'}
        </span>
        <time dateTime={new Date(last.t).toISOString()} className="text-fg-subtle tabular-nums">
          {formatBarTime(last.t)}
        </time>
      </div>

      {/* OHLC summary — four stat columns, change on the far right with
          bull/bear colouring. Stacks gracefully on narrow phones. */}
      <dl className="grid grid-cols-4 gap-2 tabular-nums">
        <Stat label="O" value={last.o.toFixed(decimals)} />
        <Stat label="H" value={last.h.toFixed(decimals)} />
        <Stat label="L" value={last.l.toFixed(decimals)} />
        <Stat label="C" value={last.c.toFixed(decimals)} tone={tone} />
      </dl>

      {/* Phase 1.2a — inline candle sparkline (last 20 bars) */}
      <CandleSparkline candles={output.candles.slice(-20)} lastClose={last.c} />

      <div className={cn('mt-2 text-xs tabular-nums', tone)}>
        {sign}
        {Math.abs(change).toFixed(decimals)} ({sign}
        {Math.abs(pips).toFixed(1)} pips)
      </div>

      {tail.length > 1 ? (
        <ul className="border-border mt-3 space-y-1 border-t pt-2">
          {tail.map((c) => {
            const barBull = c.c >= c.o;
            return (
              <li
                key={c.t}
                className="text-fg-muted text-body-sm flex items-center justify-between tabular-nums"
              >
                <time dateTime={new Date(c.t).toISOString()} className="text-fg-subtle">
                  {formatBarTime(c.t)}
                </time>
                <span className={barBull ? 'text-bull' : 'text-bear'}>{c.c.toFixed(decimals)}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-fg-subtle text-caption tracking-wide uppercase">{label}</dt>
      <dd className={cn('text-fg text-sm font-medium', tone)}>{value}</dd>
    </div>
  );
}
