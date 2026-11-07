'use client';

// SPDX-License-Identifier: Apache-2.0

// Interactive "What-If" stop & target scrubber for the setup replay drawer.
// Walks the historical candle window chronologically and reports the R-multiple
// the trade would have produced under the chosen invalidation and target.
import type { JournalEntry } from '@kestrel/shared';
import { priceDecimals } from '@kestrel/shared';
import { useMemo, useState } from 'react';

import type { TradeSetupReplayDTO } from '@/lib/services/journal';
import { cn } from '@/lib/formatters/cn';

interface WhatIfScrubberProps {
  entry: JournalEntry;
  replay: TradeSetupReplayDTO | undefined;
}

interface SimulationResult {
  outcome: 'STOPPED OUT' | 'TARGET HIT' | 'HELD TO EXIT';
  r: number;
  exit: number;
}

function defaultStop(entry: JournalEntry): number {
  return entry.stop ?? entry.entry * (entry.side === 'long' ? 0.995 : 1.005);
}

function defaultTarget(entry: JournalEntry): number {
  return entry.target ?? entry.entry * (entry.side === 'long' ? 1.015 : 0.985);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function simulate(
  entry: JournalEntry,
  candles: TradeSetupReplayDTO['candles'],
  stop: number,
  target: number,
): SimulationResult | null {
  const risk = Math.abs(entry.entry - stop);
  if (risk <= 0) return null;
  const isLong = entry.side === 'long';
  const startIndex = Math.max(
    0,
    candles.findIndex((candle) => candle.t >= entry.openedAt),
  );
  for (let i = startIndex; i < candles.length; i++) {
    const candle = candles[i];
    if (!candle) continue;
    const stopHit = isLong ? candle.l <= stop : candle.h >= stop;
    if (stopHit) return { outcome: 'STOPPED OUT', r: -1, exit: stop };
    const targetHit = isLong ? candle.h >= target : candle.l <= target;
    if (targetHit) {
      return {
        outcome: 'TARGET HIT',
        r: (isLong ? target - entry.entry : entry.entry - target) / risk,
        exit: target,
      };
    }
  }
  const lastClose = candles[candles.length - 1]?.c ?? entry.exit ?? entry.entry;
  return {
    outcome: 'HELD TO EXIT',
    r: (isLong ? lastClose - entry.entry : entry.entry - lastClose) / risk,
    exit: lastClose,
  };
}

export function WhatIfScrubber({ entry, replay }: WhatIfScrubberProps) {
  const [whatIfStop, setWhatIfStop] = useState(() => defaultStop(entry));
  const [whatIfTarget, setWhatIfTarget] = useState(() => defaultTarget(entry));
  const decimals = priceDecimals(entry.symbol);
  const isLong = entry.side === 'long';

  // ±3% envelope clipped to the replay window's actual extreme.
  const bounds = useMemo(() => {
    const candles = replay?.candles ?? [];
    const candleLow = candles.length > 0 ? Math.min(...candles.map((c) => c.l)) : 0;
    const candleHigh = candles.length > 0 ? Math.max(...candles.map((c) => c.h)) : 0;
    const low = Math.max(entry.entry * 0.97, candleLow || entry.entry * 0.97);
    const high = Math.min(entry.entry * 1.03, candleHigh || entry.entry * 1.03);
    return { low, high };
  }, [entry.entry, replay]);

  const stopMin = isLong ? bounds.low : entry.entry * 1.0005;
  const stopMax = isLong ? entry.entry * 0.9995 : bounds.high;
  const targetMin = isLong ? entry.entry * 1.0005 : bounds.low;
  const targetMax = isLong ? bounds.high : entry.entry * 0.9995;

  const result = useMemo(() => {
    if (!replay || replay.candles.length === 0) return null;
    return simulate(entry, replay.candles, whatIfStop, whatIfTarget);
  }, [entry, replay, whatIfStop, whatIfTarget]);

  const actualR = entry.rMultiple ?? replay?.stats.realizedRR ?? null;
  const delta = result && actualR !== null ? result.r - actualR : null;
  const riskDistance = Math.abs(entry.entry - whatIfStop);
  const rr = riskDistance > 0 ? Math.abs(whatIfTarget - entry.entry) / riskDistance : null;

  const stopPresets = [
    { label: 'Actual SL', value: defaultStop(entry) },
    {
      label: '-0.5R tighter',
      value: entry.entry + (isLong ? -0.5 : 0.5) * Math.abs(entry.entry - defaultStop(entry)),
    },
    { label: 'Breakeven', value: entry.entry },
  ];
  const targetPresets = [
    { label: 'Actual TP', value: defaultTarget(entry) },
    {
      label: '1:2 R:R',
      value: entry.entry + (isLong ? 2 : -2) * Math.abs(entry.entry - defaultStop(entry)),
    },
    {
      label: '1:3 Aegis floor',
      value: entry.entry + (isLong ? 3 : -3) * Math.abs(entry.entry - defaultStop(entry)),
    },
    ...(replay?.mfe.price !== undefined ? [{ label: 'Peak MFE', value: replay.mfe.price }] : []),
  ];

  const setStopSafe = (value: number) => setWhatIfStop(clamp(value, stopMin, stopMax));
  const setTargetSafe = (value: number) => setWhatIfTarget(clamp(value, targetMin, targetMax));

  return (
    <div className="surface-well border-white/[0.07] flex flex-col gap-3 rounded-xl border bg-[#090a0b] p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-fg-muted font-mono text-[10px] font-semibold tracking-[0.14em] uppercase">
          What-if replay lab
        </span>
        <span className="text-fg-subtle font-mono text-[9px] tabular-nums">
          {replay?.candles.length ?? 0} candles · {replay?.timeframe.toUpperCase() ?? '—'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.06]">
        <div className="bg-[#0d0e10] px-2 py-1.5">
          <div className="text-fg-subtle font-mono text-[8px] tracking-wider uppercase">
            Outcome
          </div>
          <div
            className={cn(
              'font-mono text-[11px] font-bold',
              result?.outcome === 'TARGET HIT'
                ? 'text-bull'
                : result?.outcome === 'STOPPED OUT'
                  ? 'text-bear'
                  : 'text-fg',
            )}
          >
            {result?.outcome ?? '—'}
          </div>
        </div>
        <div className="bg-[#0d0e10] px-2 py-1.5">
          <div className="text-fg-subtle font-mono text-[8px] tracking-wider uppercase">
            Simulated R
          </div>
          <div
            className={cn(
              'font-mono text-[11px] font-bold tabular-nums',
              (result?.r ?? 0) >= 0 ? 'text-bull' : 'text-bear',
            )}
          >
            {result ? `${result.r >= 0 ? '+' : ''}${result.r.toFixed(2)}R` : '—'}
          </div>
        </div>
        <div className="bg-[#0d0e10] px-2 py-1.5">
          <div className="text-fg-subtle font-mono text-[8px] tracking-wider uppercase">
            vs actual
          </div>
          <div
            className={cn(
              'font-mono text-[11px] font-bold tabular-nums',
              delta === null ? 'text-fg-subtle' : delta >= 0 ? 'text-bull' : 'text-bear',
            )}
          >
            {delta === null ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}R`}
          </div>
        </div>
      </div>

      <ScrubberRow
        label="Invalidation"
        value={whatIfStop}
        min={stopMin}
        max={stopMax}
        decimals={decimals}
        tone="bear"
        onChange={setStopSafe}
        presets={stopPresets}
        onPreset={setStopSafe}
      />

      <ScrubberRow
        label="Target"
        value={whatIfTarget}
        min={targetMin}
        max={targetMax}
        decimals={decimals}
        tone="bull"
        onChange={setTargetSafe}
        presets={targetPresets}
        onPreset={setTargetSafe}
      />

      <div className="text-fg-subtle flex flex-wrap items-center justify-between gap-2 font-mono text-[9px] tabular-nums">
        <span>
          Risk {riskDistance.toFixed(decimals)} pts · R:R {rr !== null ? `1:${rr.toFixed(2)}` : '—'}
        </span>
        <span className="text-fg-subtle/70">Conservative: stop checked before target per bar.</span>
      </div>
    </div>
  );
}

function ScrubberRow({
  label,
  value,
  min,
  max,
  decimals,
  tone,
  onChange,
  presets,
  onPreset,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  decimals: number;
  tone: 'bull' | 'bear';
  onChange: (value: number) => void;
  presets: Array<{ label: string; value: number }>;
  onPreset: (value: number) => void;
}) {
  const step = Math.max(0.00001, (max - min) / 200);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-fg-subtle font-mono text-[9px] tracking-wider uppercase">
          {label}
        </span>
        <span
          className={cn(
            'font-mono text-[11px] font-semibold tabular-nums',
            tone === 'bull' ? 'text-bull' : 'text-bear',
          )}
        >
          {value.toFixed(decimals)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={`${label} price`}
        onChange={(event) => onChange(Number(event.target.value))}
        className={cn('w-full cursor-pointer', tone === 'bull' ? 'accent-bull' : 'accent-bear')}
      />
      <div className="flex flex-wrap gap-1">
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => onPreset(preset.value)}
            className="border-white/[0.08] text-fg-subtle hover:border-brand/40 hover:text-brand inline-flex min-h-11 items-center rounded border sm:min-h-7 bg-white/[0.02] px-1.5 font-mono text-[8px] transition-colors"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
