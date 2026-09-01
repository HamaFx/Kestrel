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
import { motion } from 'motion/react';
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
      className={cn('size-8 shrink-0 select-none sm:size-10', className)}
      style={{ shapeRendering: 'crispEdges', imageRendering: 'pixelated' }}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/**
 * Chart Wizard (Technical Analyst)
 * Features: Purple/indigo wizard hat with glowing star, wand casting gestures,
 * spectacles, animated robe, casting candlestick vectors.
 */
export function ChartWizardSprite({
  className,
  isThinking,
  isDone,
  bias,
  isSparkling,
}: SpriteProps) {
  return (
    <motion.div
      className={cn(
        'animate-pixel-wizard relative inline-flex items-center justify-center',
        className,
      )}
      animate={
        isThinking
          ? { y: [0, -4, 0], rotate: [-2, 2, -2] }
          : isDone
            ? { y: [0, -5, 0], scale: [1, 1.08, 1] }
            : { y: [0, -3, 0] }
      }
      transition={{
        duration: isThinking ? 0.8 : isDone ? 1.6 : 2.0,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    >
      {/* Floating Golden Sparks for high-confidence / bullish celebration */}
      {(isSparkling || (isDone && bias === 'bullish')) && (
        <div className="animate-pixel-sparkle pointer-events-none absolute -top-4 -left-1 z-10 flex items-center gap-1">
          <span className="text-caption font-mono leading-none font-bold text-amber-400 select-none">
            ✦
          </span>
          <span className="text-caption font-mono leading-none font-bold text-yellow-300 select-none">
            ✧
          </span>
        </div>
      )}

      <PixelSvg viewBox="0 0 24 24">
        {/* Wizard Hat Peak & Pulsing Star */}
        <rect x="11" y="2" width="2" height="2" fill="#818cf8" />
        <rect x="10" y="4" width="4" height="2" fill="#6366f1" />
        <rect x="9" y="6" width="6" height="3" fill="#4f46e5" />
        <rect x="7" y="9" width="10" height="2" fill="#3730a3" />
        <rect x="11" y="5" width="2" height="2" fill="#fbbf24" /> {/* Gold Star */}
        {/* Wizard Face & Eyeglasses */}
        <rect x="8" y="11" width="8" height="4" fill="#fed7aa" />
        <rect x="9" y="12" width="2" height="2" fill="#312e81" /> {/* Spectacles Frame */}
        <rect x="10" y="12" width="1" height="1" fill="#67e8f9" /> {/* Glass Lens Glow */}
        <rect x="13" y="12" width="2" height="2" fill="#312e81" />
        <rect x="14" y="12" width="1" height="1" fill="#67e8f9" />
        <rect x="11" y="12" width="2" height="1" fill="#fbbf24" /> {/* Gold Bridge */}
        {/* Beard & Smile */}
        <rect x="10" y="14" width="4" height="2" fill="#e0e7ff" />
        <rect x="11" y="16" width="2" height="1" fill="#c7d2fe" />
        {/* Robe Body */}
        <rect x="8" y="14" width="8" height="6" fill="#3730a3" />
        <rect x="10" y="14" width="4" height="6" fill="#4338ca" />
        {/* Active Hand / Wand casting */}
        <rect x="6" y="16" width="2" height="2" fill="#fed7aa" />
        <rect x="16" y="16" width="2" height="2" fill="#fed7aa" />
        <rect x="18" y="13" width="1" height="5" fill="#facc15" /> {/* Wand shaft */}
        <rect x="18" y="12" width="2" height="2" fill="#4ade80" className="animate-pulse" />{' '}
        {/* Tip */}
        {/* Feet / Shadow */}
        <rect x="9" y="20" width="3" height="2" fill="#1e1b4b" />
        <rect x="12" y="20" width="3" height="2" fill="#1e1b4b" />
        <rect x="7" y="22" width="10" height="1" fill="#0f172a" opacity="0.4" />
      </PixelSvg>
    </motion.div>
  );
}

/**
 * Macro Mage (Fundamental Specialist)
 * Features: Crimson/amber scholar cowl, spectacles, scrolling through
 * animated data parchment and macro rate ledgers.
 */
export function MacroMageSprite({ className, isThinking, isDone, bias: _bias }: SpriteProps) {
  return (
    <motion.div
      className={cn(
        'animate-pixel-mage relative inline-flex items-center justify-center',
        className,
      )}
      animate={
        isThinking
          ? { y: [0, -3.5, 0], rotate: [-1.5, 1.5, -1.5] }
          : isDone
            ? { y: [0, -4.5, 0], scale: [1, 1.07, 1] }
            : { y: [0, -2.5, 0] }
      }
      transition={{
        duration: isThinking ? 0.85 : isDone ? 1.8 : 2.4,
        repeat: Infinity,
        ease: 'easeInOut',
        delay: 0.15,
      }}
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
        <rect x="10" y="9" width="2" height="1" fill="#38bdf8" opacity="0.8" />{' '}
        {/* Glasses shine */}
        <rect x="11" y="11" width="2" height="1" fill="#d97706" /> {/* Mustache */}
        {/* Scholar Robe Body */}
        <rect x="8" y="13" width="8" height="7" fill="#451a03" />
        <rect x="10" y="13" width="4" height="7" fill="#b45309" />
        {/* Animated Macro Data Scroll in hands */}
        <rect x="5" y="15" width="4" height="5" fill="#fef3c7" /> {/* Scroll sheet */}
        <rect x="6" y="16" width="2" height="1" fill="#0284c7" /> {/* Data lines */}
        <rect x="6" y="18" width="2" height="1" fill="#0284c7" />
        <rect x="4" y="14" width="1" height="7" fill="#d97706" /> {/* Scroll roller */}
        <rect x="15" y="16" width="2" height="2" fill="#fde68a" /> {/* Right hand */}
        {/* Feet / Base Shadow */}
        <rect x="9" y="20" width="3" height="2" fill="#1c1917" />
        <rect x="12" y="20" width="3" height="2" fill="#1c1917" />
        <rect x="7" y="22" width="10" height="1" fill="#0f172a" opacity="0.4" />
      </PixelSvg>
    </motion.div>
  );
}

/**
 * Risk Knight (Risk & Volatility Guardian)
 * Features: Steel armor, visor helmet with glowing sweeping amber visor,
 * holding a pixel shield that pulses against volatility spikes.
 */
export function RiskKnightSprite({ className, isThinking, isDone, bias, hasAlarm }: SpriteProps) {
  return (
    <motion.div
      className={cn(
        'animate-pixel-knight relative inline-flex items-center justify-center',
        className,
      )}
      animate={
        isThinking
          ? { y: [0, -3.5, 0], rotate: [-1.5, 1.5, -1.5] }
          : isDone
            ? { y: [0, -4.5, 0], scale: [1, 1.07, 1] }
            : { y: [0, -2.5, 0] }
      }
      transition={{
        duration: isThinking ? 0.9 : isDone ? 1.9 : 2.2,
        repeat: Infinity,
        ease: 'easeInOut',
        delay: 0.3,
      }}
    >
      {/* Flashing Hazard / Volatility Alarm Beacon on helmet */}
      {(hasAlarm || (isDone && bias === 'bearish')) && (
        <div className="pointer-events-none absolute -top-3.5 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center">
          <div className="size-2 animate-pulse rounded-xs bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)]" />
        </div>
      )}

      <PixelSvg viewBox="0 0 24 24">
        {/* Knight Helmet & Crest */}
        <rect x="11" y="2" width="2" height="2" fill="#ef4444" /> {/* Red feather crest */}
        <rect x="10" y="4" width="4" height="2" fill="#64748b" />
        <rect x="8" y="6" width="8" height="5" fill="#475569" />
        {/* Glowing Visor Slit with Animated Scanner Sweep */}
        <rect x="9" y="8" width="6" height="2" fill="#0f172a" />
        <rect x="10" y="8" width="4" height="1" fill="#f59e0b" className="animate-pixel-scanner" />
        {/* Armor Torso */}
        <rect x="8" y="11" width="8" height="8" fill="#334155" />
        <rect x="10" y="12" width="4" height="5" fill="#64748b" />
        <rect x="11" y="14" width="2" height="2" fill="#94a3b8" />
        {/* Pixel Shield with Pulsing Energy Crest */}
        <rect x="4" y="11" width="4" height="7" fill="#1e293b" />
        <rect x="5" y="12" width="2" height="5" fill="#3b82f6" />
        <rect x="5" y="14" width="2" height="1" fill="#60a5fa" className="animate-pulse" />
        <rect x="5" y="18" width="2" height="1" fill="#1e293b" />
        {/* Right Hand / Caliper needle */}
        <rect x="16" y="13" width="2" height="4" fill="#94a3b8" />
        <rect x="17" y="11" width="1" height="7" fill="#cbd5e1" />
        {/* Steel Boots / Shadow */}
        <rect x="9" y="19" width="3" height="3" fill="#1e293b" />
        <rect x="12" y="19" width="3" height="3" fill="#1e293b" />
        <rect x="7" y="22" width="10" height="1" fill="#0f172a" opacity="0.4" />
      </PixelSvg>
    </motion.div>
  );
}

/**
 * Kestrel Falcon (Sentinel & Committee Lead)
 * Features: Sharp falcon beak, amber feathers, animated flapping wings,
 * scanning left and right to lock in the final consensus.
 */
export function KestrelFalconSprite({
  className,
  isThinking,
  isDone,
  bias,
  hasWingsSpread,
}: SpriteProps) {
  return (
    <motion.div
      className={cn(
        'animate-pixel-falcon relative inline-flex items-center justify-center',
        className,
      )}
      animate={
        isThinking
          ? { y: [0, -4.5, 0], rotate: [-3, 3, -3] }
          : isDone
            ? { y: [0, -6, 0], rotate: [-2, 2, -2], scale: [1, 1.1, 1] }
            : { y: [0, -3.5, 0], rotate: [-2, 2, -2] }
      }
      transition={{
        duration: isThinking ? 0.75 : isDone ? 1.5 : 1.8,
        repeat: Infinity,
        ease: 'easeInOut',
        delay: 0.1,
      }}
    >
      {/* Victory Glow Sparkle */}
      {(hasWingsSpread || (isDone && bias === 'bullish')) && (
        <div className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2">
          <span className="block size-1.5 animate-ping rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
        </div>
      )}

      <PixelSvg viewBox="0 0 24 24">
        {/* Falcon Crest & Head */}
        <rect x="10" y="3" width="4" height="2" fill="#d97706" />
        <rect x="9" y="5" width="6" height="5" fill="#f59e0b" />

        {/* Sharp Beak */}
        <rect x="15" y="7" width="3" height="2" fill="#fbbf24" />
        <rect x="16" y="8" width="2" height="2" fill="#b45309" />

        {/* Golden Falcon Eye with Pupil Gleam */}
        <rect x="12" y="6" width="2" height="2" fill="#0f172a" />
        <rect x="12" y="6" width="1" height="1" fill="#fef08a" />

        {/* Body Feathers */}
        <rect x="8" y="10" width="8" height="8" fill="#b45309" />
        <rect x="9" y="11" width="5" height="6" fill="#fde68a" />
        <rect x="10" y="12" width="3" height="4" fill="#f59e0b" />

        {/* Animated Flapping Wings */}
        <rect x="4" y="8" width="4" height="6" fill="#92400e" />
        <rect x="3" y="9" width="2" height="4" fill="#78350f" />
        <rect x="16" y="11" width="4" height="5" fill="#92400e" />

        {/* Perched Talons / Shadow */}
        <rect x="9" y="18" width="2" height="3" fill="#d97706" />
        <rect x="13" y="18" width="2" height="3" fill="#d97706" />
        <rect x="7" y="21" width="10" height="2" fill="#475569" />
      </PixelSvg>
    </motion.div>
  );
}

/**
 * Workstation 1: Technical Dual-Screen Terminal
 * Features: Multi-timeframe candlestick screen with sub-oscillator display and live climbing wicks.
 */
export function TechnicalWorkstation({ isThinking }: { isThinking?: boolean }) {
  return (
    <PixelSvg viewBox="0 0 24 18" className="size-5.5 opacity-95 sm:size-7">
      {/* Primary CRT Monitor Chassis */}
      <rect x="1" y="2" width="15" height="11" fill="#1e293b" />
      <rect x="2" y="3" width="13" height="9" fill="#052e16" />

      {/* Candlestick Vectors & Live Forming Bar */}
      <rect x="3" y="8" width="1" height="3" fill="#22c55e" />
      <rect x="5" y="6" width="1" height="4" fill="#22c55e" />
      <rect x="7" y="7" width="1" height="3" fill="#ef4444" />
      <rect x="9" y="4" width="1" height="6" fill="#22c55e" />
      <rect x="11" y="5" width="1" height="4" fill="#22c55e" />
      <rect
        x="13"
        y="3"
        width="1"
        height="6"
        fill={isThinking ? '#4ade80' : '#22c55e'}
        className={isThinking ? 'animate-pulse' : undefined}
      />
      {/* Moving Candle Wick */}
      {isThinking && <rect x="13" y="2" width="1" height="1" fill="#86efac" />}

      {/* Auxiliary Mini Display (RSI / Sub-chart) */}
      <rect x="17" y="4" width="6" height="8" fill="#1e293b" />
      <rect x="18" y="5" width="4" height="6" fill="#022c22" />
      <rect x="19" y="6" width="2" height="1" fill="#10b981" />
      <rect x="19" y="8" width="2" height="1" fill="#10b981" />
      <rect
        x="20"
        y="9"
        width="1"
        height="1"
        fill="#34d399"
        className={isThinking ? 'animate-ping' : undefined}
      />

      {/* Monitor Stands */}
      <rect x="6" y="13" width="4" height="2" fill="#334155" />
      <rect x="4" y="15" width="8" height="1" fill="#475569" />
      <rect x="19" y="12" width="2" height="3" fill="#334155" />
      {/* Power LED Indicator */}
      <rect x="2" y="12" width="1" height="1" fill="#22c55e" />
    </PixelSvg>
  );
}

/**
 * Workstation 2: Macro News Ledger & Brass Lamp
 * Features: Open economic parchment ledger, desk lamp, and scrolling ticker lines.
 */
export function MacroWorkstation({ isThinking }: { isThinking?: boolean }) {
  return (
    <PixelSvg viewBox="0 0 24 18" className="size-5.5 opacity-95 sm:size-7">
      {/* Macro Data Terminal Screen */}
      <rect x="2" y="2" width="14" height="11" fill="#1c1917" />
      <rect x="3" y="3" width="12" height="9" fill="#0c4a6e" />

      {/* Yield / Policy Text Lines */}
      <rect x="5" y="5" width="8" height="1" fill="#38bdf8" />
      <rect x="5" y="7" width="6" height="1" fill="#7dd3fc" />
      <rect x="5" y="9" width="7" height="1" fill="#e0f2fe" />
      <rect
        x="9"
        y="9"
        width="2"
        height="1"
        fill="#facc15"
        className={isThinking ? 'animate-pulse' : undefined}
      />
      {/* Live In-flight Wire Line */}
      {isThinking && (
        <rect x="5" y="10" width="4" height="1" fill="#38bdf8" className="animate-pulse" />
      )}

      {/* Vintage Brass Desk Lamp */}
      <rect x="18" y="3" width="4" height="2" fill="#d97706" />
      <rect
        x="19"
        y="5"
        width="2"
        height="2"
        fill="#fef08a"
        className={isThinking ? 'animate-pulse' : undefined}
      />
      <rect x="20" y="7" width="1" height="6" fill="#b45309" />
      <rect x="18" y="13" width="4" height="1" fill="#92400e" />

      {/* Terminal Stand */}
      <rect x="7" y="13" width="4" height="2" fill="#44403c" />
      <rect x="5" y="15" width="8" height="1" fill="#57534e" />
      {/* Power LED Indicator */}
      <rect x="3" y="12" width="1" height="1" fill="#38bdf8" />
    </PixelSvg>
  );
}

/**
 * Workstation 3: Tactical VaR Radar Terminal
 * Features: Tactical circular radar sweep screen with armor plating and hazard beacon.
 */
export function RiskWorkstation({ isThinking }: { isThinking?: boolean }) {
  return (
    <PixelSvg viewBox="0 0 24 18" className="size-5.5 opacity-95 sm:size-7">
      {/* Heavy Armored Monitor Chassis */}
      <rect x="2" y="2" width="16" height="11" fill="#1e293b" />
      <rect x="3" y="3" width="14" height="9" fill="#18181b" />

      {/* Radar Circles & Crosshair */}
      <rect x="8" y="4" width="4" height="7" fill="#881337" opacity="0.4" />
      <rect x="6" y="7" width="8" height="1" fill="#e11d48" opacity="0.7" />
      <rect x="9" y="4" width="1" height="7" fill="#e11d48" opacity="0.7" />
      <rect
        x="10"
        y="5"
        width="2"
        height="2"
        fill="#f43f5e"
        className={isThinking ? 'animate-ping' : undefined}
      />
      <rect x="7" y="8" width="2" height="2" fill="#fb7185" />

      {/* Hazard Warning Strip with alternating indicators */}
      <rect x="19" y="4" width="2" height="8" fill="#ef4444" />
      <rect x="19" y="6" width="2" height="2" fill="#0f172a" />
      <rect x="19" y="10" width="2" height="2" fill="#0f172a" />

      {/* Fortified Heavy Mount Stand */}
      <rect x="8" y="13" width="4" height="2" fill="#334155" />
      <rect x="5" y="15" width="10" height="1" fill="#475569" />
      {/* Alarm Beacon */}
      <rect
        x="3"
        y="12"
        width="1"
        height="1"
        fill="#f43f5e"
        className={isThinking ? 'animate-pulse' : undefined}
      />
    </PixelSvg>
  );
}

/**
 * Workstation 4: Sentinel Satellite & Whale Scanner
 * Features: High-altitude antenna array, satellite dish, and institutional flow grid.
 */
export function SentinelWorkstation({ isThinking }: { isThinking?: boolean }) {
  return (
    <PixelSvg viewBox="0 0 24 18" className="size-5.5 opacity-95 sm:size-7">
      {/* High-Tech Whale Terminal */}
      <rect x="2" y="3" width="14" height="10" fill="#1e293b" />
      <rect x="3" y="4" width="12" height="8" fill="#451a03" />

      {/* Whale Order Flow Heatmap */}
      <rect x="5" y="6" width="4" height="2" fill="#f59e0b" />
      <rect x="9" y="8" width="4" height="2" fill="#d97706" />
      <rect x="6" y="9" width="3" height="1" fill="#fbbf24" />
      <rect
        x="11"
        y="6"
        width="2"
        height="2"
        fill="#fef08a"
        className={isThinking ? 'animate-pulse' : undefined}
      />

      {/* Satellite Dish & Antenna */}
      <rect x="17" y="1" width="1" height="6" fill="#94a3b8" />
      <rect x="19" y="2" width="3" height="3" fill="#f59e0b" />
      <rect x="18" y="3" width="1" height="1" fill="#fbbf24" />
      <rect
        x="16"
        y="0"
        width="3"
        height="1"
        fill={isThinking ? '#fbbf24' : '#e2e8f0'}
        className={isThinking ? 'animate-pulse' : undefined}
      />

      {/* Satellite Mount Stand */}
      <rect x="7" y="13" width="4" height="2" fill="#334155" />
      <rect x="5" y="15" width="8" height="1" fill="#475569" />
      <rect x="16" y="7" width="3" height="8" fill="#334155" />
      {/* Comms Pulse LED */}
      <rect x="3" y="12" width="1" height="1" fill="#fbbf24" />
    </PixelSvg>
  );
}

/**
 * 🪵 TradingFloorDesk
 * Continuous retro trading desk counter across the bottom of the character row
 * with subtle ambient props and consensus-reactive neon underglow.
 */
export function TradingFloorDesk({
  consensusBias,
  isThinking,
}: {
  consensusBias?: 'bullish' | 'bearish' | 'neutral' | 'disputed';
  isThinking?: boolean;
}) {
  return (
    <div className="relative w-full">
      {/* Continuous Mahogany / Carbon Desk Surface */}
      <div
        className={cn(
          'bg-bg-elev-3 relative h-4.5 w-full rounded-xs border-t transition-all duration-300',
          consensusBias === 'bullish'
            ? 'border-bull/40 shadow-[0_4px_16px_rgba(34,197,94,0.25)]'
            : consensusBias === 'bearish'
              ? 'border-bear/40 shadow-[0_4px_16px_rgba(244,63,94,0.25)]'
              : consensusBias === 'disputed'
                ? 'border-warn/40 shadow-[0_4px_16px_rgba(234,179,8,0.25)]'
                : 'border-border/80 shadow-md',
        )}
      >
        {/* Subtle Bevel Highlight Line */}
        <div
          className={cn(
            'absolute inset-x-0 top-0 h-[1px] transition-colors duration-300',
            consensusBias === 'bullish'
              ? 'bg-bull/60'
              : consensusBias === 'bearish'
                ? 'bg-bear/60'
                : consensusBias === 'disputed'
                  ? 'bg-warn/60'
                  : 'bg-border/60',
          )}
        />

        {/* Ambient Desk Props Spanned Across Positions */}
        <div className="flex h-full items-center justify-around px-2 sm:px-4">
          {/* Prop 1 (Technical): Stylus & Golden Sticky Pad */}
          <div className="flex items-center gap-1 opacity-75" title="Order Flow Notes">
            <div className="rounded-2xs h-1.5 w-3 bg-amber-400/90 shadow-xs" />
            <div className="bg-fg-subtle h-0.5 w-3" />
          </div>

          {/* Prop 2 (Macro): Steaming Pixel Coffee Mug */}
          <div className="relative flex items-center gap-1 opacity-85" title="Hot Coffee Mug">
            {/* Multi-layer animated steam */}
            <motion.span
              className="bg-fg-subtle/80 absolute -top-2.5 left-0.5 h-2 w-0.5 rounded-full"
              animate={{ y: [-1, -4, -1], opacity: [0.3, 0.9, 0.3] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.span
              className="bg-fg-subtle/60 absolute -top-3 left-1.5 h-2 w-0.5 rounded-full"
              animate={{ y: [-2, -5, -2], opacity: [0.2, 0.7, 0.2] }}
              transition={{ duration: 2.0, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
            />
            <div className="rounded-2xs size-2 border border-amber-900/60 bg-amber-700 shadow-xs" />
          </div>

          {/* Prop 3 (Risk): Caliper & Vault Lock */}
          <div className="flex items-center gap-1 opacity-75" title="Risk Hard-Stop Caliper">
            <div className="rounded-2xs h-1.5 w-2 border border-slate-600 bg-slate-500 shadow-xs" />
            <div className="h-0.5 w-2.5 bg-red-400/80" />
          </div>

          {/* Prop 4 (Sentinel): Institutional Gold Coin & Ticker Tape */}
          <div
            className="flex items-center gap-1.5 opacity-85"
            title="Live Tape & Institutional Coin"
          >
            <div className="size-2 rounded-full border border-amber-600 bg-amber-400 shadow-xs" />
            {isThinking && (
              <motion.div
                className="rounded-2xs h-1.5 w-3 bg-slate-200 shadow-xs"
                animate={{ width: [8, 14, 8] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
            )}
          </div>
        </div>

        {/* Under-Desk Glow & Shadow Strip */}
        <div
          className={cn(
            'absolute inset-x-0 -bottom-1 h-1 transition-all duration-300',
            consensusBias === 'bullish'
              ? 'bg-bull/20'
              : consensusBias === 'bearish'
                ? 'bg-bear/20'
                : consensusBias === 'disputed'
                  ? 'bg-warn/20'
                  : 'bg-bg/60',
          )}
        />
      </div>
    </div>
  );
}

/**
 * Backward-compatible generic CRT monitor sprite
 */
export function RetroCrtMonitor({ isThinking }: { isThinking?: boolean }) {
  return <TechnicalWorkstation isThinking={isThinking} />;
}
