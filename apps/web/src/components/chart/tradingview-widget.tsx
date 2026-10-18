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

// UI chart surface is exclusively TradingView Pro. Lightweight chart code remains
// for agent/background consumers — do not mount it here.
import { getSymbolDefinition, isKnownSymbol, type Symbol, type Timeframe } from '@kestrel/shared';
import { Link } from 'next-view-transitions';
import { useEffect, useRef, useState } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

interface TradingViewGlobal {
  widget: new (config: TradingViewWidgetConfig) => unknown;
}

interface TradingViewWidgetConfig {
  container_id: string;
  symbol: string;
  interval: string;
  theme: 'dark' | 'light';
  timezone: string;
  locale: string;
  style: '1';
  enable_publishing: false;
  hide_top_toolbar: false;
  hide_legend: false;
  withdateranges: true;
  allow_symbol_change: false;
  autosize: true;
}

declare global {
  interface Window {
    TradingView?: TradingViewGlobal;
  }
}

const SYMBOL_TO_TV: Record<string, string> = {
  XAUUSD: 'OANDA:XAUUSD',
  EURUSD: 'OANDA:EURUSD',
  GBPUSD: 'OANDA:GBPUSD',
};

function resolveTvSymbol(symbol: string): string {
  if (isKnownSymbol(symbol)) {
    return getSymbolDefinition(symbol).tradingView;
  }
  return SYMBOL_TO_TV[symbol] || (symbol.includes(':') ? symbol : `OANDA:${symbol}`);
}

const TF_TO_TV_INTERVAL: Record<Timeframe, string> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '1h': '60',
  '4h': '240',
  '1d': 'D',
  '1w': 'W',
};

const LOAD_TIMEOUT_MS = 6000;

let tvReady: Promise<void> | null = null;
function ensureTv(): Promise<void> {
  if (typeof window !== 'undefined' && window.TradingView) return Promise.resolve();
  if (tvReady) return tvReady;
  tvReady = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://s3.tradingview.com/tv.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      tvReady = null;
      reject(new Error('Failed to load tv.js'));
    };
    document.head.appendChild(s);
  });
  return tvReady;
}

export interface TradingViewWidgetProps {
  symbol: Symbol;
  tf: Timeframe;
  theme?: 'dark' | 'light';
}

export function TradingViewWidget({ symbol, tf, theme = 'dark' }: TradingViewWidgetProps) {
  // Stable container ID per symbol & timeframe to avoid recreation loops
  const containerId = `tv-widget-${symbol}-${tf}`;
  const containerRef = useRef<HTMLDivElement | null>(null);
  type WidgetInstance = { remove: () => void };
  const widgetRef = useRef<WidgetInstance | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Try to create the widget once the container and TradingView API are both ready.
  const tryCreate = (tv: TradingViewGlobal) => {
    if (!containerRef.current || widgetRef.current) return;
    try {
      const w = new tv.widget({
        container_id: containerId,
        symbol: resolveTvSymbol(symbol),
        interval: TF_TO_TV_INTERVAL[tf] || '60',
        theme,
        timezone: 'Etc/UTC',
        locale: 'en',
        style: '1',
        enable_publishing: false,
        hide_top_toolbar: false,
        hide_legend: false,
        withdateranges: true,
        allow_symbol_change: false,
        autosize: true,
      });
      widgetRef.current = w as WidgetInstance;
      setState('ready');
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    } catch (err) {
      console.warn('[pro-chart] TradingView widget construct failed', err);
      setState('failed');
    }
  };

  useEffect(() => {
    let isSubscribed = true;

    // Use singleton loader — removes <Script> remount flicker between routes
    void ensureTv()
      .then(() => {
        if (!isSubscribed) return;
        const tv = typeof window !== 'undefined' ? window.TradingView : undefined;
        if (tv) tryCreate(tv);
      })
      .catch((err) => {
        if (!isSubscribed) return;
        console.warn('[pro-chart] ensureTv load error', err);
        setState('failed');
      });

    // Set a timeout — if TradingView never becomes available, show fallback.
    if (!widgetRef.current) {
      timerRef.current = setTimeout(() => {
        if (!isSubscribed) return;
        const tvCheck = typeof window !== 'undefined' ? window.TradingView : undefined;
        if (tvCheck && containerRef.current && !widgetRef.current) {
          tryCreate(tvCheck);
        } else if (!tvCheck) {
          setState('failed');
        }
      }, LOAD_TIMEOUT_MS);
    }

    return () => {
      isSubscribed = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (widgetRef.current) {
        widgetRef.current.remove();
        widgetRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId, symbol, tf, theme]);

  const height =
    'calc(100dvh - var(--chart-chrome, calc(3rem + 1.75rem + 1.5rem + 24px + env(safe-area-inset-top, 0px) + env(safe-area-inset-bottom, 0px))))';

  return (
    <div
      className="surface-well bg-well relative min-h-[400px] w-full overflow-hidden rounded-sm border-white/5 shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.6)]"
      style={{ height }}
    >
      {/* The TradingView container — always rendered so the widget has a target. */}
      <div
        id={containerId}
        ref={containerRef}
        className="absolute inset-0"
        aria-label={`${symbol} ${tf} chart (TradingView)`}
      />

      {/* Loading skeleton — styled with identical well chrome so swap is seamless */}
      {state === 'loading' && (
        <div className="bg-well absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-sm border border-white/5 p-4 shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.6)]">
          <Skeleton decorative className="h-3 w-48" />
          <Skeleton decorative className="h-3 w-32" />
          <p className="text-fg-subtle mt-2 font-mono text-xs">Loading chart...</p>
        </div>
      )}

      {/* Error fallback — with role="alert" and in-place retry */}
      {state === 'failed' && (
        <div
          role="alert"
          className="bg-well absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-sm border border-white/5 p-6 text-center shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.6)]"
        >
          <p className="text-bear text-lg font-semibold">Chart unavailable</p>
          <p className="text-fg-muted max-w-xs text-sm">
            The TradingView widget could not load. This may happen on networks that block
            third-party scripts.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setState('loading');
                tvReady = null;
                void ensureTv()
                  .then(() => {
                    const tv = typeof window !== 'undefined' ? window.TradingView : undefined;
                    if (tv) tryCreate(tv);
                  })
                  .catch(() => setState('failed'));
              }}
              className="surface-button text-fg rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:brightness-110 active:translate-y-[0.5px]"
            >
              Retry
            </button>
            <Link
              href="/chat"
              className="bg-bg-elev-2 hover:bg-bg-elev-3 border-border text-fg rounded-md border px-3 py-1.5 text-xs transition-colors"
            >
              Open chat →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
