'use client';

// SPDX-License-Identifier: Apache-2.0

// Left-column control deck for the landing simulator: scenario selector cards,
// interactive 1.0% max-loss risk governor slider, and committee re-run button.
import { IconAlertTriangle, IconLock, IconRefresh } from '@tabler/icons-react';
import { m } from 'motion/react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/formatters/cn';

import { SCENARIOS, type SimulationStage } from './scenarios';

interface SimulatorControlsProps {
  selectedIdx: number;
  riskPercent: number;
  isVetoed: boolean;
  stage: SimulationStage;
  onSelectScenario: (idx: number) => void;
  onRiskChange: (value: number) => void;
  onReconvene: () => void;
}

export function SimulatorControls({
  selectedIdx,
  riskPercent,
  isVetoed,
  stage,
  onSelectScenario,
  onRiskChange,
  onReconvene,
}: SimulatorControlsProps) {
  const riskDollars = Math.round(100_000 * (riskPercent / 100));

  return (
    <div className="flex flex-col justify-between gap-4 lg:col-span-4">
      {/* Scenario Selector Stack */}
      <div className="flex flex-col gap-2.5" role="tablist" aria-label="Market scenarios">
        <div className="text-fg-subtle px-1 font-mono text-[11px] tracking-wider uppercase">
          SELECT MARKET SCENARIO
        </div>

        {SCENARIOS.map((sc, idx) => {
          const isSelected = idx === selectedIdx;
          const isLong = sc.action.startsWith('BUY');
          return (
            <button
              key={sc.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => onSelectScenario(idx)}
              className={cn(
                'relative flex flex-col gap-1.5 rounded-xl border p-3.5 text-left transition-colors duration-200',
                isSelected
                  ? 'border-brand/50 bg-[#17181b] shadow-lg'
                  : 'border-white/[0.07] bg-[#121316]/90 hover:border-white/15',
              )}
            >
              {isSelected && (
                <m.div
                  layoutId="simulator-scenario-active-pill"
                  className="border-brand/40 bg-brand/[0.05] absolute inset-0 rounded-xl border"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                />
              )}

              <div className="relative z-10 flex items-center justify-between gap-2 font-mono text-xs">
                <span className="text-fg font-bold">{sc.symbol}</span>
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'rounded border px-1.5 py-0.5 text-[10px] font-bold',
                      isLong
                        ? 'text-bull border-bull/30 bg-bull/10'
                        : 'text-bear border-bear/30 bg-bear/10',
                    )}
                  >
                    {sc.action}
                  </span>
                  <span className="text-brand border-brand/30 bg-brand/10 rounded border px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                    {sc.rr}
                  </span>
                </div>
              </div>

              <div className="text-fg relative z-10 font-sans text-sm font-medium">{sc.name}</div>
              <p className="text-fg-muted relative z-10 line-clamp-2 font-sans text-xs leading-relaxed">
                {sc.catalyst}
              </p>
            </button>
          );
        })}
      </div>

      {/* Interactive 1.0% Risk Governor Slider */}
      <div
        className={cn(
          'rounded-xl border p-4 transition-colors duration-200',
          isVetoed
            ? 'border-bear/50 bg-bear/[0.06] shadow-[0_0_24px_rgba(229,72,77,0.14)]'
            : 'border-white/10 bg-[#121316]',
        )}
      >
        <div className="flex items-center justify-between gap-2 font-mono text-xs">
          <span className="text-fg flex items-center gap-1.5 font-bold uppercase">
            <IconLock className="text-brand size-3.5" />
            RISK GUARDRAIL
          </span>
          <span
            className={cn(
              'font-bold tabular-nums',
              isVetoed ? 'text-bear' : 'text-bull',
            )}
          >
            {riskPercent.toFixed(2)}% · ${riskDollars.toLocaleString('en-US')}
          </span>
        </div>

        <p className="text-fg-muted mt-1 font-sans text-xs">
          Drag above 1.00% ($1,000 on $100k) to trigger the Risk Desk veto.
        </p>

        <div className="mt-3 flex items-center gap-3 font-mono text-[11px]">
          <span className="text-fg-subtle">0.5%</span>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.05"
            value={riskPercent}
            aria-label="Max account risk percentage"
            aria-valuemin={0.5}
            aria-valuemax={2.0}
            aria-valuenow={riskPercent}
            onChange={(e) => onRiskChange(parseFloat(e.target.value))}
            className="accent-brand w-full cursor-pointer"
          />
          <span className="text-fg-subtle">2.0%</span>
        </div>

        {isVetoed && (
          <div className="border-bear/40 bg-bear/15 text-bear mt-3 flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 font-mono text-[11px]">
            <span className="flex items-center gap-1.5 font-bold">
              <IconAlertTriangle className="size-3.5 shrink-0" />
              CAP EXCEEDED (&gt; 1.00%)
            </span>
            <button
              type="button"
              onClick={() => onRiskChange(0.85)}
              className="underline hover:text-white"
            >
              Reset 0.85%
            </button>
          </div>
        )}
      </div>

      {/* Re-run 4 Desks Action */}
      <Button
        variant="secondary"
        size="md"
        onClick={onReconvene}
        disabled={stage === 'voting'}
        className="w-full justify-center gap-2 border-white/10 font-mono text-xs uppercase"
      >
        <IconRefresh className={cn('size-3.5', stage === 'voting' && 'animate-spin')} />
        <span>{stage === 'voting' ? 'Scoring 4 Desks...' : 'Re-Run 4-Desk Check'}</span>
      </Button>
    </div>
  );
}
