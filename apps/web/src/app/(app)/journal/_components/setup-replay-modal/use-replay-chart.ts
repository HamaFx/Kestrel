// SPDX-License-Identifier: Apache-2.0

// Renders the lightweight-charts candle replay into a container ref, with
// candlesticks, EMA overlays, key-level price lines, and resize handling.
import type { IChartApi, Time } from 'lightweight-charts';
import { useEffect, useRef } from 'react';

import type { TradeSetupReplayDTO } from '@/lib/services/journal';

export function useReplayChart(replay: TradeSetupReplayDTO | undefined) {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  // Render lightweight-charts when replay data arrives
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el || !replay || replay.candles.length === 0) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    let cancelled = false;
    // Owned by the effect (not the import().then chain): the cleanup returned
    // from the `.then` callback is discarded, so the observer used to leak on
    // every open/close cycle.
    let resizeObserver: ResizeObserver | null = null;

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
      resizeObserver = new ResizeObserver((entriesList) => {
        for (const item of entriesList) {
          if (item.contentRect.width > 0 && chartRef.current) {
            chartRef.current.applyOptions({ width: item.contentRect.width });
          }
        }
      });

      resizeObserver.observe(el);
    });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      resizeObserver = null;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [replay]);

  return chartContainerRef;
}
