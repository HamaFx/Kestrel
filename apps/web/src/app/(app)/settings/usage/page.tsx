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

import { computeUsage, listTelemetry } from '@kestrel/ai';
import { listMtdAgentOpinions, requireTenantIdForUser, withTenantDbRO } from '@kestrel/db';
import { IconChartBar } from '@tabler/icons-react';
import type { Metadata } from 'next';
import { Link } from 'next-view-transitions';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { EmptyState } from '@/components/ui/empty-state';

import { ActivitySummaryCard } from './_components/activity-summary-card';
import { AgentUsageCard } from './_components/agent-usage-card';
import { DailyActivityChart } from './_components/daily-activity-chart';
import { RecentTurnsCard } from './_components/recent-turns-card';

export const metadata: Metadata = {
  title: 'Activity & Quota · Settings',
  description: 'Track your AI research sessions, specialist desk usage, and recent analyses.',
};
export const revalidate = 60;

export default async function UsagePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const startOfMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

  const tenantId = await requireTenantIdForUser(session.user.id);
  const [stats, recent, agentOpinionRows] = await withTenantDbRO(tenantId, () =>
    Promise.all([
      computeUsage(session.user.id),
      listTelemetry(session.user.id, 20),
      listMtdAgentOpinions(session.user.id, startOfMonth),
    ]),
  );

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
