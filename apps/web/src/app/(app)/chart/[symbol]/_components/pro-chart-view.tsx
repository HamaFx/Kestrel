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

// UI chart surface is exclusively TradingView Pro. Lightweight chart code remains for agent/background consumers — do not mount it here.
import { TradingViewWidget } from '@/components/chart';
import { SymbolPicker } from '@/components/chart/symbol-picker';
import { TimeframePicker } from '@/components/chart/timeframe-picker';
import { useTimeframe } from '@/hooks/use-tf';

const COMPACT_LINKS = [
  { href: '/news', label: 'News' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/alerts', label: 'Alerts' },
] as const;

export function ProChartView({ symbol, tf: initialTf }: { symbol: Symbol; tf: Timeframe }) {
  const [urlTf, setTf] = useTimeframe();
  const currentTf = urlTf ?? initialTf;

  const watchlist = (DEFAULT_WATCHLIST_SYMBOLS as readonly string[]).includes(symbol)
    ? [...DEFAULT_WATCHLIST_SYMBOLS]
    : [symbol, ...DEFAULT_WATCHLIST_SYMBOLS];

  const prompt = `Analyze ${symbol} on the ${currentTf} timeframe and give me key support/resistance levels and trade setups.`;

  return (
    <div className="animate-in fade-in flex flex-col gap-2 duration-300">
      {/* Single 44px milled terminal bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-[#131416] px-3 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="min-w-0">
            <SymbolPicker active={symbol} watchlist={watchlist} />
          </div>
          <span aria-hidden="true" className="hidden h-5 w-px shrink-0 bg-white/10 sm:block" />
          <TimeframePicker
            value={currentTf}
            onChange={(nextTf) => {
              setTf(nextTf);
            }}
          />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <nav aria-label="Market intelligence sections" className="flex items-center gap-2">
            {COMPACT_LINKS.map((link, index) => (
              <span key={link.href} className="flex items-center gap-2">
                {index > 0 ? (
                  <span aria-hidden="true" className="text-fg-subtle/40 font-mono text-[10px]">
                    ·
                  </span>
                ) : null}
                <Link
                  href={link.href}
                  className="text-fg-subtle hover:text-fg font-mono text-[10px] tracking-wider uppercase transition-colors"
                >
                  {link.label}
                </Link>
              </span>
            ))}
          </nav>

          <Link
            href={`/chat?prompt=${encodeURIComponent(prompt)}`}
            className="bg-brand/15 hover:bg-brand/25 text-brand border-brand/40 inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border px-3 py-2 font-mono text-[11px] font-semibold transition-colors active:translate-y-[0.5px]"
          >
            <IconMessageCircle className="size-3.5" />
            <span className="hidden sm:inline">Analyze {symbol} in Chat</span>
            <span className="sm:hidden">Analyze</span>
          </Link>
        </div>
      </div>

      <TradingViewWidget
        symbol={symbol}
        tf={currentTf}
        theme="dark"
        height="calc(100svh - 8.5rem)"
      />
    </div>
  );
}
