// SPDX-License-Identifier: Apache-2.0

// Machined semicircle gauge for a 0–100 budget. The arc, percent and label
// share one tone so the same primitive can show an SLO error budget, a daily
// spend watch or a risk cap.
import { cn } from '@/lib/formatters/cn';

type RingTone = 'success' | 'warn' | 'danger' | 'brand';

const TONE_CLASS: Record<RingTone, string> = {
  success: 'text-success',
  warn: 'text-warn',
  danger: 'text-danger',
  brand: 'text-brand',
};

const RADIUS = 38;
const CENTER = 50;
const TRACK = `M ${CENTER - RADIUS} ${CENTER} A ${RADIUS} ${RADIUS} 0 0 1 ${CENTER + RADIUS} ${CENTER}`;

function pointOnArc(angle: number, radius: number): readonly [number, number] {
  const radians = (angle * Math.PI) / 180;
  return [CENTER + radius * Math.cos(radians), CENTER + radius * Math.sin(radians)];
}

export function RingGauge({
  value,
  size = 88,
  tone = 'brand',
  label,
  showLabel = true,
  className,
}: {
  /** 0–100. Values outside the range are clamped. */
  value: number;
  size?: number;
  tone?: RingTone;
  label?: string;
  showLabel?: boolean;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const endAngle = 180 + (pct / 100) * 180;
  const [endX, endY] = pointOnArc(endAngle, RADIUS);
  const progress =
    pct > 0
      ? `M ${CENTER - RADIUS} ${CENTER} A ${RADIUS} ${RADIUS} 0 0 1 ${endX.toFixed(2)} ${endY.toFixed(2)}`
      : null;

  return (
    <div
      role="img"
      aria-label={`${label ?? 'Gauge'}: ${Math.round(pct)}%`}
      className={cn('inline-flex shrink-0 flex-col items-center', TONE_CLASS[tone], className)}
      style={{ width: size }}
    >
      <svg
        viewBox="0 0 100 58"
        width={size}
        height={size * 0.58}
        className="overflow-visible"
        aria-hidden="true"
      >
        {[180, 225, 270, 315, 360].map((angle) => {
          const [x1, y1] = pointOnArc(angle, 43.5);
          const [x2, y2] = pointOnArc(angle, 46);
          return (
            <line
              key={angle}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--chart-grid)"
              strokeWidth="1.2"
            />
          );
        })}
        <path
          d={TRACK}
          fill="none"
          stroke="var(--chart-grid)"
          strokeWidth="6.5"
          strokeLinecap="round"
        />
        {progress ? (
          <path
            d={progress}
            fill="none"
            stroke="currentColor"
            strokeWidth="6.5"
            strokeLinecap="round"
          />
        ) : null}
        <text
          x="50"
          y="45"
          textAnchor="middle"
          fill="currentColor"
          fontFamily="var(--font-mono)"
          fontSize="15"
          fontWeight="700"
        >
          {Math.round(pct)}%
        </text>
        {showLabel && label ? (
          <text
            x="50"
            y="55"
            textAnchor="middle"
            fill="var(--color-fg-subtle)"
            fontFamily="var(--font-mono)"
            fontSize="6"
            letterSpacing="0.5"
          >
            {label.toUpperCase()}
          </text>
        ) : null}
      </svg>
    </div>
  );
}
