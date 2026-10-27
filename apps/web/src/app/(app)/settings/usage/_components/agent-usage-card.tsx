// SPDX-License-Identifier: Apache-2.0

// Specialist-desk activity for the current month: per-desk and per-mode
// breakdowns of committee opinions, shown on the usage page.

export function AgentUsageCard({
  rows,
}: {
  rows: Array<{ agentName: string; analysisMode: string; costUsd: number; latencyMs: number }>;
}) {
  const byAgent = new Map<string, { turns: number; avgMs: number }>();
  for (const r of rows) {
    const existing = byAgent.get(r.agentName) ?? { turns: 0, avgMs: 0 };
    existing.turns += 1;
    existing.avgMs += Number(r.latencyMs);
    byAgent.set(r.agentName, existing);
  }
  const agentRows = [...byAgent.entries()]
    .map(([name, v]) => ({
      name,
      turns: v.turns,
      avgMs: Math.round(v.avgMs / v.turns),
    }))
    .sort((a, b) => b.turns - a.turns);

  const byMode = new Map<string, { turns: number }>();
  for (const r of rows) {
    const existing = byMode.get(r.analysisMode) ?? { turns: 0 };
    existing.turns += 1;
    byMode.set(r.analysisMode, existing);
  }
  const modeRows = [...byMode.entries()].map(([mode, v]) => ({
    mode:
      mode === 'full'
        ? 'Convene Council (4 Desks)'
        : mode === 'single'
          ? 'Fast Scout (1 Desk)'
          : mode,
    turns: v.turns,
  }));

  const AGENT_LABELS: Record<string, string> = {
    technical: 'Technical Desk',
    fundamental: 'Macro & Fundamental Desk',
    risk: 'Risk Guardrail Desk',
    sentiment: 'Sentiment & COT Desk',
    decision: 'Committee Synthesis',
  };

  return (
    <section
      aria-labelledby="agent-usage-heading"
      className="surface-panel flex flex-col gap-4 rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]"
    >
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <h2 id="agent-usage-heading" className="text-fg text-sm font-semibold tracking-tight">
          Specialist Desk Activity (This Month)
        </h2>
        <span className="surface-chip text-fg-subtle rounded-md px-2 py-0.5 font-mono text-[11px] font-medium uppercase">
          4-Desk Committee
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-fg-subtle font-mono text-[11px] font-semibold tracking-wider uppercase">
          By Specialist Desk
        </h3>
        <ul className="flex flex-col gap-1.5">
          {agentRows.map((r) => (
            <li
              key={r.name}
              className="surface-well flex items-center justify-between rounded-xl border border-white/5 p-2.5 text-xs tabular-nums"
            >
              <span className="text-fg font-medium">{AGENT_LABELS[r.name] ?? r.name}</span>
              <span className="text-fg-subtle font-mono text-[11px]">
                {r.turns} {r.turns === 1 ? 'report' : 'reports'} · {Math.round(r.avgMs / 100) / 10}s
                avg
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-fg-subtle font-mono text-[11px] font-semibold tracking-wider uppercase">
          By Analysis Mode
        </h3>
        <ul className="flex flex-col gap-1.5">
          {modeRows.map((r) => (
            <li
              key={r.mode}
              className="surface-well flex items-center justify-between rounded-xl border border-white/5 p-2.5 text-xs tabular-nums"
            >
              <span className="text-fg font-medium">{r.mode}</span>
              <span className="text-fg-subtle font-mono text-[11px]">
                {r.turns} {r.turns === 1 ? 'run' : 'runs'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
