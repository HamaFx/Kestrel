// SPDX-License-Identifier: Apache-2.0

// SVG body for the profit/loss curve. Kept separate from the interaction
// shell so the visual grammar stays small and the state logic stays readable.
import { m } from 'motion/react';

import { CHART_Y_BOTTOM, CHART_Y_TOP, type ProfitLossGeometry } from './chart-geometry';

export function ProfitLossSvg({
  rawId,
  geometry,
  values,
  ceilingValues,
  selectionStart,
  selectionEnd,
  selectionWidth,
  safeHover,
}: {
  rawId: string;
  geometry: ProfitLossGeometry;
  values: readonly number[];
  ceilingValues?: readonly number[] | undefined;
  selectionStart: number | null;
  selectionEnd: number | null;
  selectionWidth: number;
  safeHover: number | null;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`${rawId}-above`}>
          <rect x="0" y="0" width="100" height={geometry.baselineY} />
        </clipPath>
        <clipPath id={`${rawId}-below`}>
          <rect x="0" y={geometry.baselineY} width="100" height={100 - geometry.baselineY} />
        </clipPath>
        <linearGradient
          id={`${rawId}-positive`}
          x1="0"
          y1={CHART_Y_TOP}
          x2="0"
          y2={geometry.baselineY}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="var(--chart-positive)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--chart-positive)" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient
          id={`${rawId}-negative`}
          x1="0"
          y1={geometry.baselineY}
          x2="0"
          y2={CHART_Y_BOTTOM}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="var(--chart-negative)" stopOpacity="0.02" />
          <stop offset="100%" stopColor="var(--chart-negative)" stopOpacity="0.28" />
        </linearGradient>
      </defs>

      {geometry.ticks.map((tick) => (
        <line
          key={`grid-${tick}`}
          x1="0"
          x2="100"
          y1={geometry.yFor(tick)}
          y2={geometry.yFor(tick)}
          stroke="var(--chart-grid)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {geometry.shade ? (
        <path d={geometry.shade} fill="var(--chart-negative)" fillOpacity={0.1} stroke="none" />
      ) : null}

      <m.path
        d={geometry.area}
        fill={`url(#${rawId}-positive)`}
        clipPath={`url(#${rawId}-above)`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />
      <m.path
        d={geometry.area}
        fill={`url(#${rawId}-negative)`}
        clipPath={`url(#${rawId}-below)`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />

      <line
        x1="0"
        x2="100"
        y1={geometry.baselineY}
        y2={geometry.baselineY}
        stroke="var(--color-fg-subtle)"
        strokeOpacity={0.45}
        strokeDasharray="2 4"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />

      <m.path
        d={geometry.line}
        fill="none"
        stroke="var(--chart-positive)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        clipPath={`url(#${rawId}-above)`}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: [0.32, 0.72, 0, 1] }}
      />
      <m.path
        d={geometry.line}
        fill="none"
        stroke="var(--chart-negative)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        clipPath={`url(#${rawId}-below)`}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: [0.32, 0.72, 0, 1] }}
      />

      {ceilingValues?.length === values.length ? (
        <path
          d={ceilingValues
            .map(
              (value, index) =>
                `${index === 0 ? 'M' : 'L'} ${geometry.xFor(index).toFixed(2)} ${geometry.yFor(value).toFixed(2)}`,
            )
            .join(' ')}
          fill="none"
          stroke="var(--color-fg-subtle)"
          strokeOpacity={0.45}
          strokeDasharray="3 3"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}

      {selectionStart !== null && selectionEnd !== null ? (
        <>
          <rect
            x={geometry.xFor(selectionStart)}
            y="0"
            width={selectionWidth}
            height="100"
            fill="var(--chart-line-primary)"
            fillOpacity={0.08}
          />
          {[selectionStart, selectionEnd].map((index) => (
            <line
              key={`selection-${index}`}
              x1={geometry.xFor(index)}
              x2={geometry.xFor(index)}
              y1="0"
              y2="100"
              stroke="var(--chart-line-primary)"
              strokeOpacity={0.6}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </>
      ) : null}

      {safeHover !== null ? (
        <line
          x1={geometry.xFor(safeHover)}
          x2={geometry.xFor(safeHover)}
          y1="0"
          y2="100"
          stroke="var(--color-fg-subtle)"
          strokeOpacity={0.55}
          strokeWidth="1"
          strokeDasharray="2 2"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );
}
