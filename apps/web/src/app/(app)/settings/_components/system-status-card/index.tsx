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

// System status card — high-density "everything wired" overview so the
// user can see at a glance whether each notification channel is ready
// without diving into the test buttons. Server component; reads env vars
// directly + counts push subscriptions.

import { describeMarketPhase, getMarketPhase } from '@kestrel/shared';
import { IconAlertCircle } from '@tabler/icons-react';

import { cn } from '@/lib/formatters/cn';

import { buildStatuses } from './status-data';
import { ChannelRow, CronHealthRow, MarketPhaseRow } from './status-rows';

export async function SystemStatusCard({ userId }: { userId: string }) {
  const { channels, databaseConnected, stuckJobs, recentErrors } = await buildStatuses(userId);
  const allReady = channels.every((c) => c.ready) && databaseConnected;

  // F6 — Current market phase for the system status card.
  const marketPhase = getMarketPhase();
  const marketPhaseDescription = describeMarketPhase(marketPhase);

  return (
    <section
      aria-labelledby="system-status-heading"
      className="surface-panel relative flex flex-col gap-4 overflow-hidden rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]"
    >
      <header className="flex items-center justify-between gap-3">
        <h2
          id="system-status-heading"
          className="text-fg-subtle text-[11px] font-semibold tracking-wider uppercase"
        >
          System status
        </h2>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-[11px] font-bold tracking-wide uppercase ring-1',
            allReady
              ? 'bg-success/10 text-success ring-success/30'
              : 'bg-warn/10 text-warn ring-warn/30',
          )}
        >
          {allReady ? (
            <>
              <span aria-hidden className="bg-success size-1.5 rounded-full" />
              All systems
            </>
          ) : (
            <>
              <IconAlertCircle className="size-3" />
              Some channels off
            </>
          )}
        </span>
      </header>

      <ul className="flex flex-col gap-2.5">
        {channels.map((c) => (
          <ChannelRow key={c.label} channel={c} />
        ))}
      </ul>

      {/* Cron job health — OBS-04 */}
      <CronHealthRow stuckJobs={stuckJobs} recentErrors={recentErrors} />

      {/* F6 — Market phase detection */}
      <MarketPhaseRow marketPhase={marketPhase} description={marketPhaseDescription} />
    </section>
  );
}
