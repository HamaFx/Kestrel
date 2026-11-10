'use client';

// SPDX-License-Identifier: Apache-2.0

// Simulated entry / stop / target bands for the landing simulator, built on
// `bklit-tanstack-charts` (`LineChart` + `ReferenceArea` reward/risk zones +
// `LineSeriesTerminalMarker`).
import {
  ChartTooltip,
  Grid,
  Line,
  LineChart,
  LineSeriesTerminalMarker,
  ReferenceArea,
  TooltipContent,
} from 'bklit-tanstack-charts';
import { useMemo } from 'react';

import { cn } from '@/lib/formatters/cn';

import type { Scenario, SimulationStage } from './scenarios';

type Tone = 'bull' | 'bear' | 'neutral';

interface LevelItem {
  key: string;
  label: string;
  price: number;
  tone: Tone;
}

interface SetupPoint extends Record<string, unknown> {
  date: Date;
  stepLabel: string;
  price: number;
}

const BASE_TIME_MS = Date.UTC(2026, 0, 1);
const HOUR_MS = 3_600_000;

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

interface SimulatorSetupChartScenario {
  symbol: string;
  action: string;
  entry: string;
  invalidation: string;
  target1: string;
  target2: string;
  target3: string;
  rr: string;
  [key: string]: unknown;
}

export function SimulatorSetupChart({
  scenario,
  stage,
  isVetoed,
}: {
  scenario: Scenario | SimulatorSetupChartScenario;
  stage: SimulationStage | 'complete';
  isVetoed: boolean;
}) {
  const entry = parsePrice(scenario.entry);
  const stop = parsePrice(scenario.invalidation);
  const targets = useMemo(
    () =>
      [scenario.target1, scenario.target2, scenario.target3]
        .map(parsePrice)
        .filter((value): value is number => value !== null),
    [scenario.target1, scenario.target2, scenario.target3],
  );

  const data = useMemo<SetupPoint[]>(() => {
    if (entry === null || stop === null || targets.length === 0) return [];
    const tp1 = targets[0] ?? entry;
    const tp2 = targets[1] ?? tp1;
    const tp3 = targets[2] ?? tp2;
    const retest = entry + (stop - entry) * 0.38;
    const steps: ReadonlyArray<readonly [string, number]> = [
      ['Entry Anchor', entry],
      ['Liquidity Sweep', retest],
      ['Target 1 (TP1)', tp1],
      ['Target 2 (TP2)', tp2],
      ['Target 3 (TP3)', tp3],
    ];
    return steps.map(([stepLabel, price], index) => ({
      date: new Date(BASE_TIME_MS + index * HOUR_MS),
      stepLabel,
      price,
    }));
  }, [entry, stop, targets]);

  if (entry === null || stop === null || targets.length === 0 || data.length === 0) {
    return null;
  }

  const lastTarget = targets[targets.length - 1] ?? entry;
  const isLong = entry > stop;
  const live = stage !== 'idle';

  const levels: LevelItem[] = [
    {
      key: 'tp3',
      label: 'TP3',
      price: targets[2] ?? lastTarget,
      tone: 'bull',
    },
    {
      key: 'tp2',
      label: 'TP2',
      price: targets[1] ?? lastTarget,
      tone: 'bull',
    },
    {
      key: 'tp1',
      label: 'TP1',
      price: targets[0] ?? entry,
      tone: 'bull',
    },
    { key: 'entry', label: 'ENTRY', price: entry, tone: 'neutral' },
    { key: 'stop', label: 'SL', price: stop, tone: 'bear' },
  ];

  return (
    <div className="my-5 rounded-xl border border-white/5 bg-black/40 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
        <span className="text-fg-subtle flex items-center gap-1.5 font-semibold tracking-wider uppercase">
          <span className="bg-brand size-1.5 rounded-full" />
          Simulated setup bands
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[11px] font-bold tracking-wider uppercase',
              isLong
                ? 'border-bull/30 bg-bull/10 text-bull'
                : 'border-bear/30 bg-bear/10 text-bear',
            )}
          >
            {scenario.action}
          </span>
          <span className="text-fg-subtle text-[11px]">R:R {scenario.rr}</span>
          {isVetoed ? (
            <span className="border-bear/30 bg-bear/10 text-bear rounded-full border px-2 py-0.5 text-[11px] font-bold tracking-wider uppercase">
              Veto
            </span>
          ) : null}
        </div>
      </div>

      <div
        className="surface-well relative grid h-48 grid-cols-[1fr_7.25rem] overflow-hidden rounded-lg border border-white/[0.05]"
        role="img"
        aria-label={`Simulated setup for ${scenario.symbol}: entry ${scenario.entry}, stop ${scenario.invalidation}, targets ${scenario.target1}, ${scenario.target2}, ${scenario.target3}`}
      >
        <div className="relative h-full min-w-0">
          <LineChart
            data={data}
            xDataKey="date"
            revealSignature={`${scenario.symbol}-${stage}-${isVetoed ? 'veto' : 'ok'}`}
            animationDuration={live ? 850 : 0}
            aspectRatio="unset"
            style={{ height: '100%', aspectRatio: 'unset' }}
            margin={{ top: 14, right: 12, bottom: 14, left: 12 }}
            ariaLabel={`${scenario.symbol} setup trajectory`}
          >
            <Grid
              horizontal
              numTicksRows={4}
              highlightRowValues={[entry]}
              highlightRowStroke="var(--chart-line-primary)"
              highlightRowStrokeOpacity={0.75}
            />
            <ReferenceArea
              y1={Math.min(entry, lastTarget)}
              y2={Math.max(entry, lastTarget)}
              fill="var(--chart-positive)"
              fillOpacity={isVetoed ? 0.04 : 0.12}
              stroke="var(--chart-positive)"
              strokeStyle="dashed"
              fadeEdges={false}
            />
            <ReferenceArea
              y1={Math.min(entry, stop)}
              y2={Math.max(entry, stop)}
              fill="var(--chart-negative)"
              fillOpacity={0.14}
              stroke="var(--chart-negative)"
              strokeStyle="dashed"
              fadeEdges={false}
            />
            <Line
              dataKey="price"
              stroke={isVetoed ? 'var(--chart-negative)' : 'var(--chart-line-primary)'}
              strokeWidth={2.25}
              dashFromIndex={0}
              dashArray="4,3"
              fadeEdges={false}
              showMarkers
            />
            <LineSeriesTerminalMarker
              dataKey="price"
              stroke={isVetoed ? 'var(--chart-negative)' : 'var(--chart-positive)'}
              fill={isVetoed ? 'var(--chart-negative)' : 'var(--chart-positive)'}
              radius={4}
            />
            <ChartTooltip
              showDatePill={false}
              content={({ point }) => {
                const row = point as SetupPoint;
                return (
                  <TooltipContent
                    title={row.stepLabel}
                    rows={[
                      {
                        color: isVetoed ? 'var(--chart-negative)' : 'var(--chart-line-primary)',
                        label: scenario.symbol,
                        value: formatPrice(row.price),
                      },
                    ]}
                  />
                );
              }}
            />
          </LineChart>
        </div>

        <div
          className="border-border/30 flex flex-col justify-between border-l bg-black/30 px-2 py-2.5"
          aria-hidden="true"
        >
          {levels.map((level) => (
            <div
              key={level.key}
              className="flex items-center justify-between gap-1.5 font-mono whitespace-nowrap tabular-nums"
            >
              <span
                className={cn(
                  'text-[11px] font-semibold tracking-wider uppercase',
                  level.tone === 'bull'
                    ? 'text-bull'
                    : level.tone === 'bear'
                      ? 'text-bear'
                      : 'text-brand',
                )}
              >
                {level.label}
              </span>
              <span className="text-fg text-[11px]">{formatPrice(level.price)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
