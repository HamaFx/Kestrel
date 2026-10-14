'use client';

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
import { DEFAULT_WATCHLIST_SYMBOLS, type Symbol, type Timeframe } from '@kestrel/shared';
import { IconMessageCircle } from '@tabler/icons-react';
import { Link } from 'next-view-transitions';
import { useRouter } from 'next/navigation';

import { SymbolPicker } from '@/components/chart/symbol-picker';
import { TimeframePicker } from '@/components/chart/timeframe-picker';

import { TradingViewWidget } from './tradingview-widget';

export function ProChartView({ symbol, tf }: { symbol: Symbol; tf: Timeframe }) {
  const router = useRouter();
  const watchlist = (DEFAULT_WATCHLIST_SYMBOLS as readonly string[]).includes(symbol)
    ? [...DEFAULT_WATCHLIST_SYMBOLS]
    : [symbol, ...DEFAULT_WATCHLIST_SYMBOLS];

  const prompt = `Analyze ${symbol} on the ${tf} timeframe and give me key support/resistance levels and trade setups.`;

  return (
    <div className="animate-in fade-in flex flex-col gap-3 duration-300">
      {/* Interactive Chart Control Bar */}
      <div className="surface-panel border-border/80 bg-bg-elev-1 flex flex-col gap-3 rounded-xl border p-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <SymbolPicker active={symbol} watchlist={watchlist} />
          </div>

          <Link
            href={`/chat?prompt=${encodeURIComponent(prompt)}`}
            className="bg-brand/15 hover:bg-brand/25 text-brand border-brand/40 inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border px-3.5 py-2 font-mono text-xs font-semibold transition-colors active:translate-y-[0.5px]"
          >
            <IconMessageCircle className="size-4" />
            <span>Analyze {symbol} in Chat</span>
          </Link>
        </div>

        <div className="border-border/50 flex flex-wrap items-center justify-between gap-2 border-t pt-2.5">
          <span className="text-fg-subtle font-mono text-xs uppercase">Timeframe</span>
          <TimeframePicker
            value={tf}
            onChange={(nextTf) => {
              router.push(`/chart/${symbol}?tf=${nextTf}`);
            }}
          />
        </div>
      </div>

      <TradingViewWidget symbol={symbol} tf={tf} theme="dark" />
    </div>
  );
}
