// SPDX-License-Identifier: Apache-2.0

// Compact 24-hour Astrolabe session dial: Tokyo / Asia, London and New York
// arcs in UTC, with a "now" hand and a session label in the centre. The three
// rings keep overlapping sessions legible in a 56px cell.
const SESSIONS = [
  {
    id: 'asia',
    label: 'Tokyo / Asia',
    short: 'ASIA',
    start: 0,
    end: 9,
    radius: 38,
    tone: 'var(--color-info)',
  },
  {
    id: 'london',
    label: 'London',
    short: 'LON',
    start: 7,
    end: 16,
    radius: 31,
    tone: 'var(--chart-line-primary)',
  },
  {
    id: 'ny',
    label: 'New York',
    short: 'NY',
    start: 12,
    end: 21,
    radius: 24,
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
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function shortLabel(label: string): string {
  if (label === 'Asian') return 'ASIA';
  if (label === 'London') return 'LON';
  if (label === 'NY') return 'NY';
  if (label === 'Weekend') return 'WKND';
  return '—';
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
  const [handX, handY] = pointOnCircle(nowAngle, 44);

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`24-hour session clock. ${label} session ${active ? 'active' : 'closed'}. Tokyo 00-09, London 07-16, New York 12-21 UTC.`}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
        {[0, 6, 12, 18].map((tick) => {
          const [x1, y1] = pointOnCircle(tick * 15, 46);
          const [x2, y2] = pointOnCircle(tick * 15, 49);
          return (
            <line
              key={tick}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--chart-grid)"
              strokeWidth="1.5"
            />
          );
        })}

        {SESSIONS.map((session) => {
          const sessionActive = active && hour >= session.start && hour < session.end;
          return (
            <path
              key={session.id}
              d={arcPath(session.start, session.end, session.radius)}
              fill="none"
              stroke={session.tone}
              strokeWidth="5"
              strokeLinecap="round"
              strokeOpacity={sessionActive ? 0.9 : 0.25}
            />
          );
        })}

        <line
          x1="50"
          y1="50"
          x2={handX}
          y2={handY}
          stroke="var(--chart-line-primary)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle
          cx="50"
          cy="50"
          r="17"
          fill="var(--color-bg-elev-1)"
          stroke="var(--chart-grid)"
          strokeWidth="1"
        />
        <circle
          cx="50"
          cy="50"
          r="2.2"
          fill={active ? 'var(--color-brand)' : 'var(--color-fg-subtle)'}
        />
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-fg font-mono text-[8px] font-bold tracking-wide">
          {shortLabel(label)}
        </span>
      </div>
    </div>
  );
}
