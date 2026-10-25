// SPDX-License-Identifier: Apache-2.0

// Daily research activity bar list for the last 7 days, as shown on the
// usage page.

import type { DayBucket } from '@kestrel/ai';

export function DailyActivityChart({ daily7 }: { daily7: DayBucket[] }) {
  const activeDays = daily7.filter((d) => d.turns > 0);
  if (activeDays.length === 0) {
    return null;
  }
  const max = Math.max(1, ...activeDays.map((d) => d.turns));

  return (
    <section
      aria-labelledby="usage-daily-heading"
      className="surface-panel flex flex-col gap-4 rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]"
    >
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <h2 id="usage-daily-heading" className="text-fg text-sm font-semibold tracking-tight">
          Daily Research Activity (Last 7 Days)
        </h2>
        <span className="surface-chip text-fg-subtle rounded-md px-2 py-0.5 font-mono text-[11px] font-medium uppercase">
          7-Day History
        </span>
      </div>
      <ul className="flex flex-col gap-2.5">
        {activeDays.map((d) => {
          const pct = Math.max(4, (d.turns / max) * 100);
          return (
            <li
              key={d.date}
              className="text-body-sm grid grid-cols-[auto_1fr_auto] items-center gap-3 text-xs"
            >
              <span className="text-fg-subtle w-14 font-mono text-xs tabular-nums">
                {shortDate(d.date)}
              </span>
              <div
                role="progressbar"
                aria-valuenow={Math.round(pct)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${d.turns} analyses`}
                className="surface-well h-2 overflow-hidden rounded-full border border-white/5"
              >
                <div
                  className="bg-brand h-full rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-fg-muted w-24 text-right font-mono text-xs font-medium tabular-nums">
                {d.turns} {d.turns === 1 ? 'analysis' : 'analyses'}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
}
