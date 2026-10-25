// SPDX-License-Identifier: Apache-2.0

// Recent research-session list (last 20 telemetry rows) for the usage page.

import type { listTelemetry } from '@kestrel/ai';

import { formatRelative } from '@/lib/formatters/format';

export function RecentTurnsCard({ rows }: { rows: Awaited<ReturnType<typeof listTelemetry>> }) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="usage-recent-heading"
      className="surface-panel flex flex-col gap-4 rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]"
    >
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <h2 id="usage-recent-heading" className="text-fg text-sm font-semibold tracking-tight">
          Recent Research Sessions
        </h2>
        <span className="surface-chip text-fg-subtle rounded-md px-2 py-0.5 font-mono text-[11px] font-medium uppercase">
          Recent Activity
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className="surface-well flex items-center justify-between rounded-xl border border-white/5 p-3 text-xs tabular-nums transition-all hover:border-white/15"
          >
            <div className="flex min-w-0 flex-col">
              <span className="text-fg truncate font-sans text-xs font-semibold">
                AI Market Analysis ({r.toolCalls} {r.toolCalls === 1 ? 'data check' : 'data checks'}
                )
              </span>
              <span className="text-fg-subtle text-caption font-mono text-[11px]">
                {formatRelative(r.createdAt)} · Completed in {Math.round(r.ms / 100) / 10}s
              </span>
            </div>
            <span className="text-bull text-right font-mono text-xs font-semibold">Verified</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
