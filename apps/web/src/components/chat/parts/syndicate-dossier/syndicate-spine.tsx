'use client';

// SPDX-License-Identifier: Apache-2.0

// The 5-stage Hoplite plasma circuit trace (adapted from
// `landing-stepper/circuit-spine.tsx`): inactive background trace, illuminated
// `#ff3616 → #e5a93c` gradient fill, glowing runner bead, and node rings.
import { m } from 'motion/react';

export function SyndicateSpine({ activeIndex, count }: { activeIndex: number; count: number }) {
  const span = 432;
  const nodeYs = Array.from({ length: count }, (_, i) => 24 + (span / Math.max(1, count - 1)) * i);
  const activeY = nodeYs[Math.min(activeIndex, count - 1)] ?? 24;

  return (
    <svg
      viewBox="0 0 32 480"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="h-full w-8 overflow-visible"
    >
      <defs>
        <linearGradient id="syndicate-wire-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff3616" />
          <stop offset="50%" stopColor="#ff632a" />
          <stop offset="100%" stopColor="#e5a93c" />
        </linearGradient>
        <filter id="syndicate-glow-bead" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <path
        d="M 16 12 L 16 468"
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <m.path
        d="M 16 12 L 16 468"
        fill="none"
        stroke="url(#syndicate-wire-gradient)"
        strokeWidth="2.5"
        strokeLinecap="round"
        animate={{ pathLength: Math.max(0.02, (activeIndex + 1) / count) }}
        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
      />
      <m.circle
        cx="16"
        r="4"
        fill="#ffffff"
        stroke="#ff3616"
        strokeWidth="3"
        filter="url(#syndicate-glow-bead)"
        animate={{ cy: activeY }}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      />

      {nodeYs.map((y, idx) => (
        <g key={y}>
          <circle
            cx="16"
            cy={y}
            r="6"
            fill="#0c0d0e"
            stroke={
              idx === activeIndex
                ? '#ff3616'
                : idx < activeIndex
                  ? '#3f9e3d'
                  : 'rgba(255,255,255,0.15)'
            }
            strokeWidth="1.5"
          />
          {idx === activeIndex ? (
            <circle
              cx="16"
              cy={y}
              r="10"
              fill="none"
              stroke="#ff3616"
              strokeWidth="1"
              opacity="0.4"
              className="animate-ping"
            />
          ) : null}
        </g>
      ))}
    </svg>
  );
}
