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
  MacroWorkstation,
  RiskKnightSprite,
  RiskWorkstation,
  SentinelWorkstation,
  TechnicalWorkstation,
  TradingFloorDesk,
} from './pixel-sprites';

const QUANT_STATUS_STEPS = [
  'Reading 15m/1h/4h Candlestick Vectors…',
  'Scanning Asian Session Liquidity & Order Blocks…',
  'Evaluating Technical Moving Averages & RSI…',
  'Calculating VaR Volatility & Support Cones…',
  'Synthesizing Committee Multi-Desk Consensus…',
];

const THINKING_BUBBLES: Record<
  number,
  { agent: string; tag: string; text: string; theme: 'technical' | 'fundamental' | 'risk' | 'sentiment' }
> = {
  0: { agent: 'technical', tag: '15m/1h', text: 'Scanning price vectors…', theme: 'technical' },
  1: { agent: 'technical', tag: 'SMC', text: 'Liquidity levels mapped', theme: 'technical' },
  2: { agent: 'fundamental', tag: 'MACRO', text: 'Checking news & yields…', theme: 'fundamental' },
  3: { agent: 'risk', tag: 'VaR', text: 'Simulating stop cones…', theme: 'risk' },
  4: { agent: 'sentiment', tag: 'FUSION', text: 'Locking in consensus!', theme: 'sentiment' },
};

export interface CharacterProfile {
  id: string;
  name: string;
  role: string;
  badgeClass: string;
  glowColor: string;
  title: string;
  specialty: string;
  indicators: string;
  motto: string;
}

export const CHARACTER_PROFILES: Record<string, CharacterProfile> = {
  technical: {
    id: 'technical',
    name: 'Chart Wizard',
    role: 'Technical Analyst',
    badgeClass: 'text-bull border-bull/40 bg-bull/10',
    glowColor: 'rgba(34, 197, 94, 0.25)',
    title: 'Master of SMC & Candlestick Vectors',
    specialty: '15m/1h Structure, FVGs, Order Blocks & Liquidity Sweeps',
    indicators: 'EMA (20/50/200), RSI-14, MACD (12/26/9), ATR Cones',
    motto: '“Trend is your friend until market structure breaks.”',
  },
  fundamental: {
    id: 'fundamental',
    name: 'Macro Mage',
    role: 'Macro Specialist',
    badgeClass: 'text-sky-400 border-sky-400/40 bg-sky-400/10',
    glowColor: 'rgba(56, 189, 248, 0.25)',
    title: 'Scholar of Global Economic Catalysts',
    specialty: 'Central Bank Policy, Real Yields, DXY, Inflation & NFP',
    indicators: 'FRED 10Y Yields, Economic Calendar, COT Index',
    motto: '“Macro sets the weather; technicals set the sail.”',
  },
  risk: {
    id: 'risk',
    name: 'Risk Knight',
    role: 'Capital Guardian',
    badgeClass: 'text-bear border-bear/40 bg-bear/10',
    glowColor: 'rgba(244, 63, 94, 0.25)',
    title: 'Defender of the Trading Balance',
    specialty: '1% Max Risk Sizing, VaR Stop Loss Cones & Invalidation',
    indicators: 'ATR-14 Forward Volatility, 1:2 Min R:R, Max Drawdown Guard',
    motto: '“Rule 1: Protect your capital. Rule 2: Never forget Rule 1.”',
  },
  sentiment: {
    id: 'sentiment',
    name: 'Sentinel Falcon',
    role: 'Market Scout',
    badgeClass: 'text-amber-400 border-amber-400/40 bg-amber-400/10',
    glowColor: 'rgba(245, 158, 11, 0.25)',
    title: 'High-Altitude Whale Tracker',
    specialty: 'CFTC Institutional Positioning & Retail Sentiment Regimes',
    indicators: 'Commercial vs Non-Commercial COT, Social Sentiment',
    motto: '“Hunt alongside institutional whales, never with the herd.”',
  },
};

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
 * 💬 Unified Status / Speech Bubble
 * Clean, single-bubble system with optional tag and status styling.
 */
function UnifiedDeskBubble({
  tag,
  text,
  theme = 'technical',
  side = 'top',
}: {
  tag?: string;
  text: string;
  theme?: 'technical' | 'fundamental' | 'risk' | 'sentiment' | 'bullish' | 'bearish' | 'neutral';
  side?: 'top' | 'bottom';
}) {
  const themeClasses =
    theme === 'bullish' || theme === 'technical'
      ? 'border-bull/60 text-bull shadow-[0_2px_8px_rgba(34,197,94,0.15)]'
      : theme === 'bearish' || theme === 'risk'
        ? 'border-bear/60 text-bear shadow-[0_2px_8px_rgba(244,63,94,0.15)]'
        : theme === 'fundamental'
          ? 'border-sky-400/60 text-sky-400 shadow-[0_2px_8px_rgba(56,189,248,0.15)]'
          : theme === 'sentiment'
            ? 'border-amber-400/60 text-amber-400 shadow-[0_2px_8px_rgba(245,158,11,0.15)]'
            : 'border-border text-fg-muted';

  return (
    <m.div
      initial={{ opacity: 0, y: side === 'top' ? 4 : -4, scale: 0.88 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: side === 'top' ? 2 : -2, scale: 0.92 }}
      transition={{ type: 'spring', damping: 18, stiffness: 320 }}
      className={cn(
        'pointer-events-none absolute z-20 flex w-max max-w-[145px] flex-col items-center select-none',
        side === 'top' ? '-top-7 left-1/2 -translate-x-1/2' : '-bottom-7 left-1/2 -translate-x-1/2',
      )}
    >
      <div
        className={cn(
          'bg-bg-elev-3/95 flex items-center gap-1 rounded-xs border px-1.5 py-0.5 font-mono text-[9px] font-bold leading-none backdrop-blur-xs',
          themeClasses,
        )}
      >
        {tag && (
          <span className="opacity-75 font-semibold text-[8px] uppercase tracking-wide">
            [{tag}]
          </span>
        )}
        <span className="truncate">{text}</span>
      </div>
      <div
        className={cn(
          'size-0 border-x-[3px] border-x-transparent',
          side === 'top'
            ? 'border-t-[3px] border-t-border -mt-[1px]'
            : 'border-b-[3px] border-b-border -mb-[1px] order-first',
        )}
      />
    </m.div>
  );
}

/**
 * 🃏 CharacterProfileCard
 * Sleek 8-bit trading profile card popover with retro glow and stats.
 */
function CharacterProfileCard({
  profile,
  onClose,
}: {
  profile: CharacterProfile;
  onClose: () => void;
}) {
  return (
    <m.div
      initial={{ opacity: 0, y: 6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.96 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      style={{
        boxShadow: `0 8px 24px -4px ${profile.glowColor}`,
      }}
      className="border-brand/40 bg-bg-elev-3/95 relative z-30 flex w-full flex-col gap-2 rounded-xs border p-3.5 shadow-xl backdrop-blur-md"
    >
      <div className="flex items-start justify-between border-b border-border/60 pb-2">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-fg font-mono text-xs font-bold tracking-wide">{profile.name}</span>
            <span className={cn('rounded-2xs border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase', profile.badgeClass)}>
              {profile.role}
            </span>
          </div>
          <span className="text-fg-subtle font-mono text-[10.5px]">{profile.title}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-fg-subtle hover:text-fg hover:bg-bg-elev-2 rounded-xs font-mono text-xs p-1 leading-none transition-colors cursor-pointer"
          aria-label="Close character profile"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-col gap-1.5 text-[11px] font-mono">
        <div className="flex items-baseline gap-1.5">
          <span className="text-fg-subtle text-[10px] font-bold uppercase shrink-0">Specialty:</span>
          <span className="text-fg-muted text-[10.5px] leading-snug">{profile.specialty}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-fg-subtle text-[10px] font-bold uppercase shrink-0">Tooling:</span>
          <span className="text-fg-muted text-[10.5px] leading-snug">{profile.indicators}</span>
        </div>
      </div>

      <div className="border-border/40 bg-bg-elev-2 rounded-xs border px-2.5 py-1.5 text-center">
        <p className="text-brand font-mono text-[10.5px] italic leading-snug">{profile.motto}</p>
      </div>
    </m.div>
  );
}

/**
 * 🎮 PixelDeskThinking
 * Active during in-flight generation / background analysis.
 * Renders the 4 pixel quants at their custom workstations with connected trading desk.
 */
export function PixelDeskThinking({ className }: { className?: string }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);

  useEffect(() => {
    const stepTimer = setInterval(() => {
      setStepIdx((prev) => (prev + 1) % QUANT_STATUS_STEPS.length);
    }, 2200);
    return () => {
      clearInterval(stepTimer);
    };
  }, []);

  const progressPercent = Math.min(25 + stepIdx * 18, 92);
  const activeBubble = THINKING_BUBBLES[stepIdx];

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

      {/* The 8-Bit Trading Floor / Character Row with Custom Workstations */}
      <div className="flex flex-col gap-0 pt-6">
        <div className="flex items-end justify-around gap-2 px-1 pb-1">
          {/* Desk 1: Chart Wizard */}
          <m.button
            type="button"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSelectedProfile(selectedProfile === 'technical' ? null : 'technical')}
            className="group relative flex flex-col items-center gap-1 cursor-pointer"
            title="Click to view Chart Wizard profile"
          >
            <AnimatePresence>
              {activeBubble?.agent === 'technical' && (
                <UnifiedDeskBubble tag={activeBubble.tag} text={activeBubble.text} theme="technical" />
              )}
            </AnimatePresence>
            <ChartWizardSprite isThinking={true} />
            <div className="flex flex-col items-center gap-0.5">
              <TechnicalWorkstation isThinking={true} />
              <span className="size-1 rounded-full bg-bull animate-ping opacity-75" />
            </div>
            <span className="text-fg-subtle group-hover:text-brand font-mono text-[10px] font-semibold transition-colors">
              Technical
            </span>
          </m.button>

          {/* Desk 2: Macro Mage */}
          <m.button
            type="button"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSelectedProfile(selectedProfile === 'fundamental' ? null : 'fundamental')}
            className="group relative flex flex-col items-center gap-1 cursor-pointer"
            title="Click to view Macro Mage profile"
          >
            <AnimatePresence>
              {activeBubble?.agent === 'fundamental' && (
                <UnifiedDeskBubble tag={activeBubble.tag} text={activeBubble.text} theme="fundamental" />
              )}
            </AnimatePresence>
            <MacroMageSprite isThinking={true} />
            <div className="flex flex-col items-center gap-0.5">
              <MacroWorkstation isThinking={true} />
              <span className="size-1 rounded-full bg-sky-400 animate-ping opacity-75" />
            </div>
            <span className="text-fg-subtle group-hover:text-brand font-mono text-[10px] font-semibold transition-colors">
              Macro
            </span>
          </m.button>

          {/* Desk 3: Risk Knight */}
          <m.button
            type="button"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSelectedProfile(selectedProfile === 'risk' ? null : 'risk')}
            className="group relative flex flex-col items-center gap-1 cursor-pointer"
            title="Click to view Risk Knight profile"
          >
            <AnimatePresence>
              {activeBubble?.agent === 'risk' && (
                <UnifiedDeskBubble tag={activeBubble.tag} text={activeBubble.text} theme="risk" />
              )}
            </AnimatePresence>
            <RiskKnightSprite isThinking={true} />
            <div className="flex flex-col items-center gap-0.5">
              <RiskWorkstation isThinking={true} />
              <span className="size-1 rounded-full bg-bear animate-ping opacity-75" />
            </div>
            <span className="text-fg-subtle group-hover:text-brand font-mono text-[10px] font-semibold transition-colors">
              Risk
            </span>
          </m.button>

          {/* Desk 4: Sentinel Falcon */}
          <m.button
            type="button"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSelectedProfile(selectedProfile === 'sentiment' ? null : 'sentiment')}
            className="group relative flex flex-col items-center gap-1 cursor-pointer"
            title="Click to view Sentinel Falcon profile"
          >
            <AnimatePresence>
              {activeBubble?.agent === 'sentiment' && (
                <UnifiedDeskBubble tag={activeBubble.tag} text={activeBubble.text} theme="sentiment" />
              )}
            </AnimatePresence>
            <KestrelFalconSprite isThinking={true} />
            <div className="flex flex-col items-center gap-0.5">
              <SentinelWorkstation isThinking={true} />
              <span className="size-1 rounded-full bg-amber-400 animate-ping opacity-75" />
            </div>
            <span className="text-fg-subtle group-hover:text-brand font-mono text-[10px] font-semibold transition-colors">
              Sentinel
            </span>
          </m.button>
        </div>

        {/* Continuous Trading Desk Counter with Ambient Props */}
        <TradingFloorDesk />
      </div>

      {/* Selected Character Profile Card Popover */}
      <AnimatePresence>
        {selectedProfile && CHARACTER_PROFILES[selectedProfile] && (
          <CharacterProfileCard
            profile={CHARACTER_PROFILES[selectedProfile]!}
            onClose={() => setSelectedProfile(null)}
          />
        )}
      </AnimatePresence>

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
 * Renders the settled committee view with custom workstations and continuous trading desk.
 */
export function PixelDeskDeliberation({
  opinions,
  mode = 'full',
  className,
}: PixelDeskDeliberationProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);

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

  const isDisputed =
    (biasCounts.bullish > 0 && biasCounts.bearish > 0) ||
    (biasCounts.bullish > 0 && biasCounts.neutral >= 2) ||
    (biasCounts.bearish > 0 && biasCounts.neutral >= 2);

  const majorityBias =
    biasCounts.bullish >= biasCounts.bearish && biasCounts.bullish >= biasCounts.neutral
      ? 'bullish'
      : biasCounts.bearish >= biasCounts.bullish && biasCounts.bearish >= biasCounts.neutral
        ? 'bearish'
        : 'neutral';

  const tugPercent = Math.max(
    10,
    Math.min(
      90,
      Math.round(
        ((biasCounts.bullish * 1.0 + biasCounts.neutral * 0.5) /
          Math.max(1, biasCounts.bullish + biasCounts.bearish + biasCounts.neutral)) *
          100,
      ),
    ),
  );

  return (
    <div
      role="region"
      aria-label="Multi-agent committee verdict"
      className={cn(
        'border-border/80 bg-bg-elev-1 mt-3 flex w-full flex-col gap-3 rounded-sm border p-4 shadow-sm',
        className,
      )}
    >
      {/* Header with Animated Retro Stamp */}
      <div className="border-border/60 flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
        <div className="flex items-center gap-2">
          <span className="bg-bull inline-block size-2 rounded-xs shadow-[0_0_6px_rgba(34,197,94,0.4)]" />
          <h4 className="text-fg font-mono text-xs font-bold tracking-wider uppercase">
            COMMITTEE DELIBERATION · {mode.toUpperCase()} MODE
          </h4>
        </div>

        {/* Animated Rubber Stamp */}
        <m.div
          initial={{ scale: 2.2, opacity: 0, rotate: -14 }}
          animate={{ scale: 1, opacity: 1, rotate: isDisputed ? -5 : 0 }}
          transition={{ type: 'spring', damping: 13, stiffness: 240, delay: 0.12 }}
          className={cn(
            'rounded-xs border-2 px-2.5 py-0.5 font-mono text-[11px] font-extrabold tracking-wider uppercase shadow-xs select-none',
            isDisputed
              ? 'border-warn/80 bg-warn/15 text-warn shadow-[0_0_8px_rgba(234,179,8,0.25)]'
              : majorityBias === 'bullish'
                ? 'border-bull/80 bg-bull/15 text-bull shadow-[0_0_8px_rgba(34,197,94,0.25)]'
                : majorityBias === 'bearish'
                  ? 'border-bear/80 bg-bear/15 text-bear shadow-[0_0_8px_rgba(244,63,94,0.25)]'
                  : 'border-border bg-bg-elev-2 text-fg-muted',
          )}
        >
          {isDisputed
            ? '⚠️ DISPUTED SETUP'
            : majorityBias === 'bullish'
              ? '★ UNANIMOUS BUY'
              : majorityBias === 'bearish'
                ? '★ UNANIMOUS SELL'
                : '■ NEUTRAL CONSENSUS'}
        </m.div>
      </div>

      {/* The 4 Pixel Agents in Settled Poses with Custom Workstations & Unified Call Badges */}
      <div className="flex flex-col gap-0 pt-6">
        <div className="flex items-end justify-around gap-2 px-1 pb-1">
          {/* Technical */}
          <m.button
            type="button"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSelectedProfile(selectedProfile === 'technical' ? null : 'technical')}
            className="group relative flex flex-col items-center gap-1 cursor-pointer"
            title="Click to view Chart Wizard profile"
          >
            <UnifiedDeskBubble
              text={techOp?.bias === 'bullish' ? '▲ BUY' : techOp?.bias === 'bearish' ? '▼ SELL' : '■ NEUT'}
              theme={techOp?.bias ?? 'bullish'}
            />
            <ChartWizardSprite
              isDone={true}
              bias={techOp?.bias ?? 'bullish'}
              isSparkling={majorityBias === 'bullish' && avgConfidence >= 80}
            />
            <div className="flex flex-col items-center gap-0.5">
              <TechnicalWorkstation isThinking={false} />
              <span className={cn('size-1 rounded-full', techOp?.bias === 'bullish' ? 'bg-bull' : techOp?.bias === 'bearish' ? 'bg-bear' : 'bg-fg-subtle')} />
            </div>
            <span className="text-fg-subtle group-hover:text-brand font-mono text-[10px] font-semibold transition-colors">
              Technical
            </span>
          </m.button>

          {/* Macro */}
          <m.button
            type="button"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSelectedProfile(selectedProfile === 'fundamental' ? null : 'fundamental')}
            className="group relative flex flex-col items-center gap-1 cursor-pointer"
            title="Click to view Macro Mage profile"
          >
            <UnifiedDeskBubble
              text={macroOp?.bias === 'bullish' ? '▲ GROWTH' : macroOp?.bias === 'bearish' ? '▼ RECESS' : '■ STEADY'}
              theme={macroOp?.bias ?? 'bullish'}
            />
            <MacroMageSprite isDone={true} bias={macroOp?.bias ?? 'bullish'} />
            <div className="flex flex-col items-center gap-0.5">
              <MacroWorkstation isThinking={false} />
              <span className={cn('size-1 rounded-full', macroOp?.bias === 'bullish' ? 'bg-bull' : macroOp?.bias === 'bearish' ? 'bg-bear' : 'bg-fg-subtle')} />
            </div>
            <span className="text-fg-subtle group-hover:text-brand font-mono text-[10px] font-semibold transition-colors">
              Macro
            </span>
          </m.button>

          {/* Risk */}
          <m.button
            type="button"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSelectedProfile(selectedProfile === 'risk' ? null : 'risk')}
            className="group relative flex flex-col items-center gap-1 cursor-pointer"
            title="Click to view Risk Knight profile"
          >
            <UnifiedDeskBubble
              text={riskOp?.bias === 'bullish' ? '🛡️ SAFE' : '⚠️ CAUTION'}
              theme={riskOp?.bias === 'bullish' ? 'bullish' : 'risk'}
            />
            <RiskKnightSprite
              isDone={true}
              bias={riskOp?.bias ?? 'bullish'}
              hasAlarm={isDisputed || riskOp?.bias === 'bearish'}
            />
            <div className="flex flex-col items-center gap-0.5">
              <RiskWorkstation isThinking={false} />
              <span className={cn('size-1 rounded-full', riskOp?.bias === 'bullish' ? 'bg-bull' : riskOp?.bias === 'bearish' ? 'bg-bear' : 'bg-warn')} />
            </div>
            <span className="text-fg-subtle group-hover:text-brand font-mono text-[10px] font-semibold transition-colors">
              Risk Guard
            </span>
          </m.button>

          {/* Sentinel */}
          <m.button
            type="button"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSelectedProfile(selectedProfile === 'sentiment' ? null : 'sentiment')}
            className="group relative flex flex-col items-center gap-1 cursor-pointer"
            title="Click to view Sentinel Falcon profile"
          >
            <UnifiedDeskBubble
              text={!isDisputed ? '★ CONSENSUS' : '⚠️ DISPUTED'}
              theme={!isDisputed ? 'bullish' : 'sentiment'}
            />
            <KestrelFalconSprite
              isDone={true}
              bias={sentOp?.bias ?? 'bullish'}
              hasWingsSpread={!isDisputed && majorityBias === 'bullish'}
            />
            <div className="flex flex-col items-center gap-0.5">
              <SentinelWorkstation isThinking={false} />
              <span className={cn('size-1 rounded-full', sentOp?.bias === 'bullish' ? 'bg-bull' : sentOp?.bias === 'bearish' ? 'bg-bear' : 'bg-fg-subtle')} />
            </div>
            <span className="text-fg-subtle group-hover:text-brand font-mono text-[10px] font-semibold transition-colors">
              Sentinel
            </span>
          </m.button>
        </div>

        {/* Continuous Trading Desk Counter with Ambient Props */}
        <TradingFloorDesk />
      </div>

      {/* Selected Character Profile Card Popover */}
      <AnimatePresence>
        {selectedProfile && CHARACTER_PROFILES[selectedProfile] && (
          <CharacterProfileCard
            profile={CHARACTER_PROFILES[selectedProfile]!}
            onClose={() => setSelectedProfile(null)}
          />
        )}
      </AnimatePresence>

      {/* "Bulls vs. Bears" Tug-of-War Battle Bar */}
      <div className="bg-bg-elev-2 border-border/60 flex flex-col gap-2 rounded-xs border p-3">
        <div className="flex items-center justify-between font-mono text-xs">
          <div className="flex items-center gap-1.5 text-bull font-bold">
            <span>▲ BULLS</span>
            <span className="text-[10px] opacity-80">({biasCounts.bullish})</span>
          </div>
          <span className="text-fg font-mono text-xs font-semibold tabular-nums">
            Score: {avgConfidence}%
          </span>
          <div className="flex items-center gap-1.5 text-bear font-bold">
            <span className="text-[10px] opacity-80">({biasCounts.bearish})</span>
            <span>▼ BEARS</span>
          </div>
        </div>

        {/* Tug Track with Sliding Glowing Tug Flag */}
        <div className="bg-bg-elev-3 relative h-2.5 w-full overflow-hidden rounded-xs border border-border/40">
          {/* Center Midpoint Line */}
          <div className="absolute inset-y-0 left-1/2 z-10 w-0.5 -translate-x-1/2 bg-border/80" />

          {/* Green Bull Fill (Left) */}
          <m.div
            className="from-bull/70 to-emerald-400 absolute inset-y-0 left-0 bg-gradient-to-r"
            initial={{ width: '50%' }}
            animate={{ width: `${tugPercent}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />

          {/* Red Bear Fill (Right) */}
          <m.div
            className="from-rose-500 to-bear/70 absolute inset-y-0 right-0 bg-gradient-to-r"
            initial={{ width: '50%' }}
            animate={{ width: `${100 - tugPercent}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />

          {/* Tug Marker */}
          <m.div
            className="absolute top-0 bottom-0 z-20 flex -translate-x-1/2 items-center justify-center px-0.5"
            initial={{ left: '50%' }}
            animate={{ left: `${tugPercent}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            <div className="h-3.5 w-1 rounded-2xs bg-white shadow-[0_0_8px_rgba(255,255,255,1)]" />
          </m.div>
        </div>
      </div>

      {/* Expandable Agent Rationales */}
      {opinions.length > 0 && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-fg-muted hover:text-fg flex w-full items-center justify-between font-mono text-[11px] font-semibold transition-colors cursor-pointer"
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
