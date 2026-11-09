// SPDX-License-Identifier: Apache-2.0

// Compact 24-hour Astrolabe session dial: Tokyo / Asia, London and New York
// arcs in UTC, with a bezel-anchored "now" hand and an unobstructed session
// readout in the recessed centre well.
const SESSIONS = [
  {
    id: 'asia',
    label: 'Tokyo / Asia',
    short: 'ASIA',
    start: 0,
    end: 9,
    radius: 39,
    tone: 'var(--color-info)',
  },
  {
    id: 'london',
    label: 'London',
    short: 'LON',
    start: 7,
    end: 16,
    radius: 32,
    tone: 'var(--chart-line-primary)',
  },
  {
    id: 'ny',
    label: 'New York',
    short: 'NY',
    start: 12,
    end: 21,
    radius: 25,
    tone: 'var(--color-bull)',
  },
] as const;

function pointOnCircle(angleDegrees: number, radius: number): readonly [number, number] {
  const radians = ((angleDegrees - 90) * Math.PI) / 180;
  return [50 + radius * Math.cos(radians), 50 + radius * Math.sin(radians)];
}

function arcPath(startHour: number, endHour: number, radius: number): string {
  const [x1, y1] = pointOnCircle(startHour * 15, radius);
  const [x2, y2] = pointOnCircle(endHour * 15, radius);
  const spanHours = (endHour - startHour + 24) % 24 || 24;
  const largeArc = spanHours > 12 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function isHourInSession(hour: number, start: number, end: number): boolean {
  if (start <= end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

function shortLabel(label: string): string {
  if (label === 'Asian') return 'ASIA';
  if (label === 'London') return 'LON';
  if (label === 'NY') return 'NY';
  if (label === 'Weekend') return 'WKND';
  return 'QUIET';
}

export function SessionDial({
  now,
  label,
  active,
  size = 56,
}: {
  now: number;
  label: string;
  active: boolean;
  size?: number;
}) {
  const date = new Date(now);
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  const nowAngle = (hour + minute / 60) * 15;
  const [handStartX, handStartY] = pointOnCircle(nowAngle, 18);
  const [handX, handY] = pointOnCircle(nowAngle, 44);

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`24-hour session clock. ${label} session ${active ? 'active' : 'closed'}. Tokyo 00-09, London 07-16, New York 12-21 UTC.`}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
        {[0, 3, 6, 9, 12, 15, 18, 21].map((tick) => {
          const isCardinal = tick % 6 === 0;
          const [x1, y1] = pointOnCircle(tick * 15, isCardinal ? 45 : 46.5);
          const [x2, y2] = pointOnCircle(tick * 15, 49);
          return (
            <line
              key={tick}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--chart-grid)"
              strokeWidth={isCardinal ? '1.5' : '1'}
            />
          );
        })}

        {SESSIONS.map((session) => {
          const sessionActive = active && isHourInSession(hour, session.start, session.end);
          return (
            <g key={session.id}>
              <circle
                cx="50"
                cy="50"
                r={session.radius}
                fill="none"
                stroke="var(--chart-grid)"
                strokeWidth="3.5"
                strokeOpacity="0.55"
              />
              <path
                d={arcPath(session.start, session.end, session.radius)}
                fill="none"
                stroke={session.tone}
                strokeWidth="4.2"
                strokeLinecap="round"
                strokeOpacity={sessionActive ? 0.95 : 0.28}
              />
            </g>
          );
        })}

        {/* Bezel-anchored pointer hand (stops at the inner well ring so it never pierces the label) */}
        <line
          x1={handStartX}
          y1={handStartY}
          x2={handX}
          y2={handY}
          stroke="var(--chart-line-primary)"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <circle cx={handX} cy={handY} r="2.1" fill="var(--chart-line-primary)" />

        {/* Recessed centre well for the session readout */}
        <circle
          cx="50"
          cy="50"
          r="18"
          fill="#0d0e10"
          stroke={active ? 'rgba(255, 54, 22, 0.35)' : 'var(--chart-grid)'}
          strokeWidth="1.2"
        />
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-fg font-mono text-[9px] leading-none font-bold tracking-wider">
          {shortLabel(label)}
        </span>
      </div>
    </div>
  );
}
