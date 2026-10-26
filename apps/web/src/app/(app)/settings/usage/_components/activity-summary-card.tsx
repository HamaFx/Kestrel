// SPDX-License-Identifier: Apache-2.0

// Research-session summary card: today / 7-day / 30-day turn counts and
// the 30-day credit total shown at the top of the usage page.

import type { UsageStats } from '@kestrel/ai';

export function ActivitySummaryCard({ stats }: { stats: UsageStats }) {
  const todayTurns = stats.daily7[stats.daily7.length - 1]?.turns ?? 0;
  const sevenDayTurns = stats.daily7.reduce((sum, d) => sum + d.turns, 0);

  return (
    <section
      aria-labelledby="usage-summary-heading"
      className="surface-panel flex flex-col gap-4 rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]"
    >
      <header className="flex items-center justify-between border-b border-white/5 pb-3">
        <div>
          <h2 id="usage-summary-heading" className="text-fg text-sm font-semibold tracking-tight">
            Research Session Summary
          </h2>
          <p className="text-fg-subtle text-xs">Your BYOK vault &amp; local spend guardrails</p>
        </div>
        <span className="surface-chip bg-bull/10 text-bull border-bull/30 rounded-md border px-2 py-0.5 font-mono text-xs font-semibold uppercase">
          Self-Hosted
        </span>
      </header>

      <dl className="surface-well grid grid-cols-2 gap-3 rounded-xl border border-white/5 p-3.5 text-xs tabular-nums shadow-inner sm:grid-cols-4">
        <Stat label="Today" value={`${todayTurns} ${todayTurns === 1 ? 'analysis' : 'analyses'}`} />
        <Stat
          label="Last 7 Days"
          value={`${sevenDayTurns} ${sevenDayTurns === 1 ? 'session' : 'sessions'}`}
        />
        <Stat
          label="Last 30 Days"
          value={`${stats.thirtyDayTurns} ${stats.thirtyDayTurns === 1 ? 'session' : 'sessions'}`}
        />
        <Stat label="30d Credits" value={stats.thirtyDayCredits.toLocaleString()} />
      </dl>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <dt className="text-fg-subtle font-mono text-[11px] tracking-wider uppercase">{label}</dt>
      <dd className="text-fg font-mono text-sm font-bold">{value}</dd>
    </div>
  );
}
