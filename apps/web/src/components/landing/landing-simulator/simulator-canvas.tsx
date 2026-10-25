'use client';

// SPDX-License-Identifier: Apache-2.0

// 4-desk conviction breakdown and the tug-of-war probability bar for the
// landing simulator. Pure presentation: every value arrives via props.
import { m } from 'motion/react';

import { cn } from '@/lib/formatters/cn';

import type { Scenario, SimulationStage } from './scenarios';

interface SimulatorCanvasProps {
  scenario: Scenario;
  simulationStage: SimulationStage;
  isVetoed: boolean;
}

export function SimulatorCanvas({ scenario, simulationStage, isVetoed }: SimulatorCanvasProps) {
  return (
    <div className="my-8">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-fg-subtle font-mono text-xs font-bold tracking-wider uppercase">
          4-DESK CONVICTION BREAKDOWN
        </span>
        <span className="text-brand flex items-center gap-2 font-mono text-xs font-semibold">
          {simulationStage === 'voting' && (
            <>
              <span className="bg-brand size-2 animate-ping rounded-full" />
              <span>ANALYZING MARKET STRUCTURE & MACRO...</span>
            </>
          )}
          {simulationStage !== 'voting' && simulationStage !== 'idle' && (
            <span>COMMITTEE CONSENSUS ({scenario.consensusScore}%)</span>
          )}
          {simulationStage === 'idle' && <span>READY TO ANALYZE</span>}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Desk 1: Technical */}
        <div className="surface-chip rounded-xl border border-white/10 bg-[#161718] p-4">
          <div className="mb-2 flex items-center justify-between font-mono text-xs">
            <span className="text-bull font-bold uppercase">Technical</span>
            <span className="text-fg font-bold tabular-nums">
              {simulationStage === 'idle' ? '--' : `${scenario.techScore}%`}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/5">
            <m.div
              className="bg-bull h-full rounded-full"
              initial={{ width: 0 }}
              animate={{
                width: simulationStage !== 'idle' ? `${scenario.techScore}%` : '0%',
              }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
          <p className="text-fg-muted mt-2 truncate font-sans text-[11px]">
            FVG Retest & Session Sweep
          </p>
        </div>

        {/* Desk 2: Macro */}
        <div className="surface-chip rounded-xl border border-white/10 bg-[#161718] p-4">
          <div className="mb-2 flex items-center justify-between font-mono text-xs">
            <span className="text-info font-bold uppercase">Macro</span>
            <span className="text-fg font-bold tabular-nums">
              {simulationStage === 'idle' ? '--' : `${scenario.macroScore}%`}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/5">
            <m.div
              className="bg-info h-full rounded-full"
              initial={{ width: 0 }}
              animate={{
                width: simulationStage !== 'idle' ? `${scenario.macroScore}%` : '0%',
              }}
              transition={{ duration: 0.9, ease: 'easeOut', delay: 0.1 }}
            />
          </div>
          <p className="text-fg-muted mt-2 truncate font-sans text-[11px]">
            Yields, DXY & Rate Catalysts
          </p>
        </div>

        {/* Desk 3: Risk */}
        <div className="surface-chip rounded-xl border border-white/10 bg-[#161718] p-4">
          <div className="mb-2 flex items-center justify-between font-mono text-xs">
            <span className="text-warn font-bold uppercase">Risk</span>
            <span className={cn('font-bold tabular-nums', isVetoed ? 'text-bear' : 'text-fg')}>
              {simulationStage === 'idle' ? '--' : isVetoed ? 'VETO' : `${scenario.riskScore}%`}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/5">
            <m.div
              className={cn(
                'h-full rounded-full transition-colors duration-300',
                isVetoed ? 'bg-bear' : 'bg-warn',
              )}
              initial={{ width: 0 }}
              animate={{
                width:
                  simulationStage !== 'idle'
                    ? isVetoed
                      ? '100%'
                      : `${scenario.riskScore}%`
                    : '0%',
              }}
              transition={{ duration: 0.7, ease: 'easeOut', delay: 0.2 }}
            />
          </div>
          <p className="text-fg-muted mt-2 truncate font-sans text-[11px]">
            {isVetoed ? 'Risk Limit Exceeded (>1.0%)' : 'Within 1.0% Risk Guardrail'}
          </p>
        </div>

        {/* Desk 4: Sentiment */}
        <div className="surface-chip rounded-xl border border-white/10 bg-[#161718] p-4">
          <div className="mb-2 flex items-center justify-between font-mono text-xs">
            <span className="text-brand font-bold uppercase">Whales</span>
            <span className="text-fg font-bold tabular-nums">
              {simulationStage === 'idle' ? '--' : `${scenario.sentimentScore}%`}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/5">
            <m.div
              className="bg-brand h-full rounded-full"
              initial={{ width: 0 }}
              animate={{
                width: simulationStage !== 'idle' ? `${scenario.sentimentScore}%` : '0%',
              }}
              transition={{ duration: 0.85, ease: 'easeOut', delay: 0.15 }}
            />
          </div>
          <p className="text-fg-muted mt-2 truncate font-sans text-[11px]">
            CFTC Institutional Positioning
          </p>
        </div>
      </div>

      {/* Dynamic Tug-of-War Directional Probability Bar */}
      {simulationStage !== 'idle' && (
        <m.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mt-5 rounded-xl border border-white/5 bg-black/40 p-3"
        >
          <div className="mb-2 flex items-center justify-between font-mono text-[11px]">
            <span className="text-bull flex items-center gap-1.5 font-semibold">
              <span className="bg-bull size-1.5 rounded-full" />
              BULLISH PROBABILITY {scenario.bullProbability}%
            </span>
            <span className="text-fg-subtle">COMMITTEE BIAS BALANCE</span>
            <span className="text-bear flex items-center gap-1.5 font-semibold">
              BEARISH PROBABILITY {100 - scenario.bullProbability}%
              <span className="bg-bear size-1.5 rounded-full" />
            </span>
          </div>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-white/10">
            <m.div
              className="bg-bull h-full"
              initial={{ width: '50%' }}
              animate={{ width: `${scenario.bullProbability}%` }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
            />
            <m.div
              className="bg-bear h-full"
              initial={{ width: '50%' }}
              animate={{ width: `${100 - scenario.bullProbability}%` }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
            />
          </div>
        </m.div>
      )}
    </div>
  );
}
