'use client';

// SPDX-License-Identifier: Apache-2.0

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

// Diagnostic Trace Explorer shell: wires the filter, explorer and detail hooks
// to the timeline table and the trace-detail drawer.
import { useRouter, useSearchParams } from 'next/navigation';

import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { SkeletonCard } from '@/components/ui/skeleton';

import { AdminErrorBlock } from '../admin-error-block';
import { TraceDetailDrawer } from './trace-detail-drawer';
import { TraceEventsTable } from './trace-events-table';
import { exportTimelineCsv } from './trace-export';
import { TraceFiltersBar } from './trace-filters-bar';
import { TraceStatsGrid } from './trace-stats-grid';
import { useTraceDetail } from './use-trace-detail';
import { useTraceExplorer } from './use-trace-explorer';
import { useTraceFilters } from './use-trace-filters';

export function AdminDiagnosticTraces() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const traceIdFromUrl = searchParams.get('trace') ?? searchParams.get('traceId');
  const query = {
    traceId: searchParams.get('traceId') ?? undefined,
    runId: searchParams.get('runId') ?? undefined,
    jobId: searchParams.get('jobId') ?? undefined,
    threadId: searchParams.get('threadId') ?? undefined,
    messageId: searchParams.get('messageId') ?? undefined,
  };

  const { filters, setFilters, submitSearch, clearSearch, openEvent, closeTrace } = useTraceFilters(
    router,
    query,
  );
  const { events, stats, loading, error, fetchExplorer } = useTraceExplorer(query);
  const { detail, detailEvents, detailLoading, detailError } = useTraceDetail(traceIdFromUrl);

  if (loading && events.length === 0) return <SkeletonCard lines={5} />;

  if (error && events.length === 0) {
    return (
      <SettingsSection title="Trace Explorer" description="Searchable AI execution timelines.">
        <AdminErrorBlock message={error} onRetry={() => void fetchExplorer(filters)} />
      </SettingsSection>
    );
  }

  return (
    <>
      <SettingsSection
        title="Trace Explorer"
        description="Search routing, agents, tools, budgets, persistence, and terminal status by correlation ID."
      >
        <TraceFiltersBar
          filters={filters}
          setFilters={setFilters}
          onSubmit={submitSearch}
          onClear={clearSearch}
          onRefresh={() => void fetchExplorer(filters)}
          onExport={() => exportTimelineCsv(events)}
          showExport={events.length > 0}
        />

        {error && (
          <div
            className="border-warn/25 bg-warn/5 text-warn rounded-sm border px-3 py-2 text-xs"
            role="status"
          >
            Refresh failed; showing the last successful timeline.
          </div>
        )}

        <TraceStatsGrid stats={stats} />
        <TraceEventsTable events={events} onOpen={openEvent} />
      </SettingsSection>

      <TraceDetailDrawer
        open={!!traceIdFromUrl}
        onClose={closeTrace}
        loading={detailLoading}
        error={detailError}
        detail={detail}
        events={detailEvents}
      />
    </>
  );
}
