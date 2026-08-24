'use client';

/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// SPDX-License-Identifier: Apache-2.0

import { AnimatePresence, m } from 'motion/react';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/cn';

import {
  ChartWizardSprite,
  KestrelFalconSprite,
  MacroMageSprite,
  RetroCrtMonitor,
  RiskKnightSprite,
} from './pixel-sprites';

const QUANT_STATUS_STEPS = [
  'Reading 15m/1h/4h Candlestick Vectors…',
  'Scanning Asian Session Liquidity & Order Blocks…',
  'Evaluating Technical Moving Averages & RSI…',
  'Calculating VaR Volatility & Support Cones…',
  'Synthesizing Committee Multi-Desk Consensus…',
];

export interface PixelAgentOpinion {
  agentName: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reasoning: string;
}

interface PixelDeskDeliberationProps {
  opinions: PixelAgentOpinion[];
  mode?: string;
  className?: string;
}

/**
 * 🎮 PixelDeskThinking
 * Active during in-flight generation / background analysis.
 * Renders the 4 pixel quants actively working at their CRT stations.
 */
export function PixelDeskThinking({ className }: { className?: string }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [dots, setDots] = useState(0);

  useEffect(() => {
    const stepTimer = setInterval(() => {
      setStepIdx((prev) => (prev + 1) % QUANT_STATUS_STEPS.length);
    }, 2200);
    const dotTimer = setInterval(() => {
      setDots((prev) => (prev + 1) % 4);
    }, 450);
    return () => {
      clearInterval(stepTimer);
      clearInterval(dotTimer);
    };
  }, []);

  const progressPercent = Math.min(25 + stepIdx * 18, 92);

  return (
    <div
      role="status"
      aria-label="Quantitative agents deliberating"
      className={cn(
        'border-border/80 bg-bg-elev-1 relative my-2 flex w-full max-w-xl flex-col gap-3 overflow-hidden rounded-sm border p-3.5 shadow-sm',
        className,
      )}
    >
      {/* Subtle CRT Scanline Background Overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, #000, #000 1px, transparent 1px, transparent 2px)',
          backgroundSize: '100% 2px',
        }}
      />

      {/* Header Bar */}
      <div className="border-border/60 flex items-center justify-between border-b pb-2">
        <div className="flex items-center gap-1.5">
          <span className="bg-brand inline-block size-2 rounded-xs animate-pulse shadow-[0_0_6px_rgba(245,110,15,0.4)]" />
          <span className="text-fg-subtle font-mono text-[11px] font-bold tracking-wider uppercase">
            KESTREL QUANT DESK
          </span>
        </div>
        <span className="border-brand/40 bg-brand/10 text-brand rounded-xs border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide uppercase">
          LIVE SYNC
        </span>
      </div>

      {/* The 8-Bit Trading Floor / Character Row */}
      <div className="flex items-end justify-around gap-2 px-1 py-2">
        {/* Desk 1: Chart Wizard */}
        <div className="flex flex-col items-center gap-1">
          <ChartWizardSprite isThinking={true} />
          <div className="flex items-center gap-0.5">
            <RetroCrtMonitor isThinking={true} />
          </div>
          <span className="text-fg-subtle font-mono text-[10px] font-semibold">Technical</span>
        </div>

        {/* Desk 2: Macro Mage */}
        <div className="flex flex-col items-center gap-1">
          <MacroMageSprite isThinking={true} />
          <div className="flex items-center gap-0.5">
            <RetroCrtMonitor isThinking={true} />
          </div>
          <span className="text-fg-subtle font-mono text-[10px] font-semibold">Macro</span>
        </div>

        {/* Desk 3: Risk Knight */}
        <div className="flex flex-col items-center gap-1">
          <RiskKnightSprite isThinking={true} />
          <div className="flex items-center gap-0.5">
            <RetroCrtMonitor isThinking={true} />
          </div>
          <span className="text-fg-subtle font-mono text-[10px] font-semibold">Risk</span>
        </div>

        {/* Desk 4: Sentinel Falcon */}
        <div className="flex flex-col items-center gap-1">
          <KestrelFalconSprite isThinking={true} />
          <div className="flex items-center gap-0.5">
            <RetroCrtMonitor isThinking={true} />
          </div>
          <span className="text-fg-subtle font-mono text-[10px] font-semibold">Sentinel</span>
        </div>
      </div>

      {/* Telemetry Stage Ticker & Stepped Progress Bar */}
      <div className="bg-bg-elev-2 border-border/60 flex flex-col gap-2 rounded-xs border p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-fg-muted truncate font-mono text-xs">
            <span className="text-brand mr-1">▶</span>
            <span>{QUANT_STATUS_STEPS[stepIdx]}</span>
          </div>
          <span className="text-fg-subtle font-mono text-[11px] tabular-nums shrink-0 font-bold">
            {progressPercent}%
          </span>
        </div>

        {/* Stepped 8-Bit Progress Bar */}
        <div className="bg-bg-elev-3 h-2 w-full overflow-hidden rounded-xs border border-border/40 p-[1px]">
          <m.div
            className="from-brand via-amber-500 to-bull h-full rounded-xs bg-gradient-to-r"
            initial={{ width: '15%' }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * 🏆 PixelDeskDeliberation
 * Renders the settled committee view with pixel characters in their final victory poses,
 * bias tags, consensus meter, and expandable specialist rationales.
 */
export function PixelDeskDeliberation({
  opinions,
  mode = 'full',
  className,
}: PixelDeskDeliberationProps) {
  const [expanded, setExpanded] = useState(false);

  const techOp = opinions.find((o) => o.agentName === 'technical');
  const macroOp = opinions.find((o) => o.agentName === 'fundamental');
  const riskOp = opinions.find((o) => o.agentName === 'risk');
  const sentOp = opinions.find((o) => o.agentName === 'sentiment');

  const avgConfidence =
    opinions.length > 0
      ? Math.round(
          (opinions.reduce((sum, o) => sum + (o.confidence ?? 0.8), 0) / opinions.length) * 100,
        )
      : 85;

  const biasCounts = {
    bullish: opinions.filter((o) => o.bias === 'bullish').length,
    bearish: opinions.filter((o) => o.bias === 'bearish').length,
    neutral: opinions.filter((o) => o.bias === 'neutral').length,
  };

  const majorityBias =
    biasCounts.bullish >= biasCounts.bearish && biasCounts.bullish >= biasCounts.neutral
      ? 'bullish'
      : biasCounts.bearish >= biasCounts.bullish && biasCounts.bearish >= biasCounts.neutral
        ? 'bearish'
        : 'neutral';

  const toneClass =
    majorityBias === 'bullish'
      ? 'text-bull border-bull/30 bg-bull/5'
      : majorityBias === 'bearish'
        ? 'text-bear border-bear/30 bg-bear/5'
        : 'text-fg-muted border-border bg-bg-elev-2';

  return (
    <div
      role="region"
      aria-label="Multi-agent committee verdict"
      className={cn(
        'border-border/80 bg-bg-elev-1 mt-3 flex w-full flex-col gap-3 rounded-sm border p-4 shadow-sm',
        className,
      )}
    >
      {/* Header */}
      <div className="border-border/60 flex items-center justify-between border-b pb-2.5">
        <div className="flex items-center gap-2">
          <span className="bg-bull inline-block size-2 rounded-xs shadow-[0_0_6px_rgba(34,197,94,0.4)]" />
          <h4 className="text-fg font-mono text-xs font-bold tracking-wider uppercase">
            COMMITTEE DELIBERATION · {mode.toUpperCase()} MODE
          </h4>
        </div>
        <div className={cn('rounded-xs border px-2 py-0.5 font-mono text-[11px] font-bold uppercase', toneClass)}>
          {majorityBias === 'bullish' ? '▲ BULLISH CONSENSUS' : majorityBias === 'bearish' ? '▼ BEARISH CONSENSUS' : '■ NEUTRAL CONSENSUS'}
        </div>
      </div>

      {/* The 4 Pixel Agents in Settled Poses */}
      <div className="flex items-end justify-around gap-2 px-1 py-1">
        {/* Technical */}
        <div className="flex flex-col items-center gap-1">
          <ChartWizardSprite isDone={true} bias={techOp?.bias ?? 'bullish'} />
          <span className="text-fg-subtle font-mono text-[10px] font-semibold">Technical</span>
        </div>

        {/* Macro */}
        <div className="flex flex-col items-center gap-1">
          <MacroMageSprite isDone={true} bias={macroOp?.bias ?? 'bullish'} />
          <span className="text-fg-subtle font-mono text-[10px] font-semibold">Macro</span>
        </div>

        {/* Risk */}
        <div className="flex flex-col items-center gap-1">
          <RiskKnightSprite isDone={true} bias={riskOp?.bias ?? 'bullish'} />
          <span className="text-fg-subtle font-mono text-[10px] font-semibold">Risk Guard</span>
        </div>

        {/* Sentinel */}
        <div className="flex flex-col items-center gap-1">
          <KestrelFalconSprite isDone={true} bias={sentOp?.bias ?? 'bullish'} />
          <span className="text-fg-subtle font-mono text-[10px] font-semibold">Sentinel</span>
        </div>
      </div>

      {/* Consensus Confidence Bar */}
      <div className="bg-bg-elev-2 border-border/60 flex flex-col gap-1.5 rounded-xs border p-3">
        <div className="flex items-center justify-between">
          <span className="text-fg font-mono text-xs font-semibold">Committee Confidence</span>
          <span className="text-fg font-mono text-xs font-bold tabular-nums">{avgConfidence}%</span>
        </div>
        <div className="bg-bg-elev-3 h-2 w-full overflow-hidden rounded-xs border border-border/40 p-[1px]">
          <m.div
            className={cn(
              'h-full rounded-xs',
              avgConfidence >= 75 ? 'bg-bull' : avgConfidence >= 50 ? 'bg-warn' : 'bg-bear',
            )}
            initial={{ width: 0 }}
            animate={{ width: `${avgConfidence}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Expandable Agent Rationales */}
      {opinions.length > 0 && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-fg-muted hover:text-fg flex w-full items-center justify-between font-mono text-[11px] font-semibold transition-colors"
          >
            <span>{expanded ? '▲ Hide Agent Breakdown' : '▼ View Agent Breakdown & Reasoning'}</span>
            <span className="text-caption text-fg-subtle">
              {opinions.length} Specialist Reports
            </span>
          </button>

          <AnimatePresence>
            {expanded && (
              <m.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="mt-2 flex flex-col gap-2 overflow-hidden pt-1"
              >
                {opinions.map((op) => (
                  <div
                    key={op.agentName}
                    className="border-border bg-bg-elev-2 flex flex-col gap-1 rounded-xs border p-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-fg font-mono font-bold capitalize">
                        {op.agentName} Specialist
                      </span>
                      <span
                        className={cn(
                          'font-mono font-semibold uppercase',
                          op.bias === 'bullish'
                            ? 'text-bull'
                            : op.bias === 'bearish'
                              ? 'text-bear'
                              : 'text-fg-muted',
                        )}
                      >
                        {op.bias} · {Math.round((op.confidence ?? 0.8) * 100)}%
                      </span>
                    </div>
                    <p className="text-fg-muted leading-relaxed">{op.reasoning}</p>
                  </div>
                ))}
              </m.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
