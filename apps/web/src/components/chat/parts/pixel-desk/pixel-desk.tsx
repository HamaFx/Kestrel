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

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';

import { cn } from '@/lib/cn';
import { getSessionInfo } from '@/lib/session';


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
    <motion.div
      initial={{ opacity: 0, y: side === 'top' ? 4 : -4, scale: 0.88 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: side === 'top' ? 2 : -2, scale: 0.92 }}
      transition={{ type: 'spring', damping: 18, stiffness: 320 }}
      className={cn(
        'pointer-events-none absolute z-20 flex w-max max-w-[85px] sm:max-w-[140px] flex-col items-center select-none',
        side === 'top' ? '-top-6 sm:-top-7 left-1/2 -translate-x-1/2' : '-bottom-6 sm:-bottom-7 left-1/2 -translate-x-1/2',
      )}
    >
      <div
        className={cn(
          'bg-bg-elev-3/95 flex items-center gap-1 rounded-xs border px-1 sm:px-1.5 py-0.5 font-mono text-[8px] sm:text-[9px] font-bold leading-none backdrop-blur-xs',
          themeClasses,
        )}
      >
        {tag && (
          <span className="hidden sm:inline opacity-75 font-semibold text-[7.5px] uppercase tracking-wide">
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
    </motion.div>
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
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.96 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      style={{
        boxShadow: `0 8px 24px -4px ${profile.glowColor}`,
      }}
      className="border-brand/40 bg-bg-elev-3/95 relative z-30 flex w-full flex-col gap-2 rounded-xs border p-3 sm:p-3.5 shadow-xl backdrop-blur-md"
    >
      <div className="flex items-start justify-between border-b border-border/60 pb-2">
        <div className="flex flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="text-fg font-mono text-xs font-bold tracking-wide">{profile.name}</span>
            <span className={cn('rounded-2xs border px-1.5 py-0.5 font-mono text-[8.5px] sm:text-[9px] font-semibold uppercase', profile.badgeClass)}>
              {profile.role}
            </span>
          </div>
          <span className="text-fg-subtle font-mono text-[10px] sm:text-[10.5px]">{profile.title}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-fg-subtle hover:text-fg hover:bg-bg-elev-2 min-h-[28px] min-w-[28px] flex items-center justify-center rounded-xs font-mono text-xs p-1 leading-none transition-colors cursor-pointer touch-manipulation"
          aria-label="Close character profile"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-col gap-1.5 text-[10px] sm:text-[11px] font-mono">
        <div className="flex items-baseline gap-1.5">
          <span className="text-fg-subtle text-[9px] sm:text-[10px] font-bold uppercase shrink-0">Specialty:</span>
          <span className="text-fg-muted text-[10px] sm:text-[10.5px] leading-snug">{profile.specialty}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-fg-subtle text-[9px] sm:text-[10px] font-bold uppercase shrink-0">Tooling:</span>
          <span className="text-fg-muted text-[10px] sm:text-[10.5px] leading-snug">{profile.indicators}</span>
        </div>
      </div>

      <div className="border-border/40 bg-bg-elev-2 rounded-xs border px-2.5 py-1.5 text-center">
        <p className="text-brand font-mono text-[10px] sm:text-[10.5px] italic leading-snug">{profile.motto}</p>
      </div>
    </motion.div>
  );
}

/**
 * 🕹️ PixelDeskStandby
 * Rendered on the Chat Welcome Screen and Dashboard Widget.
 * The 4 animated specialists are actively on standby, merged with session-aware recommended prompts.
 */
export function PixelDeskStandby({
  pinnedSymbol,
  onSelectPrompt,
  disabled,
  now,
  className,
}: {
  pinnedSymbol?: string | null;
  onSelectPrompt?: (prompt: string) => void;
  disabled?: boolean;
  now?: Date;
  className?: string;
}) {
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'technical' | 'fundamental' | 'risk' | 'sentiment'>('all');
  const [customSymbol, setCustomSymbol] = useState<string | null>(null);

  const sessionInfo = useMemo(() => getSessionInfo(now ?? new Date()), [now]);
  const session = sessionInfo.session;
  const activeSymbol = (customSymbol ?? pinnedSymbol ?? 'XAUUSD').toUpperCase();

  // Dynamic session-aware recommended prompts organized by specialist discipline
  const SPECIALIST_PROMPT_CATALOG = useMemo(() => {
    const s = activeSymbol;
    return {
      technical: [
        {
          id: 't1',
          tag: '15m SMC',
          title: `${s} 15m SMC & Order Blocks`,
          desc: 'Scan liquidity sweeps & Fair Value Gaps',
          prompt: `Analyze ${s} 15m/1h SMC liquidity sweeps, order blocks & market structure.`,
        },
        {
          id: 't2',
          tag: '4H→15M',
          title: `Top-Down Multi-Timeframe`,
          desc: '4H macro trend alignment down to 15m entry',
          prompt: `Run top-down multi-timeframe analysis for ${s} from 4H structure to 15m execution.`,
        },
        {
          id: 't3',
          tag: 'FVG/OB',
          title: `Imbalances & Key Zones`,
          desc: 'Map premium/discount zones and mitigation blocks',
          prompt: `Identify key Fair Value Gaps (FVG) and premium/discount order blocks for ${s}.`,
        },
      ],
      fundamental: [
        {
          id: 'f1',
          tag: 'CATALYST',
          title: `${sessionInfo.label} Economic News`,
          desc: 'High-impact events & central bank expectations',
          prompt: `What are the upcoming economic calendar catalysts and central bank drivers for ${s}?`,
        },
        {
          id: 'f2',
          tag: 'YIELDS',
          title: 'US Real Yields & DXY',
          desc: '10Y real rates, inflation breakevens & dollar index',
          prompt: `Analyze US 10-year Treasury yields, real rates, and DXY index correlation with ${s}.`,
        },
        {
          id: 'f3',
          tag: 'MACRO',
          title: 'Central Bank Policy Bias',
          desc: 'Fed / ECB / BOE rate trajectory & policy stance',
          prompt: `Provide the central bank policy stance and rate cut/hike trajectory affecting ${s}.`,
        },
      ],
      risk: [
        {
          id: 'r1',
          tag: '1% RISK',
          title: 'Optimal 1% Position Sizing',
          desc: 'Strict account risk & lot size calculator',
          prompt: `Calculate optimal 1% risk position sizing and ATR invalidation stop loss for ${s}.`,
        },
        {
          id: 'r2',
          tag: '1:3 R:R',
          title: 'Multi-Target Take Profit Cones',
          desc: 'Partial TP scaling (1:1.5, 1:2.5, 1:4 R:R)',
          prompt: `Design a 1:3 R:R trade execution plan with partial take-profit cones for ${s}.`,
        },
        {
          id: 'r3',
          tag: 'ALERT',
          title: 'Invalidation & Level Alert',
          desc: 'Key support/resistance breach guard',
          prompt: `Set an invalidation risk alert for ${s} at the nearest major session high/low.`,
        },
      ],
      sentiment: [
        {
          id: 's1',
          tag: 'COT',
          title: 'CFTC Institutional Positioning',
          desc: 'Commercial hedge vs non-commercial speculators',
          prompt: `Check CFTC Commitments of Traders (COT) institutional whale positioning for ${s}.`,
        },
        {
          id: 's2',
          tag: 'REGIME',
          title: 'Retail vs Smart Money Flow',
          desc: 'Sentiment extremes & contrarian reversal odds',
          prompt: `Analyze retail sentiment extremes and smart money order flow divergence on ${s}.`,
        },
        {
          id: 's3',
          tag: 'CONSENSUS',
          title: 'Multi-Desk Committee Verdict',
          desc: 'Full 4-agent weighted consensus score',
          prompt: `Convene full quantitative committee deliberation on ${s} across Technicals, Macro, Risk, and Sentiment.`,
        },
      ],
    };
  }, [activeSymbol, sessionInfo.label]);

  const QUICK_SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'BTCUSD', 'USDJPY'];

  return (
    <div
      role="region"
      aria-label="Quantitative floor on standby"
      className={cn(
        'border-border/80 bg-bg-elev-1 relative my-1 sm:my-2 flex w-full max-w-xl flex-col gap-2.5 sm:gap-3 overflow-hidden rounded-sm border p-2.5 sm:p-3.5 shadow-sm',
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

      {/* Header Bar with Live Session Sync */}
      <div className="border-border/60 flex items-center justify-between border-b pb-2">
        <div className="flex items-center gap-1.5">
          <span className="bg-bull inline-block size-2 rounded-xs animate-pulse shadow-[0_0_6px_rgba(34,197,94,0.4)]" />
          <span className="text-fg font-mono text-[10px] sm:text-[11px] font-bold tracking-wider uppercase">
            KESTREL QUANT DESK
          </span>
        </div>
        <span className="border-bull/40 bg-bull/10 text-bull rounded-xs border px-1.5 py-0.5 font-mono text-[8.5px] sm:text-[10px] font-semibold tracking-wide uppercase">
          {sessionInfo.label.toUpperCase()} · STANDBY READY
        </span>
      </div>

      {/* The 8-Bit Trading Floor / Character Row with Custom Workstations */}
      <div className="flex flex-col gap-0 pt-5 sm:pt-6">
        <div className="flex items-end justify-around gap-1 sm:gap-2 px-0.5 sm:px-1 pb-1">
          {/* Desk 1: Chart Wizard */}
          <motion.button
            type="button"
            disabled={disabled}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setSelectedProfile(selectedProfile === 'technical' ? null : 'technical');
              setActiveTab('technical');
            }}
            className="group relative flex flex-col items-center gap-0.5 sm:gap-1 cursor-pointer touch-manipulation disabled:opacity-50"
            title="Click to view Chart Wizard profile"
          >
            <UnifiedDeskBubble tag="SMC" text="15m Ready" theme="technical" />
            <ChartWizardSprite />
            <div className="flex flex-col items-center gap-0.5">
              <TechnicalWorkstation />
              <span className="size-1 rounded-full bg-bull" />
            </div>
            <span className={cn('font-mono text-[9px] sm:text-[10px] font-semibold transition-colors', activeTab === 'technical' ? 'text-bull font-bold' : 'text-fg-subtle group-hover:text-brand')}>
              Technical
            </span>
          </motion.button>

          {/* Desk 2: Macro Mage */}
          <motion.button
            type="button"
            disabled={disabled}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setSelectedProfile(selectedProfile === 'fundamental' ? null : 'fundamental');
              setActiveTab('fundamental');
            }}
            className="group relative flex flex-col items-center gap-0.5 sm:gap-1 cursor-pointer touch-manipulation disabled:opacity-50"
            title="Click to view Macro Mage profile"
          >
            <UnifiedDeskBubble tag="FRED" text="Macro Data" theme="fundamental" />
            <MacroMageSprite />
            <div className="flex flex-col items-center gap-0.5">
              <MacroWorkstation />
              <span className="size-1 rounded-full bg-sky-400" />
            </div>
            <span className={cn('font-mono text-[9px] sm:text-[10px] font-semibold transition-colors', activeTab === 'fundamental' ? 'text-sky-400 font-bold' : 'text-fg-subtle group-hover:text-brand')}>
              Macro
            </span>
          </motion.button>

          {/* Desk 3: Risk Knight */}
          <motion.button
            type="button"
            disabled={disabled}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setSelectedProfile(selectedProfile === 'risk' ? null : 'risk');
              setActiveTab('risk');
            }}
            className="group relative flex flex-col items-center gap-0.5 sm:gap-1 cursor-pointer touch-manipulation disabled:opacity-50"
            title="Click to view Risk Knight profile"
          >
            <UnifiedDeskBubble tag="VaR" text="1% Guard" theme="risk" />
            <RiskKnightSprite />
            <div className="flex flex-col items-center gap-0.5">
              <RiskWorkstation />
              <span className="size-1 rounded-full bg-bear" />
            </div>
            <span className={cn('font-mono text-[9px] sm:text-[10px] font-semibold transition-colors', activeTab === 'risk' ? 'text-bear font-bold' : 'text-fg-subtle group-hover:text-brand')}>
              Risk Guard
            </span>
          </motion.button>

          {/* Desk 4: Sentinel Falcon */}
          <motion.button
            type="button"
            disabled={disabled}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setSelectedProfile(selectedProfile === 'sentiment' ? null : 'sentiment');
              setActiveTab('sentiment');
            }}
            className="group relative flex flex-col items-center gap-0.5 sm:gap-1 cursor-pointer touch-manipulation disabled:opacity-50"
            title="Click to view Sentinel Falcon profile"
          >
            <UnifiedDeskBubble tag="COT" text="Whale Scanner" theme="sentiment" />
            <KestrelFalconSprite />
            <div className="flex flex-col items-center gap-0.5">
              <SentinelWorkstation />
              <span className="size-1 rounded-full bg-amber-400" />
            </div>
            <span className={cn('font-mono text-[9px] sm:text-[10px] font-semibold transition-colors', activeTab === 'sentiment' ? 'text-amber-400 font-bold' : 'text-fg-subtle group-hover:text-brand')}>
              Sentinel
            </span>
          </motion.button>
        </div>

        {/* Continuous Trading Desk Counter with Ambient Props */}
        <TradingFloorDesk />
      </div>

      {/* Selected Character Profile Card Popover */}
      <AnimatePresence>
        {selectedProfile && CHARACTER_PROFILES[selectedProfile] && (
          <div className="flex flex-col gap-2">
            <CharacterProfileCard
              profile={CHARACTER_PROFILES[selectedProfile]!}
              onClose={() => setSelectedProfile(null)}
            />
            {onSelectPrompt && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelectPrompt(SPECIALIST_PROMPT_CATALOG[selectedProfile as keyof typeof SPECIALIST_PROMPT_CATALOG]?.[0]?.prompt ?? '')}
                className="bg-brand/10 hover:bg-brand/20 text-brand border-brand/40 flex w-full items-center justify-center gap-1.5 rounded-xs border py-2 font-mono text-xs font-bold tracking-wide uppercase transition-colors cursor-pointer touch-manipulation disabled:opacity-50"
              >
                <span>▶ Deploy {CHARACTER_PROFILES[selectedProfile]?.name} on {activeSymbol}</span>
              </button>
            )}
          </div>
        )}
      </AnimatePresence>

      {/* Merged Interactive Prompt Command Hub */}
      {onSelectPrompt && !selectedProfile && (
        <div className="flex flex-col gap-2 pt-1">
          {/* Top Bar: Category Tabs & Asset Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-border/40 pb-1.5">
            {/* Category Filter Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={cn(
                  'rounded-xs px-2 py-0.5 font-mono text-[10px] font-semibold transition-colors cursor-pointer touch-manipulation shrink-0',
                  activeTab === 'all'
                    ? 'bg-brand/15 text-brand border border-brand/40'
                    : 'text-fg-subtle hover:text-fg bg-bg-elev-2 border border-transparent',
                )}
              >
                ⚡ Top Picks
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('technical')}
                className={cn(
                  'rounded-xs px-2 py-0.5 font-mono text-[10px] font-semibold transition-colors cursor-pointer touch-manipulation shrink-0',
                  activeTab === 'technical'
                    ? 'bg-bull/15 text-bull border border-bull/40'
                    : 'text-fg-subtle hover:text-fg bg-bg-elev-2 border border-transparent',
                )}
              >
                🧙‍♂️ Tech
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('fundamental')}
                className={cn(
                  'rounded-xs px-2 py-0.5 font-mono text-[10px] font-semibold transition-colors cursor-pointer touch-manipulation shrink-0',
                  activeTab === 'fundamental'
                    ? 'bg-sky-400/15 text-sky-400 border border-sky-400/40'
                    : 'text-fg-subtle hover:text-fg bg-bg-elev-2 border border-transparent',
                )}
              >
                📰 Macro
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('risk')}
                className={cn(
                  'rounded-xs px-2 py-0.5 font-mono text-[10px] font-semibold transition-colors cursor-pointer touch-manipulation shrink-0',
                  activeTab === 'risk'
                    ? 'bg-bear/15 text-bear border border-bear/40'
                    : 'text-fg-subtle hover:text-fg bg-bg-elev-2 border border-transparent',
                )}
              >
                🛡️ Risk
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('sentiment')}
                className={cn(
                  'rounded-xs px-2 py-0.5 font-mono text-[10px] font-semibold transition-colors cursor-pointer touch-manipulation shrink-0',
                  activeTab === 'sentiment'
                    ? 'bg-amber-400/15 text-amber-400 border border-amber-400/40'
                    : 'text-fg-subtle hover:text-fg bg-bg-elev-2 border border-transparent',
                )}
              >
                🦅 Sentiment
              </button>
            </div>

            {/* Quick Symbol Switcher */}
            <div className="flex items-center gap-1">
              <span className="text-fg-subtle font-mono text-[9px]">Pair:</span>
              <div className="flex items-center gap-0.5">
                {QUICK_SYMBOLS.map((sym) => (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => setCustomSymbol(sym)}
                    className={cn(
                      'rounded-2xs px-1 py-0.5 font-mono text-[9px] transition-colors cursor-pointer touch-manipulation',
                      activeSymbol === sym
                        ? 'bg-brand text-bg font-bold shadow-xs'
                        : 'text-fg-subtle hover:text-fg bg-bg-elev-2',
                    )}
                  >
                    {sym.replace('USD', '')}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Action List based on Active Tab */}
          {activeTab === 'all' ? (
            <div className="flex flex-col gap-1.5">
              {/* Full Multi-Agent Committee Deliberation Hero Trigger */}
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  onSelectPrompt(
                    `Convene full quantitative committee deliberation on ${activeSymbol} across Technicals, Macro, Risk, and Sentiment.`,
                  )
                }
                className="bg-gradient-to-r from-brand/15 via-amber-500/10 to-bull/15 hover:from-brand/25 hover:to-bull/25 border-brand/50 hover:border-brand flex items-center justify-between gap-2 rounded-xs border p-2.5 text-left transition-all cursor-pointer group touch-manipulation shadow-xs disabled:opacity-50"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="bg-brand text-bg flex size-5 shrink-0 items-center justify-center rounded-xs font-mono text-[10px] font-extrabold">
                    ⚡
                  </span>
                  <div className="flex flex-col truncate">
                    <span className="text-fg group-hover:text-brand font-mono text-xs font-bold truncate">
                      Convene Full Quant Committee on {activeSymbol}
                    </span>
                    <span className="text-fg-subtle font-mono text-[9.5px] truncate">
                      Run all 4 specialist models (Technical, Macro, Risk, Sentiment) in consensus
                    </span>
                  </div>
                </div>
                <span className="text-brand font-mono text-xs font-bold shrink-0">▶ RUN</span>
              </button>

              {/* 4 Flagship Specialist Briefs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {/* Technical */}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelectPrompt(SPECIALIST_PROMPT_CATALOG.technical[0]!.prompt)}
                  className="bg-bg-elev-2 hover:bg-bg-elev-3 border-border hover:border-bull/50 flex items-center justify-between gap-2 rounded-xs border p-2 text-left transition-all cursor-pointer group touch-manipulation disabled:opacity-50"
                >
                  <div className="flex flex-col gap-0.5 truncate">
                    <span className="text-bull font-mono text-xs font-bold">
                      🧙‍♂️ {SPECIALIST_PROMPT_CATALOG.technical[0]!.title}
                    </span>
                    <span className="text-fg-subtle group-hover:text-fg font-mono text-[9.5px] sm:text-[10px] truncate">
                      {SPECIALIST_PROMPT_CATALOG.technical[0]!.desc}
                    </span>
                  </div>
                  <span className="text-fg-subtle group-hover:text-bull font-mono text-xs shrink-0">→</span>
                </button>

                {/* Macro */}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelectPrompt(SPECIALIST_PROMPT_CATALOG.fundamental[0]!.prompt)}
                  className="bg-bg-elev-2 hover:bg-bg-elev-3 border-border hover:border-sky-400/50 flex items-center justify-between gap-2 rounded-xs border p-2 text-left transition-all cursor-pointer group touch-manipulation disabled:opacity-50"
                >
                  <div className="flex flex-col gap-0.5 truncate">
                    <span className="text-sky-400 font-mono text-xs font-bold">
                      📰 {SPECIALIST_PROMPT_CATALOG.fundamental[0]!.title}
                    </span>
                    <span className="text-fg-subtle group-hover:text-fg font-mono text-[9.5px] sm:text-[10px] truncate">
                      {SPECIALIST_PROMPT_CATALOG.fundamental[0]!.desc}
                    </span>
                  </div>
                  <span className="text-fg-subtle group-hover:text-sky-400 font-mono text-xs shrink-0">→</span>
                </button>

                {/* Risk */}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelectPrompt(SPECIALIST_PROMPT_CATALOG.risk[0]!.prompt)}
                  className="bg-bg-elev-2 hover:bg-bg-elev-3 border-border hover:border-bear/50 flex items-center justify-between gap-2 rounded-xs border p-2 text-left transition-all cursor-pointer group touch-manipulation disabled:opacity-50"
                >
                  <div className="flex flex-col gap-0.5 truncate">
                    <span className="text-bear font-mono text-xs font-bold">
                      🛡️ {SPECIALIST_PROMPT_CATALOG.risk[0]!.title}
                    </span>
                    <span className="text-fg-subtle group-hover:text-fg font-mono text-[9.5px] sm:text-[10px] truncate">
                      {SPECIALIST_PROMPT_CATALOG.risk[0]!.desc}
                    </span>
                  </div>
                  <span className="text-fg-subtle group-hover:text-bear font-mono text-xs shrink-0">→</span>
                </button>

                {/* Sentiment */}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelectPrompt(SPECIALIST_PROMPT_CATALOG.sentiment[0]!.prompt)}
                  className="bg-bg-elev-2 hover:bg-bg-elev-3 border-border hover:border-amber-400/50 flex items-center justify-between gap-2 rounded-xs border p-2 text-left transition-all cursor-pointer group touch-manipulation disabled:opacity-50"
                >
                  <div className="flex flex-col gap-0.5 truncate">
                    <span className="text-amber-400 font-mono text-xs font-bold">
                      🦅 {SPECIALIST_PROMPT_CATALOG.sentiment[0]!.title}
                    </span>
                    <span className="text-fg-subtle group-hover:text-fg font-mono text-[9.5px] sm:text-[10px] truncate">
                      {SPECIALIST_PROMPT_CATALOG.sentiment[0]!.desc}
                    </span>
                  </div>
                  <span className="text-fg-subtle group-hover:text-amber-400 font-mono text-xs shrink-0">→</span>
                </button>
              </div>
            </div>
          ) : (
            /* Dedicated Specialist Toolkit View */
            <div className="flex flex-col gap-1.5">
              {SPECIALIST_PROMPT_CATALOG[activeTab].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelectPrompt(item.prompt)}
                  className={cn(
                    'bg-bg-elev-2 hover:bg-bg-elev-3 border-border flex items-center justify-between gap-2 rounded-xs border p-2 text-left transition-all cursor-pointer group touch-manipulation disabled:opacity-50',
                    activeTab === 'technical'
                      ? 'hover:border-bull/50'
                      : activeTab === 'fundamental'
                        ? 'hover:border-sky-400/50'
                        : activeTab === 'risk'
                          ? 'hover:border-bear/50'
                          : 'hover:border-amber-400/50',
                  )}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span
                      className={cn(
                        'rounded-2xs border px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase shrink-0',
                        activeTab === 'technical'
                          ? 'text-bull border-bull/30 bg-bull/10'
                          : activeTab === 'fundamental'
                            ? 'text-sky-400 border-sky-400/30 bg-sky-400/10'
                            : activeTab === 'risk'
                              ? 'text-bear border-bear/30 bg-bear/10'
                              : 'text-amber-400 border-amber-400/30 bg-amber-400/10',
                      )}
                    >
                      {item.tag}
                    </span>
                    <div className="flex flex-col truncate">
                      <span className="text-fg group-hover:text-brand font-mono text-xs font-semibold truncate">
                        {item.title}
                      </span>
                      <span className="text-fg-subtle font-mono text-[9.5px] truncate">
                        {item.desc}
                      </span>
                    </div>
                  </div>
                  <span className="text-fg-subtle group-hover:text-fg font-mono text-xs shrink-0">→</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
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
        'border-border/80 bg-bg-elev-1 relative my-1 sm:my-2 flex w-full max-w-xl flex-col gap-2.5 sm:gap-3 overflow-hidden rounded-sm border p-2.5 sm:p-3.5 shadow-sm',
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
          <span className="text-fg-subtle font-mono text-[10px] sm:text-[11px] font-bold tracking-wider uppercase">
            KESTREL QUANT DESK
          </span>
        </div>
        <span className="border-brand/40 bg-brand/10 text-brand rounded-xs border px-1.5 py-0.5 font-mono text-[9px] sm:text-[10px] font-semibold tracking-wide uppercase">
          LIVE SYNC
        </span>
      </div>

      {/* The 8-Bit Trading Floor / Character Row with Custom Workstations */}
      <div className="flex flex-col gap-0 pt-5 sm:pt-6">
        <div className="flex items-end justify-around gap-1 sm:gap-2 px-0.5 sm:px-1 pb-1">
          {/* Desk 1: Chart Wizard */}
          <motion.button
            type="button"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSelectedProfile(selectedProfile === 'technical' ? null : 'technical')}
            className="group relative flex flex-col items-center gap-0.5 sm:gap-1 cursor-pointer touch-manipulation"
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
            <span className="text-fg-subtle group-hover:text-brand font-mono text-[9px] sm:text-[10px] font-semibold transition-colors">
              Technical
            </span>
          </motion.button>

          {/* Desk 2: Macro Mage */}
          <motion.button
            type="button"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSelectedProfile(selectedProfile === 'fundamental' ? null : 'fundamental')}
            className="group relative flex flex-col items-center gap-0.5 sm:gap-1 cursor-pointer touch-manipulation"
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
            <span className="text-fg-subtle group-hover:text-brand font-mono text-[9px] sm:text-[10px] font-semibold transition-colors">
              Macro
            </span>
          </motion.button>

          {/* Desk 3: Risk Knight */}
          <motion.button
            type="button"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSelectedProfile(selectedProfile === 'risk' ? null : 'risk')}
            className="group relative flex flex-col items-center gap-0.5 sm:gap-1 cursor-pointer touch-manipulation"
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
            <span className="text-fg-subtle group-hover:text-brand font-mono text-[9px] sm:text-[10px] font-semibold transition-colors">
              Risk
            </span>
          </motion.button>

          {/* Desk 4: Sentinel Falcon */}
          <motion.button
            type="button"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSelectedProfile(selectedProfile === 'sentiment' ? null : 'sentiment')}
            className="group relative flex flex-col items-center gap-0.5 sm:gap-1 cursor-pointer touch-manipulation"
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
            <span className="text-fg-subtle group-hover:text-brand font-mono text-[9px] sm:text-[10px] font-semibold transition-colors">
              Sentinel
            </span>
          </motion.button>
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
      <div className="bg-bg-elev-2 border-border/60 flex flex-col gap-1.5 sm:gap-2 rounded-xs border p-2 sm:p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-fg-muted truncate font-mono text-[11px] sm:text-xs">
            <span className="text-brand mr-1">▶</span>
            <span>{QUANT_STATUS_STEPS[stepIdx]}</span>
          </div>
          <span className="text-fg-subtle font-mono text-[10px] sm:text-[11px] tabular-nums shrink-0 font-bold">
            {progressPercent}%
          </span>
        </div>

        {/* Stepped 8-Bit Progress Bar */}
        <div className="bg-bg-elev-3 h-2 w-full overflow-hidden rounded-xs border border-border/40 p-[1px]">
          <motion.div
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
        'border-border/80 bg-bg-elev-1 mt-2.5 sm:mt-3 flex w-full flex-col gap-2.5 sm:gap-3 rounded-sm border p-3 sm:p-4 shadow-sm',
        className,
      )}
    >
      {/* Header with Animated Retro Stamp */}
      <div className="border-border/60 flex flex-wrap items-center justify-between gap-2 border-b pb-2 sm:pb-2.5">
        <div className="flex items-center gap-2">
          <span className="bg-bull inline-block size-2 rounded-xs shadow-[0_0_6px_rgba(34,197,94,0.4)]" />
          <h4 className="text-fg font-mono text-[11px] sm:text-xs font-bold tracking-wider uppercase">
            COMMITTEE DELIBERATION · {mode.toUpperCase()}
          </h4>
        </div>

        {/* Animated Rubber Stamp */}
        <motion.div
          initial={{ scale: 2.2, opacity: 0, rotate: -14 }}
          animate={{ scale: 1, opacity: 1, rotate: isDisputed ? -5 : 0 }}
          transition={{ type: 'spring', damping: 13, stiffness: 240, delay: 0.12 }}
          className={cn(
            'rounded-xs border-2 px-2 sm:px-2.5 py-0.5 font-mono text-[10px] sm:text-[11px] font-extrabold tracking-wider uppercase shadow-xs select-none',
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
            ? '⚠️ DISPUTED'
            : majorityBias === 'bullish'
              ? '★ UNANIMOUS BUY'
              : majorityBias === 'bearish'
                ? '★ UNANIMOUS SELL'
                : '■ NEUTRAL CONSENSUS'}
        </motion.div>
      </div>

      {/* The 4 Pixel Agents in Settled Poses with Custom Workstations & Unified Call Badges */}
      <div className="flex flex-col gap-0 pt-5 sm:pt-6">
        <div className="flex items-end justify-around gap-1 sm:gap-2 px-0.5 sm:px-1 pb-1">
          {/* Technical */}
          <motion.button
            type="button"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSelectedProfile(selectedProfile === 'technical' ? null : 'technical')}
            className="group relative flex flex-col items-center gap-0.5 sm:gap-1 cursor-pointer touch-manipulation"
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
            <span className="text-fg-subtle group-hover:text-brand font-mono text-[9px] sm:text-[10px] font-semibold transition-colors">
              Technical
            </span>
          </motion.button>

          {/* Macro */}
          <motion.button
            type="button"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSelectedProfile(selectedProfile === 'fundamental' ? null : 'fundamental')}
            className="group relative flex flex-col items-center gap-0.5 sm:gap-1 cursor-pointer touch-manipulation"
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
            <span className="text-fg-subtle group-hover:text-brand font-mono text-[9px] sm:text-[10px] font-semibold transition-colors">
              Macro
            </span>
          </motion.button>

          {/* Risk */}
          <motion.button
            type="button"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSelectedProfile(selectedProfile === 'risk' ? null : 'risk')}
            className="group relative flex flex-col items-center gap-0.5 sm:gap-1 cursor-pointer touch-manipulation"
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
            <span className="text-fg-subtle group-hover:text-brand font-mono text-[9px] sm:text-[10px] font-semibold transition-colors">
              Risk Guard
            </span>
          </motion.button>

          {/* Sentinel */}
          <motion.button
            type="button"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSelectedProfile(selectedProfile === 'sentiment' ? null : 'sentiment')}
            className="group relative flex flex-col items-center gap-0.5 sm:gap-1 cursor-pointer touch-manipulation"
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
            <span className="text-fg-subtle group-hover:text-brand font-mono text-[9px] sm:text-[10px] font-semibold transition-colors">
              Sentinel
            </span>
          </motion.button>
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
      <div className="bg-bg-elev-2 border-border/60 flex flex-col gap-2 rounded-xs border p-2.5 sm:p-3">
        <div className="flex items-center justify-between font-mono text-[11px] sm:text-xs">
          <div className="flex items-center gap-1 sm:gap-1.5 text-bull font-bold">
            <span>▲ BULLS</span>
            <span className="text-[9px] sm:text-[10px] opacity-80">({biasCounts.bullish})</span>
          </div>
          <span className="text-fg font-mono text-[11px] sm:text-xs font-semibold tabular-nums">
            Score: {avgConfidence}%
          </span>
          <div className="flex items-center gap-1 sm:gap-1.5 text-bear font-bold">
            <span className="text-[9px] sm:text-[10px] opacity-80">({biasCounts.bearish})</span>
            <span>▼ BEARS</span>
          </div>
        </div>

        {/* Tug Track with Sliding Glowing Tug Flag */}
        <div className="bg-bg-elev-3 relative h-2.5 w-full overflow-hidden rounded-xs border border-border/40">
          {/* Center Midpoint Line */}
          <div className="absolute inset-y-0 left-1/2 z-10 w-0.5 -translate-x-1/2 bg-border/80" />

          {/* Green Bull Fill (Left) */}
          <motion.div
            className="from-bull/70 to-emerald-400 absolute inset-y-0 left-0 bg-gradient-to-r"
            initial={{ width: '50%' }}
            animate={{ width: `${tugPercent}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />

          {/* Red Bear Fill (Right) */}
          <motion.div
            className="from-rose-500 to-bear/70 absolute inset-y-0 right-0 bg-gradient-to-r"
            initial={{ width: '50%' }}
            animate={{ width: `${100 - tugPercent}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />

          {/* Tug Marker */}
          <motion.div
            className="absolute top-0 bottom-0 z-20 flex -translate-x-1/2 items-center justify-center px-0.5"
            initial={{ left: '50%' }}
            animate={{ left: `${tugPercent}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            <div className="h-3.5 w-1 rounded-2xs bg-white shadow-[0_0_8px_rgba(255,255,255,1)]" />
          </motion.div>
        </div>
      </div>

      {/* Expandable Agent Rationales */}
      {opinions.length > 0 && (
        <div className="pt-0.5 sm:pt-1">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-fg-muted hover:text-fg flex w-full items-center justify-between font-mono text-[10px] sm:text-[11px] font-semibold transition-colors cursor-pointer touch-manipulation"
          >
            <span>{expanded ? '▲ Hide Agent Breakdown' : '▼ View Agent Breakdown & Reasoning'}</span>
            <span className="text-caption text-fg-subtle text-[10px]">
              {opinions.length} Specialist Reports
            </span>
          </button>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="mt-2 flex flex-col gap-1.5 sm:gap-2 overflow-hidden pt-1"
              >
                {opinions.map((op) => (
                  <div
                    key={op.agentName}
                    className="border-border bg-bg-elev-2 flex flex-col gap-1 rounded-xs border p-2 sm:p-2.5 text-[11px] sm:text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-fg font-mono font-bold capitalize text-[11px] sm:text-xs">
                        {op.agentName} Specialist
                      </span>
                      <span
                        className={cn(
                          'font-mono font-semibold uppercase text-[10px] sm:text-[11px]',
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
                    <p className="text-fg-muted leading-relaxed text-[10.5px] sm:text-[11px]">{op.reasoning}</p>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

