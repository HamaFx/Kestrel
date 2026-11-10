'use client';

// SPDX-License-Identifier: Apache-2.0

// Four-tile summary of the currently loaded explorer result set.
import { Kpi, KpiGroup, KpiLabel, KpiValue } from '@/components/ui/kpi';
import type { TraceExplorerResponse } from '@/lib/services/admin-dtos';

export function TraceStatsGrid({ stats }: { stats: TraceExplorerResponse['stats'] }) {
  return (
    <KpiGroup cols={4}>
      <Kpi>
        <KpiLabel>Events</KpiLabel>
        <KpiValue>{stats.total}</KpiValue>
      </Kpi>
      <Kpi>
        <KpiLabel>Failures</KpiLabel>
        <KpiValue tone={stats.failures > 0 ? 'bear' : 'bull'}>{stats.failures}</KpiValue>
      </Kpi>
      <Kpi>
        <KpiLabel>Agents</KpiLabel>
        <KpiValue>{stats.bySource.agent ?? 0}</KpiValue>
      </Kpi>
      <Kpi>
        <KpiLabel>Tools</KpiLabel>
        <KpiValue>{stats.bySource.tool ?? 0}</KpiValue>
      </Kpi>
    </KpiGroup>
  );
}
