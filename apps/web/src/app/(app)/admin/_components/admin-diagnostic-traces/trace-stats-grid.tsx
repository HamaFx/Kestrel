'use client';

// SPDX-License-Identifier: Apache-2.0

// Four-tile summary of the currently loaded explorer result set.
import type { TraceExplorerResponse } from '@/lib/services/admin-dtos';

export function TraceStatsGrid({ stats }: { stats: TraceExplorerResponse['stats'] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div className="border-border rounded-sm border p-3">
        <p className="text-fg-subtle text-xs">Events</p>
        <p className="text-fg text-xl font-semibold tabular-nums">{stats.total}</p>
      </div>
      <div className="border-border rounded-sm border p-3">
        <p className="text-fg-subtle text-xs">Failures</p>
        <p className="text-danger text-xl font-semibold tabular-nums">{stats.failures}</p>
      </div>
      <div className="border-border rounded-sm border p-3">
        <p className="text-fg-subtle text-xs">Agents</p>
        <p className="text-fg text-xl font-semibold tabular-nums">{stats.bySource.agent ?? 0}</p>
      </div>
      <div className="border-border rounded-sm border p-3">
        <p className="text-fg-subtle text-xs">Tools</p>
        <p className="text-fg text-xl font-semibold tabular-nums">{stats.bySource.tool ?? 0}</p>
      </div>
    </div>
  );
}
