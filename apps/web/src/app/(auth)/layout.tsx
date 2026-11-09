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

import { IconArrowLeft, IconLock } from '@tabler/icons-react';
import { Link } from 'next-view-transitions';
import type { ReactNode } from 'react';

import { BlueprintPlate } from '@/components/brand/blueprint-plates';
import { KestrelBrand } from '@/components/brand/kestrel-brand';

const ORBITAL_DESKS = [
  {
    code: '01 · MACRO',
    metric: 'US10Y 4.28% · DXY',
    cx: 280,
    cy: 52,
    boxX: 204,
    boxY: 16,
    trace: 'M 280 70 L 280 226',
    color: '#3f9e3d',
  },
  {
    code: '02 · TECHNICAL',
    metric: '4H SWEEP · EMA 50',
    cx: 508,
    cy: 280,
    boxX: 416,
    boxY: 244,
    trace: 'M 416 280 L 334 280',
    color: '#3f9e3d',
  },
  {
    code: '03 · RISK ≤ 1%',
    metric: '0.85% CAP · 1:3.2 R:R',
    cx: 280,
    cy: 508,
    boxX: 204,
    boxY: 492,
    trace: 'M 280 490 L 280 334',
    color: '#ff3616',
  },
  {
    code: '04 · COT FLOW',
    metric: '+18.4K NET LONG',
    cx: 52,
    cy: 280,
    boxX: 12,
    boxY: 244,
    trace: 'M 144 280 L 226 280',
    color: '#3f9e3d',
  },
] as const;

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-bg text-fg relative grid min-h-dvh lg:grid-cols-12">
      {/* Left 5-Column Credential Gateway */}
      <div className="relative z-10 flex flex-col justify-between border-white/[0.07] bg-[#0e0f11] px-6 py-8 sm:px-10 lg:col-span-5 lg:border-r lg:px-12 lg:py-10">
        <div className="relative z-10 flex items-center justify-between">
          <h1 className="sr-only">Kestrel</h1>
          <KestrelBrand variant="lockup" href="/" label="Kestrel" />
          <Link
            href="/"
            className="text-fg-muted hover:text-fg inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 font-mono text-xs transition-colors hover:border-white/15"
          >
            <IconArrowLeft className="size-3.5" aria-hidden="true" />
            <span>Back to Kestrel</span>
          </Link>
        </div>

        <div className="relative z-10 mx-auto my-10 w-full max-w-[400px]">{children}</div>

        <div className="text-fg-subtle relative z-10 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-4 font-mono text-[11px]">
          <span className="inline-flex items-center gap-1.5">
            <IconLock className="text-brand size-3.5" aria-hidden="true" />
            <span>AES-256-GCM BYOK Vault · Self-Hosted</span>
          </span>
          <span>PostgreSQL RLS · TOTP 2FA</span>
        </div>
      </div>

      {/* Right 7-Column Bayer-Dithered Monument & 1px SVG Astrolabe Schematic */}
      <div className="relative hidden overflow-hidden bg-[#121212] lg:col-span-7 lg:flex lg:flex-col lg:justify-between lg:p-10 xl:p-12">
        {/* Ambient Forge Ember Radial Illumination */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(640px circle at 54% 48%, rgba(255, 54, 22, 0.11), transparent 68%)',
          }}
        />

        {/* Full-Bleed Fine-Grain Bayer 4x4 Dithered Horus Sculpture */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 z-0 w-[92%] opacity-38 mix-blend-screen select-none"
        >
          <BlueprintPlate id="horus" variant="backdrop" className="h-full w-full" />
        </div>

        {/* Top Technical Plate Registration Bar */}
        <div className="relative z-10 flex items-center justify-between border-b border-white/[0.07] pb-4 font-mono text-[11px]">
          <div className="flex items-center gap-2.5">
            <span className="bg-bull size-2 rounded-full shadow-[0_0_8px_#3f9e3d]" />
            <span className="text-fg font-bold tracking-[0.14em] uppercase">
              PLATE 00 · 4-DESK ORBITAL ARBITER SCHEMATIC
            </span>
          </div>
          <span className="text-fg-subtle tracking-wider uppercase">
            BAYER 4×4 DITHER · 1:3.22 R:R
          </span>
        </div>

        {/* Centerpiece 1px SVG Astrolabe & 4-Desk Convergence Rig (Zero Text Cards) */}
        <div className="relative z-10 my-auto flex items-center justify-center py-4">
          <svg
            viewBox="0 0 560 560"
            className="h-auto w-full max-w-[500px] select-none"
            role="img"
            aria-label="Kestrel 4-desk orbital astrolabe schematic"
          >
            <defs>
              <radialGradient id="auth-astrolabe-core" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(255,54,22,0.24)" />
                <stop offset="65%" stopColor="rgba(255,54,22,0.04)" />
                <stop offset="100%" stopColor="rgba(18,18,18,0)" />
              </radialGradient>
            </defs>

            {/* Corner Registration Marks */}
            <text x="16" y="24" fill="rgba(255,255,255,0.28)" fontSize="12" className="font-mono">
              +
            </text>
            <text x="536" y="24" fill="rgba(255,255,255,0.28)" fontSize="12" className="font-mono">
              +
            </text>
            <text x="16" y="544" fill="rgba(255,255,255,0.28)" fontSize="12" className="font-mono">
              +
            </text>
            <text x="536" y="544" fill="rgba(255,255,255,0.28)" fontSize="12" className="font-mono">
              +
            </text>

            {/* Concentric Astrolabe Degree Rings */}
            <circle cx="280" cy="280" r="228" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
            <circle
              cx="280"
              cy="280"
              r="196"
              fill="none"
              stroke="rgba(255,255,255,0.11)"
              strokeWidth="1"
              strokeDasharray="2 6"
            />
            <circle
              cx="280"
              cy="280"
              r="146"
              fill="url(#auth-astrolabe-core)"
              stroke="rgba(255,54,22,0.24)"
              strokeWidth="1"
            />
            <circle
              cx="280"
              cy="280"
              r="96"
              fill="none"
              stroke="rgba(255,255,255,0.09)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />

            {/* Inscribed Harmonic Diamond & Diagonal Meridian Hairlines */}
            <polygon
              points="280,84 476,280 280,476 84,280"
              fill="none"
              stroke="rgba(255,255,255,0.07)"
              strokeWidth="1"
            />
            <line x1="120" y1="120" x2="440" y2="440" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            <line x1="440" y1="120" x2="120" y2="440" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />

            {/* Degree Caliper Callouts */}
            <text x="394" y="102" fill="rgba(255,255,255,0.32)" fontSize="8.5" className="font-mono">
              045° · LONDON
            </text>
            <text x="394" y="464" fill="rgba(255,255,255,0.32)" fontSize="8.5" className="font-mono">
              135° · NEW YORK
            </text>
            <text x="92" y="464" fill="rgba(255,255,255,0.32)" fontSize="8.5" className="font-mono">
              225° · TOKYO
            </text>
            <text x="92" y="102" fill="rgba(255,255,255,0.32)" fontSize="8.5" className="font-mono">
              315° · SYDNEY
            </text>

            {/* 4 Cardinal Desk Nodes + Converging Signal Traces */}
            {ORBITAL_DESKS.map((desk) => (
              <g key={desk.code}>
                <path
                  d={desk.trace}
                  fill="none"
                  stroke="rgba(255,54,22,0.55)"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />
                <rect
                  x={desk.boxX}
                  y={desk.boxY}
                  width="152"
                  height="52"
                  rx="8"
                  fill="rgba(16,18,21,0.92)"
                  stroke="rgba(255,255,255,0.14)"
                  strokeWidth="1"
                />
                <circle cx={desk.boxX + 16} cy={desk.boxY + 20} r="3.5" fill={desk.color} />
                <text
                  x={desk.boxX + 26}
                  y={desk.boxY + 23}
                  fill="#f3f2ee"
                  fontSize="10"
                  fontWeight="700"
                  className="font-mono"
                >
                  {desk.code}
                </text>
                <text
                  x={desk.boxX + 16}
                  y={desk.boxY + 40}
                  fill="rgba(255,255,255,0.55)"
                  fontSize="8.5"
                  className="font-mono"
                >
                  {desk.metric}
                </text>
              </g>
            ))}

            {/* Central 4/4 Verified Arbiter Core */}
            <g transform="translate(280, 280)">
              <circle r="54" fill="#121316" stroke="rgba(255,54,22,0.5)" strokeWidth="1.25" />
              <polygon
                points="0,-40 40,0 0,40 -40,0"
                fill="#191212"
                stroke="#ff3616"
                strokeWidth="1.75"
              />
              <text
                x="0"
                y="-6"
                textAnchor="middle"
                fill="#ff3616"
                fontSize="12"
                fontWeight="700"
                className="font-mono"
              >
                4 / 4
              </text>
              <text
                x="0"
                y="9"
                textAnchor="middle"
                fill="#f3f2ee"
                fontSize="8.5"
                fontWeight="700"
                className="font-mono"
              >
                VERIFIED
              </text>
              <text
                x="0"
                y="21"
                textAnchor="middle"
                fill="#3f9e3d"
                fontSize="7.5"
                fontWeight="700"
                className="font-mono"
              >
                91% ALIGNED
              </text>
            </g>
          </svg>
        </div>

        {/* Bottom Minimal Hardware Specification Strip */}
        <div className="relative z-10 flex items-center justify-between border-t border-white/[0.07] pt-4 font-mono text-[11px]">
          <span className="text-fg-subtle tracking-wider uppercase">
            XAU/USD · 11 FOREX · 6 CRYPTO
          </span>
          <span className="text-brand font-semibold tracking-wider uppercase">
            NON-CUSTODIAL BYOK RESEARCH TERMINAL
          </span>
        </div>
      </div>
    </div>
  );
}
