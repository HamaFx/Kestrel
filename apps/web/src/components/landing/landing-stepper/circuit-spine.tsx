'use client';

// SPDX-License-Identifier: Apache-2.0

// Continuous mathematical SVG circuit spine for the landing stepper: inactive
// background trace, illuminated active fill, glowing runner bead, node rings.
import { m } from 'motion/react';

// Coordinates for the 4 step nodes along the continuous circuit spine
// Nodes at y = 55, 175, 295, 415
export const nodeYCoordinates = [55, 175, 295, 415];

interface CircuitSpineProps {
  activeStep: number;
  activeY: number;
  progressRatio: number;
}

export function CircuitSpine({ activeStep, activeY, progressRatio }: CircuitSpineProps) {
  return (
    <div className="pointer-events-none absolute top-2 bottom-2 left-2 -z-0 w-8 select-none sm:left-4">
      <svg viewBox="0 0 32 480" preserveAspectRatio="none" className="size-full overflow-visible">
        <defs>
          <linearGradient id="circuit-wire-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff3616" />
            <stop offset="50%" stopColor="#ff632a" />
            <stop offset="100%" stopColor="#e5a93c" />
          </linearGradient>
          <filter id="glow-bead" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Layer 1: Background Inactive Circuit Trace */}
        <path
          d="M 16 20 L 16 460"
          fill="none"
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Layer 2: Illuminated Active Fill Trace */}
        <m.path
          d="M 16 20 L 16 460"
          fill="none"
          stroke="url(#circuit-wire-gradient)"
          strokeWidth="2.5"
          strokeLinecap="round"
          animate={{
            pathLength: Math.max(0.01, progressRatio),
          }}
          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
        />

        {/* Layer 3: High-Intensity Glowing Runner Bead */}
        <m.circle
          cx="16"
          r="4"
          fill="#ffffff"
          stroke="#ff3616"
          strokeWidth="3"
          filter="url(#glow-bead)"
          animate={{
            cy: activeY,
          }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        />

        {/* Concentric Step Node Rings */}
        {nodeYCoordinates.map((ny, idx) => {
          const isNodeActive = idx + 1 === activeStep;
          const isNodePassed = idx + 1 < activeStep;
          return (
            <g key={idx}>
              <circle
                cx="16"
                cy={ny}
                r="6"
                fill="#0c0d0e"
                stroke={
                  isNodeActive ? '#ff3616' : isNodePassed ? '#3f9e3d' : 'rgba(255,255,255,0.15)'
                }
                strokeWidth="1.5"
              />
              {isNodeActive && (
                <circle
                  cx="16"
                  cy={ny}
                  r="10"
                  fill="none"
                  stroke="#ff3616"
                  strokeWidth="1"
                  opacity="0.4"
                  className="animate-ping"
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
