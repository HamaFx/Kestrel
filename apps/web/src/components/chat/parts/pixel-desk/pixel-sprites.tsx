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

function HardwareSvg({
  children,
  className,
  viewBox = '0 0 32 32',
}: {
  children: ReactNode;
  className?: string;
  viewBox?: string;
}) {
  return (
    <svg
      viewBox={viewBox}
      className={cn('size-9 shrink-0 select-none sm:size-11', className)}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/**
 * 📊 Technical Desk (Oscilloscope & Chart Structure Terminal)
 * High-precision vector CRT oscilloscope showing dynamic candlestick matrix,
 * order block sweeps, and glowing reticle crosshairs.
 */
export function ChartWizardSprite({
  className,
  isThinking,
  isDone,
  bias,
  isSparkling,
}: SpriteProps) {
  const strokeColor = bias === 'bearish' ? '#e02c10' : '#3f9e3d';

  return (
    <motion.div
      className={cn(
        'relative inline-flex items-center justify-center surface-chip rounded-md p-1 bg-[#161616] border border-white/10 shadow-[var(--shadow-chip)]',
        className,
      )}
      animate={
        isThinking
          ? { scale: [1, 1.04, 1] }
          : isDone
            ? { scale: [1, 1.06, 1] }
            : { scale: 1 }
      }
      transition={{
        duration: isThinking ? 1.2 : 2.4,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    >
      {/* Active telemetry signal glow */}
      {(isSparkling || (isDone && bias === 'bullish')) && (
        <div className="pointer-events-none absolute -top-1 -right-1 z-10 flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-[#3f9e3d] shadow-[0_0_8px_#3f9e3d] animate-ping" />
        </div>
      )}

      <HardwareSvg viewBox="0 0 32 32">
        {/* CRT Screen Bezel & Recessed Housing */}
        <rect x="2" y="2" width="28" height="28" rx="4" fill="#111111" stroke="#262626" strokeWidth="1" />
        <rect x="4" y="4" width="24" height="24" rx="2" fill="#080c08" />

        {/* Reticle Grid Lines */}
        <line x1="4" y1="16" x2="28" y2="16" stroke="#1f3320" strokeWidth="0.5" strokeDasharray="2 2" />
        <line x1="16" y1="4" x2="16" y2="28" stroke="#1f3320" strokeWidth="0.5" strokeDasharray="2 2" />

        {/* Candlestick Waveform Sweep */}
        {/* Candle 1 (Bull) */}
        <line x1="8" y1="12" x2="8" y2="22" stroke="#22c55e" strokeWidth="0.75" />
        <rect x="7" y="14" width="2" height="5" fill="#22c55e" rx="0.5" />

        {/* Candle 2 (Bear) */}
        <line x1="13" y1="10" x2="13" y2="20" stroke="#ef4444" strokeWidth="0.75" />
        <rect x="12" y="13" width="2" height="4" fill="#ef4444" rx="0.5" />

        {/* Candle 3 (Bull Expansion) */}
        <line x1="18" y1="8" x2="18" y2="18" stroke="#22c55e" strokeWidth="0.75" />
        <rect x="17" y="9" width="2" height="6" fill="#22c55e" rx="0.5" />

        {/* Dynamic Sweep / Focal Crosshair */}
        <motion.g
          animate={isThinking ? { x: [-4, 6, -4] } : { x: 0 }}
          transition={{ duration: 2.0, repeat: Infinity, ease: 'easeInOut' }}
        >
          <line x1="23" y1="6" x2="23" y2="16" stroke={strokeColor} strokeWidth="0.75" />
          <rect x="22" y="7" width="2" height="7" fill={strokeColor} rx="0.5" />
          <circle cx="23" cy="7" r="1.5" fill="#fff" />
          <circle cx="23" cy="7" r="3.5" stroke={strokeColor} strokeWidth="0.5" opacity="0.6" />
        </motion.g>
      </HardwareSvg>
    </motion.div>
  );
}

/**
 * 📰 Macro News Desk (Fundamental & Yield Differential Teleprinter)
 * Digital rate ledger with streaming central bank wire ticks, yield indicators,
 * and monetary policy ribbon.
 */
export function MacroMageSprite({ className, isThinking, isDone, bias }: SpriteProps) {
  const accentColor = bias === 'bearish' ? '#e02c10' : '#4fa3b5';

  return (
    <motion.div
      className={cn(
        'relative inline-flex items-center justify-center surface-chip rounded-md p-1 bg-[#161616] border border-white/10 shadow-[var(--shadow-chip)]',
        className,
      )}
      animate={
        isThinking
          ? { scale: [1, 1.04, 1] }
          : isDone
            ? { scale: [1, 1.06, 1] }
            : { scale: 1 }
      }
      transition={{
        duration: isThinking ? 1.2 : 2.4,
        repeat: Infinity,
        ease: 'easeInOut',
        delay: 0.2,
      }}
    >
      <HardwareSvg viewBox="0 0 32 32">
        {/* Chassis & Recessed Display */}
        <rect x="2" y="2" width="28" height="28" rx="4" fill="#111111" stroke="#262626" strokeWidth="1" />
        <rect x="4" y="4" width="24" height="24" rx="2" fill="#080e14" />

        {/* Central Bank Rate Bars / Differential scope */}
        <rect x="6" y="7" width="12" height="2" rx="1" fill="#38bdf8" />
        <rect x="6" y="11" width="16" height="1.5" rx="0.75" fill="#7dd3fc" opacity="0.8" />
        <rect x="6" y="14.5" width="9" height="1.5" rx="0.75" fill="#bae6fd" opacity="0.6" />

        {/* Live Ribbon Pulse Line */}
        <path d="M6 22 L11 20 L16 23 L21 18 L26 19" fill="none" stroke={accentColor} strokeWidth="1.5" strokeLinecap="round" />

        {/* In-flight Wire LED */}
        <circle cx="24" cy="8" r="1.5" fill={isThinking ? '#ff3616' : '#38bdf8'} className={isThinking ? 'animate-ping' : undefined} />
      </HardwareSvg>
    </motion.div>
  );
}

/**
 * 🛡️ Risk Desk (Capital Protection & Margin Governor Shield)
 * Solid-state vault dial with concentric safety rings, 1% risk threshold marker,
 * and volatility hazard beacon.
 */
export function RiskKnightSprite({ className, isThinking, isDone, bias, hasAlarm }: SpriteProps) {
  const alert = hasAlarm || (isDone && bias === 'bearish');

  return (
    <motion.div
      className={cn(
        'relative inline-flex items-center justify-center surface-chip rounded-md p-1 bg-[#161616] border border-white/10 shadow-[var(--shadow-chip)]',
        className,
      )}
      animate={
        isThinking
          ? { scale: [1, 1.04, 1] }
          : isDone
            ? { scale: [1, 1.06, 1] }
            : { scale: 1 }
      }
      transition={{
        duration: isThinking ? 1.2 : 2.4,
        repeat: Infinity,
        ease: 'easeInOut',
        delay: 0.4,
      }}
    >
      {alert && (
        <div className="pointer-events-none absolute -top-1 -right-1 z-10">
          <span className="size-1.5 rounded-full bg-[#e02c10] shadow-[0_0_8px_#e02c10] animate-ping" />
        </div>
      )}

      <HardwareSvg viewBox="0 0 32 32">
        {/* Armored Chassis */}
        <rect x="2" y="2" width="28" height="28" rx="4" fill="#111111" stroke="#262626" strokeWidth="1" />
        <rect x="4" y="4" width="24" height="24" rx="2" fill="#14080a" />

        {/* Concentric Governor Rings */}
        <circle cx="16" cy="16" r="9" fill="none" stroke="#2e1518" strokeWidth="2" />
        <circle cx="16" cy="16" r="9" fill="none" stroke={alert ? '#e02c10' : '#d98f00'} strokeWidth="2" strokeDasharray="18 36" />

        {/* Vault Dial Ticks */}
        <line x1="16" y1="8" x2="16" y2="10" stroke="#fff" strokeWidth="1" />
        <line x1="24" y1="16" x2="22" y2="16" stroke="#fff" strokeWidth="1" opacity="0.5" />
        <line x1="16" y1="24" x2="16" y2="22" stroke="#fff" strokeWidth="1" opacity="0.5" />
        <line x1="8" y1="16" x2="10" y2="16" stroke="#fff" strokeWidth="1" opacity="0.5" />

        {/* Calibrated Needle / Center Pin */}
        <motion.line
          x1="16"
          y1="16"
          x2="21"
          y2="12"
          stroke={alert ? '#e02c10' : '#ffffff'}
          strokeWidth="1.5"
          strokeLinecap="round"
          animate={isThinking ? { rotate: [0, 45, -20, 0] } : { rotate: 0 }}
          style={{ originX: '16px', originY: '16px' }}
          transition={{ duration: 2.2, repeat: Infinity }}
        />
        <circle cx="16" cy="16" r="2.5" fill="#222" stroke="#fff" strokeWidth="1" />
      </HardwareSvg>
    </motion.div>
  );
}

/**
 * 🦅 Sovereign Kestrel Falcon (Sentinel & Committee Verdict)
 * Heraldic predator raptor emblem with predatory focus scanner.
 */
export function KestrelFalconSprite({
  className,
  isThinking,
  isDone,
  bias,
  hasWingsSpread: _hasWingsSpread,
}: SpriteProps) {
  return (
    <motion.div
      className={cn(
        'relative inline-flex items-center justify-center surface-chip rounded-md p-1 bg-[#161616] border border-white/10 shadow-[var(--shadow-chip)]',
        className,
      )}
      animate={
        isThinking
          ? { scale: [1, 1.05, 1] }
          : isDone
            ? { scale: [1, 1.08, 1] }
            : { scale: 1 }
      }
      transition={{
        duration: isThinking ? 1.0 : 2.0,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    >
      <HardwareSvg viewBox="0 0 32 32">
        <rect x="2" y="2" width="28" height="28" rx="4" fill="#111111" stroke="#262626" strokeWidth="1" />
        <rect x="4" y="4" width="24" height="24" rx="2" fill="#141208" />

        {/* Heraldic Geometric Falcon Profile */}
        <path
          d="M16 7 C18 7 20 8.5 21 10 L25 11 L23 14 L26 16 L23 18 L21 23 L19 23 L19 21 C17.5 21.5 16 21.5 14.5 21 L14.5 23 L12.5 23 L11 18 L8 16 L11 14 L9 11 L13 10 C14 8.5 15 7 16 7 Z"
          fill="#ff3616"
          opacity="0.9"
        />
        {/* Eye of Horus / Focus Scanner */}
        <circle cx="18" cy="12" r="1.5" fill="#ffffff" />
        <circle cx="18" cy="12" r="3" stroke="#ff632a" strokeWidth="0.5" opacity="0.7" />
      </HardwareSvg>
    </motion.div>
  );
}

/**
 * Technical Dual-Screen Workstation Console
 */
export function TechnicalWorkstation({ isThinking }: { isThinking?: boolean }) {
  return (
    <div className="flex items-center gap-1 opacity-80">
      <div className="h-1.5 w-5 rounded-xs bg-[#1e293b] border border-white/5 relative overflow-hidden">
        <div className={cn('h-full bg-bull/60 rounded-xs transition-all', isThinking ? 'w-full animate-pulse' : 'w-3/4')} />
      </div>
      <span className="size-1 rounded-full bg-bull" />
    </div>
  );
}

/**
 * Macro News Workstation Console
 */
export function MacroWorkstation({ isThinking }: { isThinking?: boolean }) {
  return (
    <div className="flex items-center gap-1 opacity-80">
      <div className="h-1.5 w-5 rounded-xs bg-[#1c1917] border border-white/5 relative overflow-hidden">
        <div className={cn('h-full bg-info/60 rounded-xs transition-all', isThinking ? 'w-full animate-pulse' : 'w-2/3')} />
      </div>
      <span className="size-1 rounded-full bg-info" />
    </div>
  );
}

/**
 * Risk Workstation Console
 */
export function RiskWorkstation({ isThinking }: { isThinking?: boolean }) {
  return (
    <div className="flex items-center gap-1 opacity-80">
      <div className="h-1.5 w-5 rounded-xs bg-[#1e293b] border border-white/5 relative overflow-hidden">
        <div className={cn('h-full bg-bear/60 rounded-xs transition-all', isThinking ? 'w-full animate-pulse' : 'w-1/2')} />
      </div>
      <span className="size-1 rounded-full bg-bear" />
    </div>
  );
}

/**
 * Sentinel Workstation Console
 */
export function SentinelWorkstation({ isThinking }: { isThinking?: boolean }) {
  return (
    <div className="flex items-center gap-1 opacity-80">
      <div className="h-1.5 w-5 rounded-xs bg-[#1c1917] border border-white/5 relative overflow-hidden">
        <div className={cn('h-full bg-warn/60 rounded-xs transition-all', isThinking ? 'w-full animate-pulse' : 'w-4/5')} />
      </div>
      <span className="size-1 rounded-full bg-warn" />
    </div>
  );
}

/**
 * 🪵 TradingFloorDesk
 * Milled instrument chassis with sub-pixel specular highlight line
 * and Hoplite reactive ember underglow.
 */
export function TradingFloorDesk({
  consensusBias,
  isThinking: _isThinking,
}: {
  consensusBias?: 'bullish' | 'bearish' | 'neutral' | 'disputed';
  isThinking?: boolean;
}) {
  return (
    <div className="relative w-full">
      <div
        className={cn(
          'bg-bg-elev-2 relative h-3.5 w-full rounded-md border transition-all duration-300 shadow-[var(--shadow-housing)]',
          consensusBias === 'bullish'
            ? 'border-bull/40 shadow-[0_4px_16px_rgba(63,158,61,0.2)]'
            : consensusBias === 'bearish'
              ? 'border-bear/40 shadow-[0_4px_16px_rgba(224,44,16,0.2)]'
              : consensusBias === 'disputed'
                ? 'border-warn/40 shadow-[0_4px_16px_rgba(217,143,0,0.2)]'
                : 'border-border/80 shadow-md',
        )}
      >
        <div className="absolute inset-x-0 top-0 h-[1px] bg-white/10" />
        <div
          className={cn(
            'absolute inset-x-0 -bottom-1 h-1 transition-all duration-300 blur-[2px]',
            consensusBias === 'bullish'
              ? 'bg-bull/30'
              : consensusBias === 'bearish'
                ? 'bg-bear/30'
                : consensusBias === 'disputed'
                  ? 'bg-warn/30'
                  : 'bg-brand/20',
          )}
        />
      </div>
    </div>
  );
}

export function RetroCrtMonitor({ isThinking }: { isThinking?: boolean }) {
  return <TechnicalWorkstation isThinking={isThinking} />;
}
