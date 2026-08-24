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

import { m, useReducedMotion } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface SpriteProps {
  className?: string;
  isThinking?: boolean;
  isDone?: boolean;
  bias?: 'bullish' | 'bearish' | 'neutral';
  isSparkling?: boolean;
  hasAlarm?: boolean;
  hasWingsSpread?: boolean;
  isShielding?: boolean;
  style?: CSSProperties;
}

/**
 * Common SVG wrapper with crispEdges for authentic 8-bit rendering
 * across Retina and standard displays.
 */
function PixelSvg({
  children,
  className,
  viewBox = '0 0 24 24',
}: {
  children: ReactNode;
  className?: string;
  viewBox?: string;
}) {
  return (
    <svg
      viewBox={viewBox}
      className={cn('size-10 shrink-0 select-none', className)}
      style={{ shapeRendering: 'crispEdges', imageRendering: 'pixelated' }}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/**
 * 📈 Chart Wizard (Technical Analyst)
 * Features: Purple/blue wizard hat with golden pixel star, round spectacles,
 * animated robe, hands moving across a glowing terminal.
 */
export function ChartWizardSprite({ className, isThinking, isDone, bias, isSparkling }: SpriteProps) {
  const prefersReduced = useReducedMotion();

  return (
    <m.div
      className={cn('relative inline-flex items-center justify-center', className)}
      animate={
        prefersReduced
          ? undefined
          : isDone
            ? { y: [0, -4, 0], scale: [1, 1.06, 1] }
            : isThinking
              ? { y: [0, -1.5, 0] }
              : undefined
      }
      transition={
        isDone
          ? { duration: 0.5, repeat: 1, ease: 'easeOut' }
          : { duration: 0.8, repeat: Infinity, ease: 'easeInOut' }
      }
    >
      {/* Floating Golden Sparks for high-confidence / bullish celebration */}
      {(isSparkling || (isDone && bias === 'bullish')) && (
        <m.div
          className="pointer-events-none absolute -top-4 -left-1 flex items-center gap-1 z-10"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: [0.6, 1, 0.6], y: [-1, -3, -1], scale: [0.9, 1.1, 0.9] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <span className="text-amber-400 font-mono text-[9px] font-bold select-none leading-none">✦</span>
          <span className="text-yellow-300 font-mono text-[7px] font-bold select-none leading-none">✧</span>
        </m.div>
      )}

      <PixelSvg viewBox="0 0 24 24">
        {/* Wizard Hat Peak & Star */}
        <rect x="11" y="2" width="2" height="2" fill="#818cf8" />
        <rect x="10" y="4" width="4" height="2" fill="#6366f1" />
        <rect x="9" y="5" width="2" height="1" fill="#facc15" /> {/* Gold star pixel */}
        <rect x="9" y="6" width="6" height="2" fill="#4f46e5" />
        <rect x="7" y="8" width="10" height="1" fill="#4338ca" /> {/* Hat brim */}

        {/* Head & Skin */}
        <rect x="9" y="9" width="6" height="5" fill="#fed7aa" />
        
        {/* Spectacles / Glasses */}
        <rect x="9" y="10" width="2" height="2" fill="#1e1b4b" />
        <rect x="10" y="10" width="1" height="1" fill="#38bdf8" />
        <rect x="11" y="10" width="2" height="1" fill="#1e1b4b" />
        <rect x="13" y="10" width="2" height="2" fill="#1e1b4b" />
        <rect x="14" y="10" width="1" height="1" fill="#38bdf8" />
        
        {/* Beard / Smile */}
        <rect x="10" y="13" width="4" height="2" fill="#e0e7ff" />
        <rect x="11" y="15" width="2" height="1" fill="#c7d2fe" />

        {/* Robe Body */}
        <rect x="8" y="14" width="8" height="6" fill="#3730a3" />
        <rect x="10" y="14" width="4" height="6" fill="#4338ca" />

        {/* Active Hand / Wand drawing candlesticks */}
        {isThinking ? (
          <>
            <rect x="6" y="16" width="2" height="2" fill="#fed7aa" />
            <rect x="16" y="16" width="2" height="2" fill="#fed7aa" />
            <rect x="18" y="14" width="1" height="4" fill="#22c55e" /> {/* Mini green candle */}
            <rect x="19" y="15" width="1" height="2" fill="#22c55e" />
          </>
        ) : (
          <>
            <rect x="7" y="17" width="2" height="2" fill="#fed7aa" />
            <rect x="15" y="17" width="2" height="2" fill="#fed7aa" />
          </>
        )}

        {/* Feet / Shadow */}
        <rect x="9" y="20" width="3" height="2" fill="#1e1b4b" />
        <rect x="12" y="20" width="3" height="2" fill="#1e1b4b" />
        <rect x="7" y="22" width="10" height="1" fill="#0f172a" opacity="0.4" />
      </PixelSvg>

      {/* Floating Mini 8-bit Chart Bubble */}
      {isThinking && (
        <span
          className="bg-bg-elev-2 border-bull/50 text-bull pointer-events-none absolute -top-3 -right-2 flex items-center rounded-xs border px-1 py-0.5 font-mono text-[9px] font-bold shadow-xs motion-safe:animate-pulse"
        >
          ▲15m
        </span>
      )}
      {isDone && bias && (
        <span
          className={cn(
            'pointer-events-none absolute -top-3 -right-2 flex items-center rounded-xs border px-1 py-0.5 font-mono text-[9px] font-bold shadow-xs',
            bias === 'bullish'
              ? 'border-bull/60 bg-bull/10 text-bull'
              : bias === 'bearish'
                ? 'border-bear/60 bg-bear/10 text-bear'
                : 'border-border bg-bg-elev-2 text-fg-muted',
          )}
        >
          {bias === 'bullish' ? '▲BUY' : bias === 'bearish' ? '▼SELL' : '■NEUT'}
        </span>
      )}
    </m.div>
  );
}

/**
 * 🧙 Macro Mage (Fundamental Specialist)
 * Features: Crimson/amber scholar cowl, spectacles, scrolling through
 * animated data parchment and macro rate ledgers.
 */
export function MacroMageSprite({ className, isThinking, isDone, bias }: SpriteProps) {
  const prefersReduced = useReducedMotion();

  return (
    <m.div
      className={cn('relative inline-flex items-center justify-center', className)}
      animate={
        prefersReduced
          ? undefined
          : isDone
            ? { y: [0, -4, 0], scale: [1, 1.06, 1] }
            : isThinking
              ? { y: [0, -1.5, 0] }
              : undefined
      }
      transition={
        isDone
          ? { duration: 0.5, repeat: 1, ease: 'easeOut', delay: 0.1 }
          : { duration: 0.85, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }
      }
    >
      <PixelSvg viewBox="0 0 24 24">
        {/* Scholar Cowl / Hood */}
        <rect x="9" y="3" width="6" height="2" fill="#b45309" />
        <rect x="8" y="5" width="8" height="3" fill="#92400e" />
        <rect x="7" y="7" width="10" height="2" fill="#78350f" />

        {/* Face */}
        <rect x="9" y="8" width="6" height="5" fill="#fde68a" />
        <rect x="10" y="9" width="1" height="2" fill="#451a03" /> {/* Eyes */}
        <rect x="13" y="9" width="1" height="2" fill="#451a03" />
        <rect x="11" y="11" width="2" height="1" fill="#d97706" /> {/* Mustache */}

        {/* Scholar Robe Body */}
        <rect x="8" y="13" width="8" height="7" fill="#451a03" />
        <rect x="10" y="13" width="4" height="7" fill="#b45309" />

        {/* Animated Macro Data Scroll in hands */}
        {isThinking ? (
          <>
            <rect x="5" y="15" width="4" height="5" fill="#fef3c7" /> {/* Scroll sheet */}
            <rect x="6" y="16" width="2" height="1" fill="#0284c7" /> {/* Data lines */}
            <rect x="6" y="18" width="2" height="1" fill="#0284c7" />
            <rect x="4" y="14" width="1" height="7" fill="#d97706" /> {/* Scroll roller */}
            <rect x="15" y="16" width="2" height="2" fill="#fde68a" /> {/* Right hand */}
          </>
        ) : (
          <>
            <rect x="6" y="16" width="3" height="4" fill="#fef3c7" />
            <rect x="15" y="16" width="3" height="4" fill="#fef3c7" />
          </>
        )}

        {/* Feet / Base Shadow */}
        <rect x="9" y="20" width="3" height="2" fill="#1c1917" />
        <rect x="12" y="20" width="3" height="2" fill="#1c1917" />
        <rect x="7" y="22" width="10" height="1" fill="#0f172a" opacity="0.4" />
      </PixelSvg>

      {/* Floating Mini 8-bit Macro Indicator */}
      {isThinking && (
        <span
          className="bg-bg-elev-2 border-info/50 text-info pointer-events-none absolute -top-3 -right-2 flex items-center rounded-xs border px-1 py-0.5 font-mono text-[9px] font-bold shadow-xs motion-safe:animate-pulse"
        >
          FED·CPI
        </span>
      )}
      {isDone && bias && (
        <span
          className={cn(
            'pointer-events-none absolute -top-3 -right-2 flex items-center rounded-xs border px-1 py-0.5 font-mono text-[9px] font-bold shadow-xs',
            bias === 'bullish'
              ? 'border-bull/60 bg-bull/10 text-bull'
              : bias === 'bearish'
                ? 'border-bear/60 bg-bear/10 text-bear'
                : 'border-border bg-bg-elev-2 text-fg-muted',
          )}
        >
          {bias === 'bullish' ? 'GROWTH' : bias === 'bearish' ? 'RECESS' : 'STEADY'}
        </span>
      )}
    </m.div>
  );
}

/**
 * 🛡️ Risk Knight (Risk & Volatility Guardian)
 * Features: Steel armor, visor helmet with glowing amber visor,
 * holding a pixel shield that pulses against volatility spikes.
 */
export function RiskKnightSprite({ className, isThinking, isDone, bias, hasAlarm }: SpriteProps) {
  const prefersReduced = useReducedMotion();

  return (
    <m.div
      className={cn('relative inline-flex items-center justify-center', className)}
      animate={
        prefersReduced
          ? undefined
          : isDone
            ? { y: [0, -4, 0], scale: [1, 1.06, 1] }
            : isThinking
              ? { y: [0, -1.5, 0] }
              : undefined
      }
      transition={
        isDone
          ? { duration: 0.5, repeat: 1, ease: 'easeOut', delay: 0.2 }
          : { duration: 0.9, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }
      }
    >
      {/* Flashing Hazard / Volatility Alarm Beacon on helmet */}
      {(hasAlarm || (isDone && bias === 'bearish')) && (
        <m.div
          className="pointer-events-none absolute -top-3.5 left-1/2 -translate-x-1/2 flex flex-col items-center z-10"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: [0.7, 1, 0.7], scale: [0.95, 1.15, 0.95] }}
          transition={{ duration: 0.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="size-2 rounded-xs bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)] animate-pulse" />
        </m.div>
      )}

      <PixelSvg viewBox="0 0 24 24">
        {/* Knight Helmet & Crest */}
        <rect x="11" y="2" width="2" height="2" fill="#ef4444" /> {/* Red feather crest */}
        <rect x="10" y="4" width="4" height="2" fill="#64748b" />
        <rect x="8" y="6" width="8" height="5" fill="#475569" />

        {/* Glowing Visor Slit */}
        <rect x="9" y="8" width="6" height="2" fill="#0f172a" />
        <rect x="10" y="8" width="4" height="1" fill="#f59e0b" /> {/* Amber scanner glow */}

        {/* Armor Torso */}
        <rect x="8" y="11" width="8" height="8" fill="#334155" />
        <rect x="10" y="12" width="4" height="5" fill="#64748b" />
        <rect x="11" y="14" width="2" height="2" fill="#94a3b8" />

        {/* Pixel Shield */}
        <rect x="4" y="11" width="4" height="7" fill="#1e293b" />
        <rect x="5" y="12" width="2" height="5" fill="#3b82f6" /> {/* Blue energy crest */}
        <rect x="5" y="14" width="2" height="1" fill="#60a5fa" />
        <rect x="5" y="18" width="2" height="1" fill="#1e293b" />

        {/* Right Hand / Sword / Gauntlet */}
        <rect x="16" y="13" width="2" height="4" fill="#94a3b8" />
        <rect x="17" y="11" width="1" height="7" fill="#cbd5e1" /> {/* Measuring needle */}

        {/* Steel Boots / Shadow */}
        <rect x="9" y="19" width="3" height="3" fill="#1e293b" />
        <rect x="12" y="19" width="3" height="3" fill="#1e293b" />
        <rect x="7" y="22" width="10" height="1" fill="#0f172a" opacity="0.4" />
      </PixelSvg>

      {/* Floating Mini 8-bit Risk Indicator */}
      {isThinking && (
        <span
          className="bg-bg-elev-2 border-warn/50 text-warn pointer-events-none absolute -top-3 -right-2 flex items-center rounded-xs border px-1 py-0.5 font-mono text-[9px] font-bold shadow-xs motion-safe:animate-pulse"
        >
          VaR 0.7
        </span>
      )}
      {isDone && bias && (
        <span
          className="border-bull/60 bg-bull/10 text-bull pointer-events-none absolute -top-3 -right-2 flex items-center rounded-xs border px-1 py-0.5 font-mono text-[9px] font-bold shadow-xs"
        >
          🛡️SAFE
        </span>
      )}
    </m.div>
  );
}

/**
 * 🦅 Kestrel Falcon (Sentinel & Committee Lead)
 * Features: Sharp falcon beak, amber feathers, animated flapping wings,
 * scanning left and right to lock in the final consensus.
 */
export function KestrelFalconSprite({ className, isThinking, isDone, bias, hasWingsSpread }: SpriteProps) {
  const prefersReduced = useReducedMotion();

  return (
    <m.div
      className={cn('relative inline-flex items-center justify-center', className)}
      animate={
        prefersReduced
          ? undefined
          : isDone
            ? { y: [0, -6, 0], rotate: [0, -4, 4, 0], scale: [1, 1.12, 1] }
            : isThinking
              ? { y: [0, -2, 0], rotate: [0, -2, 2, 0] }
              : undefined
      }
      transition={
        isDone
          ? { duration: 0.6, repeat: 1, ease: 'easeOut' }
          : { duration: 0.7, repeat: Infinity, ease: 'easeInOut', delay: 0.1 }
      }
    >
      {/* Victory Crown / Sparkle */}
      {(hasWingsSpread || (isDone && bias === 'bullish')) && (
        <m.div
          className="pointer-events-none absolute -top-3.5 left-1/2 -translate-x-1/2 z-10"
          initial={{ opacity: 0, y: 2 }}
          animate={{ opacity: 1, y: -1 }}
          transition={{ duration: 0.3 }}
        >
          <span className="text-amber-400 font-mono text-[10px] font-bold select-none drop-shadow-xs">👑</span>
        </m.div>
      )}

      <PixelSvg viewBox="0 0 24 24">
        {/* Falcon Crest & Head */}
        <rect x="10" y="3" width="4" height="2" fill="#d97706" />
        <rect x="9" y="5" width="6" height="5" fill="#f59e0b" />

        {/* Sharp Beak */}
        <rect x="15" y="7" width="3" height="2" fill="#fbbf24" />
        <rect x="16" y="8" width="2" height="2" fill="#b45309" />

        {/* Golden Falcon Eye */}
        <rect x="12" y="6" width="2" height="2" fill="#0f172a" />
        <rect x="12" y="6" width="1" height="1" fill="#fef08a" /> {/* Pupil gleam */}

        {/* Body Feathers */}
        <rect x="8" y="10" width="8" height="8" fill="#b45309" />
        <rect x="9" y="11" width="5" height="6" fill="#fde68a" /> {/* Chest feathers */}
        <rect x="10" y="12" width="3" height="4" fill="#f59e0b" />

        {/* Flapping Wings */}
        {isThinking ? (
          <>
            <rect x="4" y="8" width="4" height="6" fill="#92400e" /> {/* Left wing raised */}
            <rect x="3" y="9" width="2" height="4" fill="#78350f" />
            <rect x="16" y="11" width="4" height="5" fill="#92400e" />
          </>
        ) : (
          <>
            <rect x="6" y="11" width="3" height="6" fill="#92400e" />
            <rect x="15" y="11" width="3" height="6" fill="#92400e" />
          </>
        )}

        {/* Perched Talons / Shadow */}
        <rect x="9" y="18" width="2" height="3" fill="#d97706" />
        <rect x="13" y="18" width="2" height="3" fill="#d97706" />
        <rect x="7" y="21" width="10" height="2" fill="#475569" /> {/* Perch beam */}
      </PixelSvg>

      {/* Floating Consensus Coin */}
      {isDone && (
        <span
          className="border-brand/60 bg-brand/10 text-brand pointer-events-none absolute -top-3 -right-2 flex items-center rounded-xs border px-1 py-0.5 font-mono text-[9px] font-bold shadow-xs"
        >
          ★FUSION
        </span>
      )}
    </m.div>
  );
}

/**
 * 🖥️ Retro CRT Monitor Sprite
 * Animated green/amber phosphor scanline graph displaying active candlestick ticks.
 */
export function RetroCrtMonitor({ isThinking }: { isThinking?: boolean }) {
  return (
    <PixelSvg viewBox="0 0 20 18" className="size-6 opacity-80">
      {/* CRT Chassis */}
      <rect x="2" y="2" width="16" height="12" fill="#1e293b" />
      <rect x="3" y="3" width="14" height="10" fill="#0f172a" />
      
      {/* Glowing Screen */}
      <rect x="4" y="4" width="12" height="8" fill="#052e16" />

      {/* Candlestick Green Pixels */}
      <rect x="6" y="8" width="1" height="3" fill="#22c55e" />
      <rect x="8" y="6" width="1" height="4" fill="#22c55e" />
      <rect x="10" y="7" width="1" height="2" fill="#ef4444" />
      <rect x="12" y="5" width="1" height="5" fill="#22c55e" />
      {isThinking && (
        <rect x="14" y="6" width="1" height="3" fill="#4ade80" className="animate-pulse" />
      )}

      {/* CRT Stand */}
      <rect x="8" y="14" width="4" height="2" fill="#334155" />
      <rect x="6" y="16" width="8" height="1" fill="#475569" />
    </PixelSvg>
  );
}
