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
import type { JournalEntry, Timeframe } from '@kestrel/shared';
import {
  IconActivity,
  IconArrowDownRight,
  IconArrowUpRight,
  IconGauge,
  IconTarget,
  IconTrendingDown,
  IconTrendingUp,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import type { IChartApi, Time } from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Segmented } from '@/components/ui/segmented';
import { apiFetch } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import type { TradeSetupReplayDTO } from '@/lib/services/journal';

interface SetupReplayModalProps {
  entry: JournalEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SetupReplayModal({ entry, open, onOpenChange }: SetupReplayModalProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>('15m');
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const { data, isLoading, isError, error } = useQuery<{ replay: TradeSetupReplayDTO }>({
    queryKey: ['journal-replay', entry?.id, timeframe],
    queryFn: async () => {
      if (!entry) throw new Error('No entry provided');
      return apiFetch<{ replay: TradeSetupReplayDTO }>(
        `/api/journal/${entry.id}/replay?timeframe=${timeframe}`,
      );
    },
    enabled: open && !!entry?.id,
    staleTime: 60_000,
  });

  const replay = data?.replay;

  // Render lightweight-charts when replay data arrives
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el || !replay || replay.candles.length === 0) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    let cancelled = false;

    void import('lightweight-charts').then((lc) => {
      if (cancelled || !chartContainerRef.current) return;

      const chart = lc.createChart(chartContainerRef.current, {
        height: 280,
        layout: {
          background: { type: lc.ColorType.Solid, color: '#09090b' },
          textColor: '#a1a1aa',
          fontSize: 11,
          fontFamily: 'var(--font-mono, monospace)',
        },
        grid: {
          vertLines: { color: 'rgba(39, 39, 42, 0.4)' },
          horzLines: { color: 'rgba(39, 39, 42, 0.4)' },
        },
        rightPriceScale: {
          borderColor: 'rgba(39, 39, 42, 0.8)',
          scaleMargins: { top: 0.12, bottom: 0.12 },
        },
        timeScale: {
          borderColor: 'rgba(39, 39, 42, 0.8)',
          timeVisible: true,
          secondsVisible: false,
        },
        crosshair: {
          mode: lc.CrosshairMode.Normal,
          vertLine: { color: 'rgba(161, 161, 170, 0.3)', width: 1, style: lc.LineStyle.Dashed },
          horzLine: { color: 'rgba(161, 161, 170, 0.3)', width: 1, style: lc.LineStyle.Dashed },
        },
      });

      chartRef.current = chart;

      // Candlestick series
      const candleSeries = chart.addSeries(lc.CandlestickSeries, {
        upColor: '#10b981',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
      });

      const candleData = replay.candles.map((c) => ({
        time: Math.floor(c.t / 1000) as unknown as Time,
        open: c.o,
        high: c.h,
        low: c.l,
        close: c.c,
      }));

      candleSeries.setData(candleData);

      // EMA 20 line
      const ema20Data = replay.candles
        .filter((c) => c.ema20 !== undefined)
        .map((c) => ({
          time: Math.floor(c.t / 1000) as unknown as Time,
          value: c.ema20!,
        }));

      if (ema20Data.length > 0) {
        const ema20Series = chart.addSeries(lc.LineSeries, {
          color: '#fbbf24',
          lineWidth: 1,
          lineStyle: lc.LineStyle.Solid,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        ema20Series.setData(ema20Data);
      }

      // EMA 50 line
      const ema50Data = replay.candles
        .filter((c) => c.ema50 !== undefined)
        .map((c) => ({
          time: Math.floor(c.t / 1000) as unknown as Time,
          value: c.ema50!,
        }));

      if (ema50Data.length > 0) {
        const ema50Series = chart.addSeries(lc.LineSeries, {
          color: '#38bdf8',
          lineWidth: 1,
          lineStyle: lc.LineStyle.Solid,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        ema50Series.setData(ema50Data);
      }

      // Key Level Lines
      if (replay.keyLevels.entry) {
        candleSeries.createPriceLine({
          price: replay.keyLevels.entry,
          color: '#38bdf8',
          lineWidth: 2,
          lineStyle: lc.LineStyle.Solid,
          axisLabelVisible: true,
          title: `ENTRY (${replay.keyLevels.entry})`,
        });
      }

      if (replay.keyLevels.stop) {
        candleSeries.createPriceLine({
          price: replay.keyLevels.stop,
          color: '#ef4444',
          lineWidth: 2,
          lineStyle: lc.LineStyle.Dashed,
          axisLabelVisible: true,
          title: `STOP (${replay.keyLevels.stop})`,
        });
      }

      if (replay.keyLevels.target) {
        candleSeries.createPriceLine({
          price: replay.keyLevels.target,
          color: '#10b981',
          lineWidth: 2,
          lineStyle: lc.LineStyle.Dashed,
          axisLabelVisible: true,
          title: `TARGET (${replay.keyLevels.target})`,
        });
      }

      if (replay.keyLevels.exit) {
        candleSeries.createPriceLine({
          price: replay.keyLevels.exit,
          color: '#a855f7',
          lineWidth: 2,
          lineStyle: lc.LineStyle.Dotted,
          axisLabelVisible: true,
          title: `EXIT (${replay.keyLevels.exit})`,
        });
      }

      chart.timeScale().fitContent();

      // Handle Resize
      const resizeObserver = new ResizeObserver((entriesList) => {
        for (const item of entriesList) {
          if (item.contentRect.width > 0 && chartRef.current) {
            chartRef.current.applyOptions({ width: item.contentRect.width });
          }
        }
      });

      resizeObserver.observe(el);

      return () => {
        resizeObserver.disconnect();
      };
    });

    return () => {
      cancelled = true;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [replay]);

  if (!entry) return null;

  const isWin = entry.outcome === 'win';
  const isLoss = entry.outcome === 'loss';
  const isLong = entry.side === 'long';

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DrawerHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'flex size-10 items-center justify-center rounded-sm text-sm font-black',
                  isLong ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400',
                )}
              >
                {isLong ? (
                  <IconArrowUpRight className="size-6" />
                ) : (
                  <IconArrowDownRight className="size-6" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <DrawerTitle className="text-base font-bold">
                    {entry.symbol} {entry.side.toUpperCase()}
                  </DrawerTitle>
                  <span
                    className={cn(
                      'rounded-xs px-2 py-0.5 text-xs font-black uppercase',
                      isWin && 'bg-emerald-500/10 text-emerald-400',
                      isLoss && 'bg-rose-500/10 text-rose-400',
                      entry.outcome === 'breakeven' && 'bg-zinc-500/10 text-zinc-400',
                      entry.outcome === 'open' && 'bg-sky-500/10 text-sky-400',
                    )}
                  >
                    {entry.outcome}
                  </span>
                </div>
                <DrawerDescription className="text-xs">
                  Setup Replay & Historical Execution Diagnostics
                </DrawerDescription>
              </div>
            </div>

            <Segmented
              value={timeframe}
              onChange={(next) => setTimeframe(next as Timeframe)}
              options={[
                { value: '5m', label: '5M' },
                { value: '15m', label: '15M' },
                { value: '1h', label: '1H' },
                { value: '4h', label: '4H' },
              ]}
              ariaLabel="Replay timeframe"
              variant="solid"
            />
          </div>
        </DrawerHeader>

        <div className="flex flex-col gap-6 p-4 pt-0">
          {/* Chart Area */}
          <div className="border-border bg-bg-elev-1 relative min-h-[280px] w-full overflow-hidden rounded-sm border">
            {isLoading ? (
              <div className="flex h-[280px] flex-col items-center justify-center gap-2">
                <IconActivity className="text-fg-subtle size-6 animate-pulse" />
                <span className="text-fg-subtle text-xs">Loading market candles...</span>
              </div>
            ) : isError ? (
              <div className="flex h-[280px] flex-col items-center justify-center gap-2 p-6 text-center">
                <span className="text-sm font-semibold text-rose-400">
                  Failed to load historical candles
                </span>
                <span className="text-fg-subtle text-xs">
                  {(error as Error)?.message || 'Market data provider unavailable'}
                </span>
              </div>
            ) : (
              <div ref={chartContainerRef} className="h-[280px] w-full" />
            )}

            {/* Legend Overlay */}
            <div className="pointer-events-none absolute top-2 left-2 flex items-center gap-3 rounded-xs bg-black/60 px-2 py-1 text-caption backdrop-blur-xs">
              <div className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-[#fbbf24]" />
                <span className="text-zinc-300">EMA 20</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-[#38bdf8]" />
                <span className="text-zinc-300">EMA 50</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-[#10b981]" />
                <span className="text-zinc-300">Target</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-[#ef4444]" />
                <span className="text-zinc-300">Stop</span>
              </div>
            </div>
          </div>

          {/* Replay Analytics Metrics Grid */}
          {replay && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="border-border bg-bg-elev-1 flex flex-col gap-1 rounded-sm border p-3">
                <div className="text-fg-subtle text-caption flex items-center gap-1 font-semibold tracking-wider uppercase">
                  <IconTarget className="size-3.5" />
                  <span>Realized R</span>
                </div>
                <div
                  className={cn(
                    'text-base font-black tabular-nums',
                    (replay.stats.realizedRR ?? 0) > 0 ? 'text-emerald-400' : 'text-rose-400',
                  )}
                >
                  {replay.stats.realizedRR !== null
                    ? `${replay.stats.realizedRR >= 0 ? '+' : ''}${replay.stats.realizedRR.toFixed(2)} R`
                    : 'N/A'}
                </div>
                <span className="text-fg-subtle text-caption tabular-nums">
                  Planned: {replay.stats.plannedRR ? `${replay.stats.plannedRR.toFixed(2)} R` : '—'}
                </span>
              </div>

              <div className="border-border bg-bg-elev-1 flex flex-col gap-1 rounded-sm border p-3">
                <div className="text-fg-subtle text-caption flex items-center gap-1 font-semibold tracking-wider uppercase">
                  <IconTrendingUp className="size-3.5 text-emerald-400" />
                  <span>Max Runup (MFE)</span>
                </div>
                <div className="text-base font-black text-emerald-400 tabular-nums">
                  {replay.mfe.r !== null ? `+${replay.mfe.r.toFixed(2)} R` : '—'}
                </div>
                <span className="text-fg-subtle text-caption tabular-nums">
                  +{replay.mfe.pips.toFixed(1)} pips peak
                </span>
              </div>

              <div className="border-border bg-bg-elev-1 flex flex-col gap-1 rounded-sm border p-3">
                <div className="text-fg-subtle text-caption flex items-center gap-1 font-semibold tracking-wider uppercase">
                  <IconTrendingDown className="size-3.5 text-rose-400" />
                  <span>Max Drawdown (MAE)</span>
                </div>
                <div className="text-base font-black text-rose-400 tabular-nums">
                  {replay.mae.r !== null ? `-${replay.mae.r.toFixed(2)} R` : '—'}
                </div>
                <span className="text-fg-subtle text-caption tabular-nums">
                  -{replay.mae.pips.toFixed(1)} pips adverse
                </span>
              </div>

              <div className="border-border bg-bg-elev-1 flex flex-col gap-1 rounded-sm border p-3">
                <div className="text-fg-subtle text-caption flex items-center gap-1 font-semibold tracking-wider uppercase">
                  <IconGauge className="size-3.5 text-sky-400" />
                  <span>Efficiency</span>
                </div>
                <div className="text-base font-black text-sky-400 tabular-nums">
                  {replay.stats.executionEfficiencyPct !== null
                    ? `${replay.stats.executionEfficiencyPct.toFixed(0)}%`
                    : '—'}
                </div>
                <span className="text-fg-subtle text-caption">
                  {replay.stats.durationMs
                    ? `${Math.round(replay.stats.durationMs / 60000)}m hold time`
                    : 'Open position'}
                </span>
              </div>
            </div>
          )}

          {/* Key Levels List */}
          <div className="border-border bg-bg-elev-1 flex flex-col gap-2 rounded-sm border p-4">
            <h4 className="text-fg text-caption font-bold tracking-wider uppercase sm:text-xs">
              Execution Levels
            </h4>
            <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
              <div>
                <span className="text-fg-subtle text-caption block font-medium">Entry Price</span>
                <span className="font-mono font-bold text-sky-400 tabular-nums">{entry.entry}</span>
              </div>
              <div>
                <span className="text-fg-subtle text-caption block font-medium">Stop Loss</span>
                <span className="font-mono font-bold text-rose-400 tabular-nums">{entry.stop ?? 'None'}</span>
              </div>
              <div>
                <span className="text-fg-subtle text-caption block font-medium">Take Profit Target</span>
                <span className="font-mono font-bold text-emerald-400 tabular-nums">
                  {entry.target ?? 'None'}
                </span>
              </div>
              <div>
                <span className="text-fg-subtle text-caption block font-medium">Actual Exit</span>
                <span className="font-mono font-bold text-purple-400 tabular-nums">{entry.exit ?? 'Open'}</span>
              </div>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
