'use client';

// SPDX-License-Identifier: Apache-2.0

// Live 4-stage Kestrel Plasma Circuit Spine + 2×2 live desk matrix shown while
// the council deliberates. The circuit trace lives in `syndicate-spine.tsx`
// (adapted from `landing-stepper/circuit-spine.tsx`); the desk tiles in
// `syndicate-live-desk-tile.tsx`. 100% SVG/CSS — no WebGL in `/chat`
// (Locked Decision 2A). Replaced the legacy pixel-desk thinking card
// (Locked Decision 4A).
import { useEffect, useState } from 'react';

import { cn } from '@/lib/formatters/cn';
import { FOUR_SPECIALIST_DESKS, resolveStrategistDesk } from '@/lib/kestrel-strategist-desks';

import { LiveDeskTile } from './syndicate-live-desk-tile';
import { SyndicateSpine } from './syndicate-spine';

/** Minimal structural shape both transport and deliberation progress satisfy. */
export interface CircuitAgentProgress {
  mode?: string;
  stage?: string;
  agents?: ReadonlyArray<{
    agentName: string;
    status: 'pending' | 'running' | 'done' | 'error';
    opinion?: { bias: 'bullish' | 'bearish' | 'neutral'; confidence: number } | undefined;
  }>;
}

interface StageDef {
  id: string;
  title: string;
  caption: string;
}

const FULL_COUNCIL_STAGES: readonly StageDef[] = [
  {
    id: 'collect-packet',
    title: 'Live Market Data',
    caption: 'Checking 15m/1H/4H candles, volatility (ATR), interest rates, COT positioning, and news',
  },
  {
    id: 'deliberation',
    title: '4-Angle Analysis',
    caption: 'Evaluating Economy & News, Chart Levels, Risk Sizing, and Market Sentiment',
  },
  {
    id: 'verify',
    title: 'Risk & Level Verification',
    caption: 'Verifying key price levels and 1.0% maximum risk guardrails',
  },
  {
    id: 'fusion',
    title: 'Final Trade Plan',
    caption: 'Combining all findings into one clear trade summary',
  },
];

const FAST_SCOUT_STAGES: readonly StageDef[] = [
  {
    id: 'collect-packet',
    title: 'Live Market Data',
    caption: 'Checking live price, chart structure, and technical indicators',
  },
  {
    id: 'deliberation',
    title: 'Market Check',
    caption: 'Mapping trend direction, key levels, and stop-loss zones',
  },
  {
    id: 'verify',
    title: 'Verification',
    caption: 'Verifying price numbers against live market data',
  },
];

/** Map a live committee step id onto its circuit stage row. */
function stageIndexFor(step: string | undefined, stages: readonly StageDef[]): number {
  if (!step) return 0;
  if (step === 'fusion') return stages.length - 1;
  if (step === 'verify') {
    const idx = stages.findIndex((s) => s.id === 'verify');
    return idx >= 0 ? idx : stages.length - 2;
  }
  if (step === 'collect-packet') return 0;
  return stages.findIndex((s) => s.id === 'deliberation');
}

export function SyndicateCircuitLive({
  agentProgress,
  fallbackMode,
  className,
}: {
  agentProgress?: CircuitAgentProgress | null;
  fallbackMode?: string;
  className?: string;
}) {
  const mode = agentProgress?.mode ?? fallbackMode ?? 'full';
  const isSingle = mode === 'single';
  const stages = isSingle ? FAST_SCOUT_STAGES : FULL_COUNCIL_STAGES;
  const liveStage = agentProgress?.stage;
  const agents = Array.isArray(agentProgress?.agents) ? agentProgress.agents : [];
  const allDone =
    agents.length > 0 && agents.every((a) => a.status === 'done' || a.status === 'error');
  const doneCount = agents.filter((a) => a.status === 'done').length;

  // Graceful fallback progression when no live telemetry is attached yet
  // (e.g. the transport has not emitted its first snapshot).
  const [fallbackStep, setFallbackStep] = useState(0);
  useEffect(() => {
    if (liveStage || allDone) return;
    const timer = setInterval(() => {
      setFallbackStep((prev) => Math.min(prev + 1, stages.length - 2));
    }, 2400);
    return () => clearInterval(timer);
  }, [liveStage, allDone, stages.length]);

  const activeIndex = liveStage
    ? stageIndexFor(liveStage, stages)
    : allDone
      ? stages.length - 1
      : fallbackStep;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Council deliberation in progress"
      className={cn(
        'surface-panel border-edge/80 bg-bg-elev-1 flex w-full max-w-2xl flex-col gap-3 rounded-xl border p-4 shadow-sm',
        className,
      )}
      style={{
        borderColor: 'rgba(255, 54, 22, 0.45)',
        backgroundImage:
          'radial-gradient(ellipse 52% 44% at 100% 0%, rgba(255,54,22,0.10) 0%, transparent 70%)',
      }}
    >
      <div className="border-border/40 flex items-center justify-between gap-2 border-b pb-2.5">
        <div className="flex items-center gap-2">
          <span className="bg-brand size-2 animate-pulse rounded-full" />
          <span className="text-fg font-mono text-[11px] font-semibold tracking-wider uppercase">
            {isSingle ? 'QUICK ANSWER · CHECKING DATA' : 'DEEP ANALYSIS IN PROGRESS'}
          </span>
        </div>
        <span className="text-fg-muted font-mono text-xs tabular-nums">
          {agents.length > 0
            ? `${doneCount}/${agents.length} CHECKS READY`
            : `STEP ${activeIndex + 1} OF ${stages.length}`}
        </span>
      </div>

      <div className="flex gap-3">
        <div
          className="relative w-8 shrink-0 self-stretch"
          style={{ minHeight: `${stages.length * 54}px` }}
        >
          <SyndicateSpine activeIndex={activeIndex} count={stages.length} />
        </div>
        <ol className="flex min-w-0 flex-1 flex-col justify-between gap-1.5">
          {stages.map((stage, idx) => {
            const isActive = idx === activeIndex;
            const isDone = idx < activeIndex;
            return (
              <li
                key={stage.id}
                data-stage={stage.id}
                data-active={isActive ? 'true' : 'false'}
                aria-current={isActive ? 'step' : undefined}
                className={cn(
                  'rounded-lg border px-2.5 py-1.5 transition-colors',
                  isActive
                    ? 'border-brand/40 bg-brand/[0.06]'
                    : isDone
                      ? 'border-bull/25 bg-bull/[0.04]'
                      : 'border-edge/50',
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'font-mono text-[10px] font-bold tracking-wider uppercase',
                      isActive ? 'text-brand' : isDone ? 'text-bull' : 'text-fg-subtle',
                    )}
                  >
                    STAGE 0{idx + 1} · {stage.title}
                  </span>
                </div>
                <p className="text-fg-muted mt-0.5 text-[11px] leading-snug">{stage.caption}</p>
              </li>
            );
          })}
        </ol>
      </div>

      {!isSingle ? (
        <div className="grid grid-cols-2 gap-2">
          {FOUR_SPECIALIST_DESKS.map((desk) => {
            const agent = agents.find(
              (candidate) => resolveStrategistDesk(candidate.agentName).id === desk.id,
            );
            return (
              <LiveDeskTile
                key={desk.id}
                desk={desk}
                status={agent?.status ?? 'pending'}
                {...(agent?.opinion?.bias ? { bias: agent.opinion.bias } : {})}
                {...(agent?.opinion?.confidence !== undefined
                  ? { confidence: agent.opinion.confidence }
                  : {})}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
