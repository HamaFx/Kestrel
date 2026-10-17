/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// SPDX-License-Identifier: Apache-2.0

import { computeUsage, listTelemetry, type DayBucket, type UsageStats } from '@kestrel/ai';
import { listMtdAgentOpinions } from '@kestrel/db';
import { IconChartBar } from '@tabler/icons-react';
import type { Metadata } from 'next';
import { Link } from 'next-view-transitions';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { EmptyState } from '@/components/ui/empty-state';
import { formatRelative } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Activity & Quota · Settings',
  description: 'Track your AI research sessions, specialist desk usage, and recent analyses.',
};
export const revalidate = 60;

export default async function UsagePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const startOfMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

  const [stats, recent, agentOpinionRows] = await Promise.all([
    computeUsage(session.user.id),
    listTelemetry(session.user.id, 20),
    listMtdAgentOpinions(session.user.id, startOfMonth),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-fg text-lg font-semibold tracking-tight">Activity & Quota</h2>
        <p className="text-fg-subtle text-sm">
          Track your AI research sessions, 4-desk committee runs, and recent analyses.
        </p>
      </div>

      <ActivitySummaryCard stats={stats} />

      {stats.thirtyDayTurns === 0 ? (
        <EmptyState
          icon={<IconChartBar className="size-6" />}
          title="No research sessions yet"
          description="Start a conversation with your AI Committee to see your activity history here."
          action={
            <Link
              href="/chat"
              className="bg-fg inline-flex h-10 items-center rounded-sm px-3 text-sm font-medium text-black hover:opacity-90"
            >
              Open AI Chat
            </Link>
          }
        />
      ) : (
        <>
          <DailyActivityChart daily7={stats.daily7} />
          {agentOpinionRows.length > 0 && <AgentUsageCard rows={agentOpinionRows} />}
          <RecentTurnsCard rows={recent} />
        </>
      )}
    </div>
  );
}

function ActivitySummaryCard({ stats }: { stats: UsageStats }) {
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
          <p className="text-fg-subtle text-xs">Included in your Kestrel subscription</p>
        </div>
        <span className="surface-chip bg-bull/10 text-bull border-bull/30 rounded-md border px-2 py-0.5 font-mono text-xs font-semibold uppercase">
          Active Plan
        </span>
      </header>

      <dl className="surface-well grid grid-cols-3 gap-3 rounded-xl border border-white/5 p-3.5 text-xs tabular-nums shadow-inner">
        <Stat label="Today" value={`${todayTurns} ${todayTurns === 1 ? 'analysis' : 'analyses'}`} />
        <Stat
          label="Last 7 Days"
          value={`${sevenDayTurns} ${sevenDayTurns === 1 ? 'session' : 'sessions'}`}
        />
        <Stat
          label="Last 30 Days"
          value={`${stats.thirtyDayTurns} ${stats.thirtyDayTurns === 1 ? 'session' : 'sessions'}`}
        />
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

function DailyActivityChart({ daily7 }: { daily7: DayBucket[] }) {
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

function RecentTurnsCard({ rows }: { rows: Awaited<ReturnType<typeof listTelemetry>> }) {
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

function AgentUsageCard({
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
        ? 'Full Committee (4 Desks)'
        : mode === 'single'
          ? 'Quick Read (1 Desk)'
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
