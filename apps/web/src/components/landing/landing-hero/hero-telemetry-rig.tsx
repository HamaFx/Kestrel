'use client';

// SPDX-License-Identifier: Apache-2.0

// Right column of the landing hero: a sleek, symbol-free Kinetic AI Vision
// & Target-Lock Motion Canvas showing a live laser scan locking onto a
// Liquidity Sweep, setting an automatic 1% Stop-Loss shield, and projecting
// a 3-tier Take-Profit trajectory cone.
import { IconBellRinging, IconCamera, IconShieldCheck } from '@tabler/icons-react';
import { m } from 'motion/react';

import { cn } from '@/lib/formatters/cn';

import { HERO_HIGHLIGHTS } from './telemetry';

const CANDLES = [
  { x: 28, high: 142, low: 184, open: 152, close: 174, bull: false },
  { x: 56, high: 154, low: 196, open: 174, close: 188, bull: false },
  { x: 84, high: 162, low: 212, open: 188, close: 168, bull: true },
  { x: 112, high: 138, low: 178, open: 168, close: 146, bull: true },
  { x: 140, high: 124, low: 164, open: 146, close: 154, bull: false },
  { x: 168, high: 116, low: 158, open: 154, close: 124, bull: true },
  { x: 196, high: 94, low: 136, open: 124, close: 102, bull: true },
  { x: 224, high: 82, low: 118, open: 102, close: 88, bull: true },
] as const;

export function HeroTelemetryRig() {
  return (
    <div className="relative lg:col-span-6">
      <div className="surface-panel relative z-10 overflow-hidden rounded-3xl border border-white/15 bg-[#121315]/95 p-5 shadow-[0_28px_72px_-16px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.12)] sm:p-6">
        {/* Ambient Forge Glow & Emerald Target Wash */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 -right-16 size-56 rounded-full bg-[#ff3616]/18 blur-3xl select-none"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-20 -left-16 size-56 rounded-full bg-[#3f9e3d]/12 blur-3xl select-none"
        />

        {/* Top Floating Vision Bar */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="bg-brand flex size-6 items-center justify-center rounded-lg text-white shadow-[0_0_12px_rgba(255,54,22,0.5)]">
              <IconCamera className="size-3.5" />
            </span>
            <div>
              <span className="text-fg block font-mono text-xs font-bold tracking-wider uppercase">
                AI VISION & TARGET LOCK
              </span>
              <span className="text-fg-subtle block font-sans text-[11px]">
                Scans structure, locks 1% risk & arms phone alerts automatically
              </span>
            </div>
          </div>

          <span className="border-bull/40 bg-bull/15 text-bull inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] font-bold">
            <span className="bg-bull size-1.5 rounded-full shadow-[0_0_6px_#3f9e3d]" />1 : 3.5
            REWARD / RISK
          </span>
        </div>

        {/* Masterpiece SVG Kinetic Chart Vision & Target Cone Canvas */}
        <div className="surface-well relative my-4 overflow-hidden rounded-2xl border border-white/10 bg-[#08090b] p-3 sm:p-4">
          <svg
            viewBox="0 0 440 228"
            className="h-[220px] w-full overflow-visible sm:h-[236px]"
            aria-label="Animated AI chart vision locking onto a breakout setup with 1% stop-loss protection and 3 take-profit targets"
          >
            <defs>
              <linearGradient id="hero-vision-beam" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="rgba(255,54,22,0)" />
                <stop offset="50%" stopColor="rgba(255,54,22,0.18)" />
                <stop offset="100%" stopColor="rgba(255,54,22,0)" />
              </linearGradient>
              <linearGradient id="hero-tp-zone" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#3f9e3d" stopOpacity="0.06" />
                <stop offset="100%" stopColor="#3f9e3d" stopOpacity="0.28" />
              </linearGradient>
              <linearGradient id="hero-sl-zone" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#f03e3e" stopOpacity="0.06" />
                <stop offset="100%" stopColor="#f03e3e" stopOpacity="0.24" />
              </linearGradient>
              <linearGradient id="hero-curve-glow" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#ff3616" />
                <stop offset="55%" stopColor="#ff632a" />
                <stop offset="100%" stopColor="#3f9e3d" />
              </linearGradient>
            </defs>

            {/* Subtle Perspective Grid */}
            {[42, 88, 134, 180].map((y) => (
              <line
                key={y}
                x1="12"
                y1={y}
                x2="428"
                y2={y}
                stroke="rgba(255,255,255,0.05)"
                strokeDasharray="3 4"
              />
            ))}

            {/* Animated AI Vision Laser Scan Sweep */}
            <m.rect
              x="0"
              y="12"
              width="76"
              height="204"
              fill="url(#hero-vision-beam)"
              initial={{ x: -76 }}
              animate={{ x: 440 }}
              transition={{ duration: 3.4, repeat: Infinity, ease: 'linear' }}
            />

            {/* Reward Projection Zone (Entry → TP3) */}
            <m.polygon
              points="224,88 416,24 416,88"
              fill="url(#hero-tp-zone)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.25 }}
            />

            {/* 1% Stop-Loss Protection Shield Zone (Entry → SL) */}
            <m.polygon
              points="224,88 416,136 416,88"
              fill="url(#hero-sl-zone)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            />

            {/* Candlesticks */}
            {CANDLES.map((c, idx) => {
              const top = Math.min(c.open, c.close);
              const bodyH = Math.max(6, Math.abs(c.close - c.open));
              const fill = c.bull ? '#3f9e3d' : '#f03e3e';
              return (
                <m.g
                  key={c.x}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: idx * 0.05 }}
                >
                  <line x1={c.x} y1={c.high} x2={c.x} y2={c.low} stroke={fill} strokeWidth="1.5" />
                  <rect
                    x={c.x - 6}
                    y={top}
                    width="12"
                    height={bodyH}
                    rx="2"
                    fill={fill}
                    fillOpacity={c.bull ? '0.9' : '0.75'}
                  />
                </m.g>
              );
            })}

            {/* Liquidity Sweep Reticle on Candle 3 */}
            <m.circle
              cx="84"
              cy="204"
              r="14"
              fill="none"
              stroke="#ff3616"
              strokeWidth="1.25"
              strokeDasharray="3 2"
              initial={{ scale: 0.8, opacity: 0.4 }}
              animate={{ scale: [0.9, 1.2, 0.9], opacity: [0.4, 0.95, 0.4] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            />
            <circle cx="84" cy="204" r="3.5" fill="#ff3616" />
            <rect
              x="22"
              y="194"
              width="124"
              height="18"
              rx="4"
              fill="#141518"
              stroke="rgba(255,54,22,0.45)"
              strokeWidth="1"
            />
            <text
              x="84"
              y="206"
              textAnchor="middle"
              fill="#ff632a"
              className="font-mono text-[8.5px] font-bold"
            >
              LIQUIDITY SWEEP DETECTED
            </text>

            {/* Projected AI Trajectory Curve (Sweep → Entry → TP1 → TP2 → TP3) */}
            <path
              d="M 84 204 C 128 192, 176 124, 224 88 C 276 54, 344 38, 416 24"
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="2"
              strokeDasharray="4 4"
            />
            <m.path
              d="M 84 204 C 128 192, 176 124, 224 88 C 276 54, 344 38, 416 24"
              fill="none"
              stroke="url(#hero-curve-glow)"
              strokeWidth="2.75"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.1, ease: 'easeOut' }}
            />
            <path
              d="M 224 88 C 276 54, 344 38, 416 24"
              fill="none"
              stroke="#3f9e3d"
              strokeWidth="2.5"
              className="usecase-trace-pulse"
            />

            {/* Target & Stop Horizontal Guide Lines */}
            <line
              x1="224"
              y1="24"
              x2="416"
              y2="24"
              stroke="#3f9e3d"
              strokeWidth="1.25"
              strokeDasharray="3 3"
            />
            <line
              x1="224"
              y1="56"
              x2="416"
              y2="56"
              stroke="rgba(63,158,61,0.55)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <line
              x1="224"
              y1="88"
              x2="416"
              y2="88"
              stroke="rgba(255,255,255,0.35)"
              strokeWidth="1.25"
            />
            <line
              x1="224"
              y1="136"
              x2="416"
              y2="136"
              stroke="#f03e3e"
              strokeWidth="1.25"
              strokeDasharray="3 3"
            />

            {/* Live Entry Lock Beacon */}
            <circle cx="224" cy="88" r="10" fill="rgba(255,54,22,0.22)" />
            <circle cx="224" cy="88" r="4.5" fill="#ff3616" stroke="#ffffff" strokeWidth="1.5" />

            {/* Right-Side Level Callout Badges */}
            <g>
              <rect
                x="306"
                y="13"
                width="116"
                height="20"
                rx="5"
                fill="#0d1911"
                stroke="rgba(63,158,61,0.55)"
              />
              <text
                x="364"
                y="26"
                textAnchor="middle"
                fill="#3f9e3d"
                className="font-mono text-[9px] font-bold"
              >
                TP2 RUNNER · +3.5R
              </text>

              <rect
                x="306"
                y="45"
                width="116"
                height="20"
                rx="5"
                fill="#0d1911"
                stroke="rgba(63,158,61,0.35)"
              />
              <text
                x="364"
                y="58"
                textAnchor="middle"
                fill="#3f9e3d"
                className="font-mono text-[9px] font-bold"
              >
                TP1 LOCK IN · +1.5R
              </text>

              <rect
                x="306"
                y="78"
                width="116"
                height="20"
                rx="5"
                fill="#17181c"
                stroke="rgba(255,255,255,0.25)"
              />
              <text
                x="364"
                y="91"
                textAnchor="middle"
                fill="#ffffff"
                className="font-mono text-[9px] font-bold"
              >
                OPTIMAL ENTRY ZONE
              </text>

              <rect
                x="306"
                y="126"
                width="116"
                height="20"
                rx="5"
                fill="#1c1012"
                stroke="rgba(240,62,62,0.5)"
              />
              <text
                x="364"
                y="139"
                textAnchor="middle"
                fill="#f03e3e"
                className="font-mono text-[9px] font-bold"
              >
                1% MAX RISK SHIELD
              </text>
            </g>
          </svg>
        </div>

        {/* Bottom 3-Card Superpower Strip (Simple, Scannable, Zero Clutter) */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {HERO_HIGHLIGHTS.map((item) => (
            <div
              key={item.badge}
              className="surface-well flex flex-col justify-between gap-1 rounded-xl border border-white/[0.07] bg-[#0c0d0f] p-3"
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    'font-mono text-[9px] font-bold tracking-wider uppercase',
                    item.tone === 'brand'
                      ? 'text-brand'
                      : item.tone === 'bull'
                        ? 'text-bull'
                        : 'text-info',
                  )}
                >
                  {item.badge}
                </span>
                {item.tone === 'brand' ? (
                  <IconCamera className="text-brand size-3.5" />
                ) : item.tone === 'bull' ? (
                  <IconShieldCheck className="text-bull size-3.5" />
                ) : (
                  <IconBellRinging className="text-info size-3.5" />
                )}
              </div>
              <span className="text-fg font-display text-sm font-normal">{item.title}</span>
              <span className="text-fg-muted font-sans text-[11px] leading-tight">
                {item.detail}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
