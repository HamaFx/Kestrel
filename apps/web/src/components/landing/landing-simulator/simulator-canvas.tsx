'use client';

// SPDX-License-Identifier: Apache-2.0

// Right-column interactive canvas of the landing committee simulator:
// compact 4-desk alignment ribbon, SVG price setup bands chart, and
// verified/vetoed execution bar.
import { IconCheck, IconClock, IconRefresh, IconShieldCheck } from '@tabler/icons-react';
import { AnimatePresence } from 'motion/react';

import { cn } from '@/lib/formatters/cn';

import type { Scenario, SimulationStage } from './scenarios';
import { DispatchedCard, DispatchingCard } from './simulator-dispatch';
import { SimulatorSetupChart } from './simulator-setup-chart';
import { VerifiedPlanCard, VetoedVerdictCard } from './simulator-verdict';

interface SimulatorCanvasProps {
  scenario: Scenario;
  stage: SimulationStage;
  riskPercent: number;
  isVetoed: boolean;
  effectiveScore: number;
  effectiveBullProb: number;
  copiedHash: boolean;
  onCopyHash: (text: string) => void;
  onDispatch: () => void;
  onReset: () => void;
  onRepairRisk: () => void;
}

export function SimulatorCanvas({
  scenario,
  stage,
  riskPercent,
  isVetoed,
  effectiveScore,
  effectiveBullProb,
  copiedHash,
  onCopyHash,
  onDispatch,
  onReset,
  onRepairRisk,
}: SimulatorCanvasProps) {
  const desks = [
    { id: '01', code: 'MACRO', score: scenario.macroScore, vetoed: false },
    { id: '02', code: 'TECH', score: scenario.techScore, vetoed: false },
    {
      id: '03',
      code: 'RISK ≤ 1%',
      score: isVetoed ? 12 : scenario.riskScore,
      vetoed: isVetoed,
    },
    { id: '04', code: 'COT FLOW', score: scenario.sentimentScore, vetoed: false },
  ] as const;

  const isActive = stage !== 'idle';

  return (
    <div className="lg:col-span-8">
      <div className="surface-panel relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-white/12 bg-[#141517]/95 p-5 shadow-2xl sm:p-6">
        {/* Top Status Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3.5">
          <div className="flex items-center gap-2.5">
            <IconShieldCheck className="text-brand size-4" />
            <span className="text-fg font-mono text-xs font-bold tracking-[0.12em] uppercase">
              {scenario.symbol} · {scenario.name}
            </span>
          </div>

          <div className="flex items-center gap-2 font-mono text-[11px]">
            {stage === 'idle' && (
              <span className="text-fg-subtle flex items-center gap-1.5 rounded border border-white/10 bg-black/40 px-2.5 py-1">
                <IconClock className="size-3.5" /> READY
              </span>
            )}
            {stage === 'voting' && (
              <span className="text-warn border-warn/30 bg-warn/10 flex items-center gap-1.5 rounded border px-2.5 py-1">
                <IconRefresh className="size-3.5 animate-spin" /> SCORING 4 DESKS...
              </span>
            )}
            {(stage === 'verdict' || stage === 'dispatching' || stage === 'dispatched') && (
              <span
                className={cn(
                  'flex items-center gap-1.5 rounded border px-2.5 py-1 font-bold',
                  isVetoed
                    ? 'text-bear border-bear/35 bg-bear/10'
                    : 'text-bull border-bull/35 bg-bull/10',
                )}
              >
                <IconCheck className="size-3.5" />
                {isVetoed
                  ? `VETOED (${riskPercent.toFixed(2)}% > 1.0%)`
                  : `4/4 VERIFIED · ${effectiveScore}%`}
              </span>
            )}
          </div>
        </div>

        {/* Compact 4-Desk Alignment Ribbon (replaces 4 tall text cards + tug-of-war box) */}
        <div className="my-3.5 rounded-xl border border-white/[0.07] bg-[#0a0b0d] p-3">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {desks.map((desk) => (
              <div
                key={desk.id}
                className={cn(
                  'rounded-lg border px-3 py-2 font-mono transition-colors',
                  isActive && desk.vetoed
                    ? 'border-bear/45 bg-bear/10'
                    : isActive
                      ? 'border-white/10 bg-[#121417]'
                      : 'border-white/[0.05] bg-black/40',
                )}
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-fg-subtle">
                    {desk.id} {desk.code}
                  </span>
                  <span
                    className={cn(
                      'font-bold tabular-nums',
                      !isActive
                        ? 'text-fg-subtle'
                        : desk.vetoed
                          ? 'text-bear'
                          : 'text-bull',
                    )}
                  >
                    {stage === 'idle' ? '--' : stage === 'voting' ? '...' : `${desk.score}%`}
                  </span>
                </div>
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      desk.vetoed ? 'bg-bear' : 'bg-bull',
                    )}
                    style={{
                      width:
                        stage === 'idle'
                          ? '0%'
                          : stage === 'voting'
                            ? '55%'
                            : `${desk.score}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Single-line Bull/Bear Alignment Meter */}
          <div className="mt-2.5 flex items-center gap-3 border-t border-white/[0.06] pt-2.5 font-mono text-[11px]">
            <span className="text-bull shrink-0 font-bold tabular-nums">
              BULL {stage === 'idle' ? '--' : `${effectiveBullProb}%`}
            </span>
            <div className="relative flex h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="bg-bull h-full transition-all duration-500"
                style={{ width: stage === 'idle' ? '50%' : `${effectiveBullProb}%` }}
              />
              <div
                className="bg-bear h-full transition-all duration-500"
                style={{ width: stage === 'idle' ? '50%' : `${100 - effectiveBullProb}%` }}
              />
            </div>
            <span className="text-bear shrink-0 font-bold tabular-nums">
              BEAR {stage === 'idle' ? '--' : `${100 - effectiveBullProb}%`}
            </span>
          </div>
        </div>

        {/* Centerpiece SVG Price & Setup Bands Chart */}
        <SimulatorSetupChart scenario={scenario} isVetoed={isVetoed} riskPercent={riskPercent} />

        {/* Verdict / Dispatch Hardware Bar */}
        <div className="mt-3.5">
          <AnimatePresence mode="wait">
            {stage === 'verdict' && isVetoed && (
              <VetoedVerdictCard riskPercent={riskPercent} onRepairRisk={onRepairRisk} />
            )}

            {stage === 'verdict' && !isVetoed && (
              <VerifiedPlanCard
                scenario={scenario}
                riskPercent={riskPercent}
                copiedHash={copiedHash}
                onCopyHash={onCopyHash}
                onDispatch={onDispatch}
              />
            )}

            {stage === 'dispatching' && <DispatchingCard scenario={scenario} />}

            {stage === 'dispatched' && (
              <DispatchedCard
                scenario={scenario}
                copiedHash={copiedHash}
                onCopyHash={onCopyHash}
                onReset={onReset}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
