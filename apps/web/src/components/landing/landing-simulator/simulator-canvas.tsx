'use client';

// SPDX-License-Identifier: Apache-2.0

// 4-pillar conviction strip, interactive setup chart, and bull/bear tug-of-war
// bar for the landing simulator.
import { m } from 'motion/react';

import { cn } from '@/lib/formatters/cn';

import type { Scenario, SimulationStage } from './scenarios';
import { SimulatorSetupChart } from './simulator-setup-chart';

interface SimulatorCanvasProps {
  scenario: Scenario;
  simulationStage: SimulationStage;
  isVetoed: boolean;
}

export function SimulatorCanvas({ scenario, simulationStage, isVetoed }: SimulatorCanvasProps) {
  const pillars = [
    {
      label: 'Price Action',
      score: `${scenario.techScore}%`,
      width: `${scenario.techScore}%`,
      tone: 'text-bull',
      bar: 'bg-bull',
      detail: 'Structure & Key Level',
    },
    {
      label: 'News & Macro',
      score: `${scenario.macroScore}%`,
      width: `${scenario.macroScore}%`,
      tone: 'text-info',
      bar: 'bg-info',
      detail: 'Yields & Event Catalyst',
    },
    {
      label: '1% Risk Guard',
      score: isVetoed ? 'VETO' : `${scenario.riskScore}%`,
      width: isVetoed ? '100%' : `${scenario.riskScore}%`,
      tone: isVetoed ? 'text-bear' : 'text-warn',
      bar: isVetoed ? 'bg-bear' : 'bg-warn',
      detail: isVetoed ? 'Exceeds 1.0% Cap' : `Sized at ${scenario.kellySize}`,
    },
    {
      label: 'Smart Money',
      score: `${scenario.sentimentScore}%`,
      width: `${scenario.sentimentScore}%`,
      tone: 'text-brand',
      bar: 'bg-brand',
      detail: 'Whale Flow vs. Retail',
    },
  ] as const;

  return (
    <div className="my-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-fg-subtle font-mono text-xs font-bold tracking-wider uppercase">
          4-PILLAR CONVICTION CHECK
        </span>
        <span
          className={cn(
            'flex items-center gap-2 font-mono text-xs font-bold',
            isVetoed ? 'text-bear' : 'text-bull',
          )}
        >
          <span className={cn('size-2 rounded-full', isVetoed ? 'bg-bear' : 'bg-bull')} />
          {simulationStage === 'voting'
            ? 'RE-SCANNING MARKET STRUCTURE...'
            : isVetoed
              ? 'BLOCKED BY 1.0% RISK GUARDRAIL'
              : `ALL 4 PILLARS ALIGNED · ${scenario.consensusScore}% CONVICTION`}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/[0.06] lg:grid-cols-4">
        {pillars.map((pillar, idx) => (
          <div key={pillar.label} className="bg-[#0f1011] p-4">
            <div className="mb-2 flex items-center justify-between font-mono text-xs">
              <span className={cn('font-bold uppercase', pillar.tone)}>{pillar.label}</span>
              <span
                className={cn(
                  'font-bold tabular-nums',
                  pillar.score === 'VETO' ? 'text-bear' : 'text-fg',
                )}
              >
                {pillar.score}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/5">
              <m.div
                className={cn('h-full rounded-full transition-colors duration-300', pillar.bar)}
                initial={{ width: 0 }}
                animate={{
                  width: simulationStage === 'voting' ? '35%' : pillar.width,
                }}
                transition={{ duration: 0.55, ease: 'easeOut', delay: idx * 0.05 }}
              />
            </div>
            <p className="text-fg-muted mt-2 truncate font-sans text-[11px]">{pillar.detail}</p>
          </div>
        ))}
      </div>

      <SimulatorSetupChart scenario={scenario} stage={simulationStage} isVetoed={isVetoed} />

      {/* Dynamic Tug-of-War Directional Probability Split */}
      <div className="mt-4 rounded-xl border border-white/5 bg-black/40 p-3">
        <div className="mb-2 flex items-center justify-between font-mono text-[11px]">
          <span className="text-bull flex items-center gap-1.5 font-semibold">
            <span className="bg-bull size-1.5 rounded-full" />
            BUYER PRESSURE {scenario.bullProbability}%
          </span>
          <span className="text-fg-subtle hidden sm:inline">DIRECTIONAL EDGE SPLIT</span>
          <span className="text-bear flex items-center gap-1.5 font-semibold">
            SELLER PRESSURE {100 - scenario.bullProbability}%
            <span className="bg-bear size-1.5 rounded-full" />
          </span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-white/10">
          <m.div
            className="bg-bull h-full"
            initial={{ width: '50%' }}
            animate={{ width: `${scenario.bullProbability}%` }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
          <m.div
            className="bg-bear h-full"
            initial={{ width: '50%' }}
            animate={{ width: `${100 - scenario.bullProbability}%` }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
        </div>
      </div>
    </div>
  );
}
