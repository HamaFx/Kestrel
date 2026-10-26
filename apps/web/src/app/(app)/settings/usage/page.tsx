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

import { BYOK_PROVIDERS_LIST, computeUsage, listTelemetry } from '@kestrel/ai';
import {
  getUserWithSettings,
  listMtdAgentOpinions,
  requireTenantIdForUser,
  withTenantDbRO,
} from '@kestrel/db';
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
import { UsageLimitsForm } from './_components/usage-limits-form';

export const metadata: Metadata = {
  title: 'Activity & Quota · Settings',
  description:
    'Track your AI research sessions, specialist desk usage, spend guardrails, and recent analyses.',
};
export const revalidate = 60;

export default async function UsagePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const startOfMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

  const tenantId = await requireTenantIdForUser(session.user.id);
  const [[stats, recent, agentOpinionRows], { settings }] = await Promise.all([
    withTenantDbRO(tenantId, () =>
      Promise.all([
        computeUsage(session.user.id),
        listTelemetry(session.user.id, 20),
        listMtdAgentOpinions(session.user.id, startOfMonth),
      ]),
    ),
    getUserWithSettings(session.user.id),
  ]);

  // Budget guardrails are personal (never inherited from the platform admin),
  // so the form is pre-populated from the user's own settings row.
  const thresholds = settings?.providerSpendingThresholds ?? {};
  const spendByProvider = new Map<string, number>();
  for (const p of stats.byProvider) {
    if (p.byokProviderId) spendByProvider.set(p.byokProviderId, p.costUsd);
  }
  const providerSpend = Array.from(new Set([...spendByProvider.keys(), ...Object.keys(thresholds)]))
    .map((id) => ({
      id,
      displayName: BYOK_PROVIDERS_LIST.find((p) => p.id === id)?.displayName ?? id,
      currentSpend: spendByProvider.get(id) ?? 0,
      threshold: thresholds[id] ?? null,
    }))
    .sort((a, b) => b.currentSpend - a.currentSpend);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-fg text-lg font-semibold tracking-tight">Activity & Quota</h2>
        <p className="text-fg-subtle text-sm">
          Track your AI research sessions, 4-desk committee runs, and recent analyses.
        </p>
      </div>

      <ActivitySummaryCard stats={stats} />

      <UsageLimitsForm
        initialMonthlyLimit={settings?.monthlyBudgetLimit ?? null}
        initialAlertConfig={settings?.spendAlertsConfig ?? {}}
        providers={providerSpend}
      />

      {stats.thirtyDayTurns === 0 ? (
        <EmptyState
          icon={<IconChartBar className="size-6" />}
          title="No research sessions yet"
          description="Start a conversation with your AI Committee to see your activity history here."
          action={
            <Link
              href="/chat"
              className="bg-brand inline-flex h-10 items-center rounded-md px-3 text-sm font-medium text-white transition-[filter] hover:brightness-110"
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
