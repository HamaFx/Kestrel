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

import { computeUsage } from '@kestrel/ai';
import { IconChevronRight } from '@tabler/icons-react';
import { Link } from 'next-view-transitions';

export async function UsageGlance({ userId }: { userId?: string }) {
  if (!userId) return null;

  let stats: Awaited<ReturnType<typeof computeUsage>> | null = null;
  try {
    stats = await computeUsage(userId);
  } catch {
    return null;
  }

  const todayTurns = stats.daily7[stats.daily7.length - 1]?.turns ?? 0;
  const sevenDayTurns = stats.daily7.reduce((sum, d) => sum + d.turns, 0);

  return (
    <Link
      href="/settings/usage"
      aria-label="Open activity and quota breakdown"
      className="surface-panel group hover:border-brand/30 hover:bg-bg-elev-2/60 tactile-press flex flex-col gap-3 rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)] transition-all active:translate-y-[0.5px]"
    >
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="text-fg-subtle text-[11px] font-semibold tracking-wider uppercase">
          Research Activity & Plan Status
        </h2>
        <span className="surface-chip bg-bull/10 text-bull border-bull/30 rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase">
          4-Desk Committee Active
        </span>
      </header>

      <dl className="grid grid-cols-3 gap-3 text-xs tabular-nums">
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

      <div className="text-fg-muted flex items-center justify-between gap-2 border-t border-white/5 pt-1 text-xs font-medium">
        <span>View specialist desk activity</span>
        <IconChevronRight className="text-fg-subtle size-4 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-fg-subtle text-caption tracking-wide uppercase">{label}</dt>
      <dd className="text-fg font-semibold">{value}</dd>
    </div>
  );
}
