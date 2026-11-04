'use client';

// SPDX-License-Identifier: Apache-2.0

// Simulated entry / stop / target bands for the landing simulator. The
// scenarios carry certified price levels but no candle series, so this is a
// schematic path through the levels, not fabricated OHLC bars.
import { m } from 'motion/react';

import { cn } from '@/lib/formatters/cn';

import type { Scenario, SimulationStage } from './scenarios';

const Y_TOP = 10;
const Y_BOTTOM = 90;

type Tone = 'bull' | 'bear' | 'neutral';

function parsePrice(value: string): number | null {
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatPrice(value: number): string {
  const decimals = value >= 100 ? 2 : 4;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function SimulatorSetupChart({
  scenario,
  stage,
  isVetoed,
}: {
  scenario: Scenario;
  stage: SimulationStage;
  isVetoed: boolean;
}) {
  const entry = parsePrice(scenario.entry);
  const stop = parsePrice(scenario.invalidation);
  const targets = [scenario.target1, scenario.target2, scenario.target3]
    .map(parsePrice)
    .filter((value): value is number => value !== null);

  if (entry === null || stop === null || targets.length === 0) return null;

  const prices = [entry, stop, ...targets];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const padding = (max - min) * 0.16 || max * 0.002 || 1;
  const low = min - padding;
  const high = max + padding;
  const span = high - low || 1;

  const yFor = (price: number) => Y_TOP + (1 - (price - low) / span) * (Y_BOTTOM - Y_TOP);
  const entryY = yFor(entry);
  const stopY = yFor(stop);
  const targetYs = targets.map((target) => yFor(target));
  const lastTargetY = targetYs[targetYs.length - 1] ?? entryY;
  const isLong = entry > stop;
  const rewardTop = Math.min(entryY, lastTargetY);
  const rewardHeight = Math.abs(lastTargetY - entryY);
  const riskTop = Math.min(entryY, stopY);
  const riskHeight = Math.abs(stopY - entryY);

  const pathPoints: Array<readonly [number, number]> = [
    [14, entryY],
    [28, yFor(entry + (stop - entry) * 0.45)],
    [48, yFor(targets[0] ?? entry)],
    [68, yFor(targets[1] ?? targets[0] ?? entry)],
    [90, yFor(targets[2] ?? targets[1] ?? targets[0] ?? entry)],
  ];
  const path = pathPoints
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y.toFixed(2)}`)
    .join(' ');
  const live = stage !== 'idle';

  const levels: Array<{ key: string; label: string; price: number; y: number; tone: Tone }> = [
    {
      key: 'tp3',
      label: 'TP3',
      price: targets[2] ?? targets[targets.length - 1] ?? entry,
      y: targetYs[2] ?? lastTargetY,
      tone: 'bull',
    },
    {
      key: 'tp2',
      label: 'TP2',
      price: targets[1] ?? targets[targets.length - 1] ?? entry,
      y: targetYs[1] ?? lastTargetY,
      tone: 'bull',
    },
    {
      key: 'tp1',
      label: 'TP1',
      price: targets[0] ?? entry,
      y: targetYs[0] ?? entryY,
      tone: 'bull',
    },
    { key: 'entry', label: 'ENTRY', price: entry, y: entryY, tone: 'neutral' },
    { key: 'stop', label: 'SL', price: stop, y: stopY, tone: 'bear' },
  ];

  return (
    <div className="my-5 rounded-xl border border-white/5 bg-black/40 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px]">
        <span className="text-fg-subtle flex items-center gap-1.5 font-semibold tracking-wider uppercase">
          <span className="bg-brand size-1.5 rounded-full" />
          Simulated setup bands
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase',
              isLong
                ? 'border-bull/30 bg-bull/10 text-bull'
                : 'border-bear/30 bg-bear/10 text-bear',
            )}
          >
            {scenario.action}
          </span>
          <span className="text-fg-subtle text-[9px]">R:R {scenario.rr}</span>
          {isVetoed ? (
            <span className="border-bear/30 bg-bear/10 text-bear rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase">
              Veto
            </span>
          ) : null}
        </div>
      </div>

      <div
        className="surface-well relative h-44 overflow-hidden rounded-lg"
        role="img"
        aria-label={`Simulated setup for ${scenario.symbol}: entry ${scenario.entry}, stop ${scenario.invalidation}, targets ${scenario.target1}, ${scenario.target2}, ${scenario.target3}`}
      >
        <div className="absolute inset-y-0 right-20 left-0" aria-hidden="true">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
          >
            <line
              x1="0"
              x2="100"
              y1={rewardTop}
              y2={rewardTop}
              stroke="var(--chart-grid)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <rect
              x="0"
              y={rewardTop}
              width="100"
              height={rewardHeight}
              fill="var(--chart-positive)"
              fillOpacity={0.07}
            />
            <rect
              x="0"
              y={riskTop}
              width="100"
              height={riskHeight}
              fill="var(--chart-negative)"
              fillOpacity={0.1}
            />

            {levels.map((level) => (
              <line
                key={level.key}
                x1="0"
                x2="100"
                y1={level.y}
                y2={level.y}
                stroke={
                  level.tone === 'bull'
                    ? 'var(--chart-positive)'
                    : level.tone === 'bear'
                      ? 'var(--chart-negative)'
                      : 'var(--chart-line-primary)'
                }
                strokeOpacity={level.key === 'entry' ? 0.8 : 0.45}
                strokeWidth="1"
                strokeDasharray={level.key === 'entry' ? undefined : '4 3'}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            <m.path
              d={path}
              fill="none"
              stroke="var(--chart-line-primary)"
              strokeOpacity={0.8}
              strokeWidth="1.5"
              strokeDasharray="3 2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              initial={false}
              animate={{ pathLength: live ? 1 : 0.2, opacity: live ? 1 : 0.35 }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
            />

            {isVetoed ? (
              <rect
                x="0"
                y={rewardTop}
                width="100"
                height={rewardHeight}
                fill="transparent"
                stroke="var(--chart-negative)"
                strokeOpacity="0.35"
                strokeWidth="1"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>

          <span
            className="bg-brand absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: '14%', top: `${entryY}%` }}
          />
        </div>

        <div className="absolute inset-y-0 right-0 w-20" aria-hidden="true">
          {levels.map((level) => (
            <div
              key={level.key}
              className="absolute right-1.5 -translate-y-1/2 text-right font-mono whitespace-nowrap tabular-nums"
              style={{ top: `${level.y}%` }}
            >
              <span
                className={cn(
                  'text-[9px] tracking-wider uppercase',
                  level.tone === 'bull'
                    ? 'text-bull'
                    : level.tone === 'bear'
                      ? 'text-bear'
                      : 'text-brand',
                )}
              >
                {level.label}
              </span>
              <span className="text-fg ml-1 text-[9px]">{formatPrice(level.price)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
