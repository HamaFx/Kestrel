'use client';

// SPDX-License-Identifier: Apache-2.0

// Live 5-stage Hoplite Plasma Circuit Spine + 2×2 live desk matrix shown while
// the council deliberates. The circuit trace lives in `syndicate-spine.tsx`
// (adapted from `landing-stepper/circuit-spine.tsx`); the desk tiles in
// `syndicate-live-desk-tile.tsx`. 100% SVG/CSS — no WebGL in `/chat`
// (Locked Decision 2A). Replaced the legacy pixel-desk thinking card
// (Locked Decision 4A).
import { IconSwords } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import type { AgentProgress } from '@/lib/chat-transport';
import { cn } from '@/lib/formatters/cn';
import { FOUR_SPECIALIST_DESKS, resolveStrategistDesk } from '@/lib/kestrel-strategist-desks';

import { LiveDeskTile } from './syndicate-live-desk-tile';
import { SyndicateSpine } from './syndicate-spine';

interface StageDef {
  id: string;
  title: string;
  caption: string;
}

const FULL_COUNCIL_STAGES: readonly StageDef[] = [
  {
    id: 'collect-packet',
    title: 'Market Packet',
    caption: 'Locking 15m/1H/4H candles, ATR-14, FRED real yields, CFTC COT and the news wire',
  },
  {
    id: 'deliberation',
    title: '4-Desk Deliberation',
    caption: 'HORUS · ASTROLABE · HOPLITE · SENTINEL deliberating in parallel',
  },
  {
    id: 'critique',
    title: 'Cross-Examination',
    caption: 'Desks audit peer assumptions and revise conviction',
  },
  {
    id: 'verify',
    title: 'Risk Audit',
    caption: 'Hoplite 1.0% ceiling and numerical grounding against the packet',
  },
  {
    id: 'fusion',
    title: 'Arbiter Synthesis',
    caption: 'Certifying the execution plan and minting the dossier',
  },
];

const FAST_SCOUT_STAGES: readonly StageDef[] = [
  {
    id: 'collect-packet',
    title: 'Market Packet',
    caption: 'Locking live price, structure and indicator feeds',
  },
  {
    id: 'deliberation',
    title: 'Specialist Desk',
    caption: 'ASTROLABE mapping structure, order blocks, FVG and invalidation',
  },
  {
    id: 'verify',
    title: 'Verification',
    caption: 'Grounding check and strict completion audit',
  },
];

/** Map a live committee step id onto its circuit stage row. */
function stageIndexFor(step: string | undefined, stages: readonly StageDef[]): number {
  if (!step) return 0;
  if (step === 'critique' || step === 'debate') {
    const idx = stages.findIndex((s) => s.id === 'critique');
    return idx >= 0 ? idx : 2;
  }
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
  agentProgress?: AgentProgress | null;
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
  const isClashStage = stages[activeIndex]?.id === 'critique';

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
            {isSingle ? 'FAST SCOUT · SINGLE-PASS READ' : 'LIVE COUNCIL TELEMETRY'}
          </span>
        </div>
        <span className="text-fg-muted font-mono text-xs tabular-nums">
          {agents.length > 0
            ? `${doneCount}/${agents.length} DESKS READY`
            : `STAGE 0${activeIndex + 1}`}
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
                  {stage.id === 'critique' && isActive ? (
                    <IconSwords className="text-brand size-3.5 animate-pulse" />
                  ) : null}
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

      {isClashStage ? (
        <div className="border-brand/30 bg-brand/[0.05] text-brand flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-[10px] font-semibold tracking-wide uppercase">
          <IconSwords className="size-3.5" /> Cross-Critique Active: desks auditing peer
          assumptions…
        </div>
      ) : null}

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
