'use client';

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

// Bespoke renderer for the `get_system_diagnostics` tool part.
// Renders an elegant diagnostic dashboard displaying copilot operational stats.
import {
  IconActivity,
  IconAlertTriangle,
  IconCircleCheck,
  IconCpu,
  IconDatabase,
  IconWallet,
} from '@tabler/icons-react';

import type { ToolPartProps } from './registry';

export function GetSystemDiagnosticsPart({
  output,
  state,
  errorMessage,
}: ToolPartProps<'get_system_diagnostics'>) {
  if (state === 'error') {
    return <ErrorCard message={errorMessage} />;
  }
  if (state === 'loading' || !output) {
    return <SkeletonCard />;
  }

  const { status, database, worker, budget, envCheck, narrative, asOf } = output;

  // Status mapping
  let statusColor = 'text-fg';
  let statusBg = 'bg-bg-elev-3';
  let StatusIcon = IconActivity;

  if (status === 'healthy') {
    statusColor = 'text-success';
    statusBg = 'bg-success/10';
    StatusIcon = IconCircleCheck;
  } else if (status === 'degraded') {
    statusColor = 'text-warn';
    statusBg = 'bg-warn/10';
    StatusIcon = IconAlertTriangle;
  } else if (status === 'unhealthy') {
    statusColor = 'text-danger';
    statusBg = 'bg-danger/10';
    StatusIcon = IconAlertTriangle;
  }

  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-4 rounded-sm border p-4 shadow-md">
      {/* Header */}
      <header className="border-divider flex items-center justify-between border-b pb-2">
        <div className="flex flex-col">
          <span className="text-fg-subtle text-caption font-bold tracking-wider uppercase">
            Copilot Diagnostic Node
          </span>
          <h3 className="text-fg mt-0.5 text-sm font-bold">System Telemetry & Health</h3>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-sm px-2.5 py-0.5 text-xs font-bold ${statusBg} ${statusColor}`}
        >
          <StatusIcon className="size-3" />
          {status.toUpperCase()}
        </span>
      </header>

      {/* Latency & Spend Highlights */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-bg-elev-2/50 border-border/25 flex flex-col items-center justify-center rounded-sm border p-2">
          <IconDatabase className="text-fg-subtle mb-1 size-4" />
          <span className="text-fg-subtle text-xs font-medium uppercase">DB Latency</span>
          <span className="text-fg mt-0.5 text-xs font-extrabold tabular-nums">
            {database.latencyMs >= 0 ? `${database.latencyMs}ms` : 'offline'}
          </span>
        </div>
        <div className="bg-bg-elev-2/50 border-border/25 flex flex-col items-center justify-center rounded-sm border p-2">
          <IconWallet className="text-fg-subtle mb-1 size-4" />
          <span className="text-fg-subtle text-xs font-medium uppercase">AI Spend Today</span>
          <span className="text-fg mt-0.5 text-xs font-extrabold tabular-nums">
            ${budget.spentUsd.toFixed(2)}
          </span>
        </div>
        <div className="bg-bg-elev-2/50 border-border/25 flex flex-col items-center justify-center rounded-sm border p-2">
          <IconCpu className="text-fg-subtle mb-1 size-4" />
          <span className="text-fg-subtle text-xs font-medium uppercase">Vector Memory</span>
          <span className="text-fg mt-0.5 text-xs font-extrabold tabular-nums">
            {database.memoryEmbeddingsCount} nodes
          </span>
        </div>
      </div>

      {/* IconDatabase Record Volumes */}
      <div className="flex flex-col gap-2">
        <h4 className="text-fg-subtle text-xs font-bold tracking-wider uppercase">
          Database Segment Volumes
        </h4>
        <div className="border-divider/50 text-caption grid grid-cols-2 gap-2 border-t pt-2">
          <div className="flex justify-between py-0.5">
            <span className="text-fg-muted">Journal Entries:</span>
            <span className="text-fg font-medium tabular-nums">{database.journalEntriesCount}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-fg-muted">Market Closes:</span>
            <span className="text-fg font-medium tabular-nums">{database.snapshotsCount}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-fg-muted">Briefings Archive:</span>
            <span className="text-fg font-medium tabular-nums">{database.briefingsCount}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-fg-muted">Intermarket Resonance:</span>
            <span className="text-fg font-medium tabular-nums">{database.resonanceCount}</span>
          </div>
        </div>
      </div>

      {/* Environment Config Checks */}
      <div className="flex flex-col gap-2">
        <h4 className="text-fg-subtle text-xs font-bold tracking-wider uppercase">
          Environment Integrations
        </h4>
        <div className="border-divider/50 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t pt-2 text-xs">
          {Object.entries(envCheck).map(([key, configured]) => (
            <div key={key} className="flex items-center justify-between py-0.5">
              <span className="text-fg-muted font-mono">{key}</span>
              <span
                className={`rounded-sm px-1.5 py-0.5 font-bold ${configured ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}
              >
                {configured ? 'OK' : 'MISSING'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Background Jobs Sync Log */}
      <div className="flex flex-col gap-2">
        <h4 className="text-fg-subtle text-xs font-bold tracking-wider uppercase">
          Background Sync Status
        </h4>
        <div className="border-divider/50 text-caption flex flex-col gap-1 border-t pt-2">
          <div className="flex justify-between py-0.5">
            <span className="text-fg-muted">FRED Opportunity Cost Sync:</span>
            <span className="text-fg font-semibold tabular-nums">
              {worker.resonanceSyncLastRun
                ? `Active (${worker.resonanceSyncLastRun})`
                : 'Pending execution'}
            </span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-fg-muted">COT Report Sync:</span>
            <span className="text-fg font-semibold tabular-nums">
              {worker.cotSyncLastRun ? `Active (${worker.cotSyncLastRun})` : 'Pending execution'}
            </span>
          </div>
        </div>
      </div>

      <p className="text-fg-muted text-body-sm border-divider/50 border-t pt-2.5 leading-normal">
        {narrative}
      </p>
      <footer className="text-fg-subtle mt-[-4px] text-right text-xs">
        Diagnostic probe run at: {new Date(asOf).toLocaleTimeString()}
      </footer>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      className="border-border bg-bg-elev-1 rounded-sm border p-4 shadow-md"
      aria-busy="true"
      aria-label="Querying Diagnostics"
    >
      <div className="flex items-center justify-between">
        <div className="flex w-2/3 flex-col gap-1">
          <div className="bg-bg-elev-2 h-3 w-1/3 animate-pulse rounded-sm" />
          <div className="bg-bg-elev-2 mt-1 h-4 w-2/3 animate-pulse rounded-sm" />
        </div>
        <div className="bg-bg-elev-2 h-5 w-20 animate-pulse rounded-sm" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-bg-elev-2 h-12 animate-pulse rounded-sm" />
        ))}
      </div>
      <div className="bg-bg-elev-2 mt-4 h-16 w-full animate-pulse rounded-sm" />
    </div>
  );
}

function ErrorCard({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-danger/30 bg-bg-elev-1 text-danger rounded-sm border p-4 text-sm font-semibold"
    >
      Operational diagnostics probe failed {message ? ` · ${message}` : ''}
    </div>
  );
}
