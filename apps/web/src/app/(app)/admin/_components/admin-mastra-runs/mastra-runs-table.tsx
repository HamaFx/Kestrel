'use client';

// SPDX-License-Identifier: Apache-2.0

// Mastra run list: one row per run (provider, cost, failing stage, grounding)
// plus the window summary footer.
import { IconExternalLink, IconStethoscope } from '@tabler/icons-react';

import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import {
  formatAbsoluteTime,
  formatNumber,
  formatRelativeTime,
} from '@/lib/formatters/format-number';

import { runFailureDetail, runStatusLabel, runTone } from './mastra-runs-format';
import type { MastraRun } from './mastra-runs-types';

function MastraRunRow({ run }: { run: MastraRun }) {
  return (
    <tr className="border-border border-t">
      <td className="px-4 py-2">
        <div className="text-fg font-mono text-xs" title={run.runId}>
          {run.runId.slice(0, 12)}…
        </div>
        {run.langfuseUrl && (
          <a
            href={run.langfuseUrl}
            target="_blank"
            rel="noreferrer"
            className="text-brand mt-0.5 inline-flex items-center gap-1 text-xs"
          >
            Langfuse <IconExternalLink className="size-3" aria-hidden="true" />
          </a>
        )}
      </td>
      <td className="text-fg-subtle px-4 py-2">{run.kind ?? '—'}</td>
      <td className="text-fg-subtle px-4 py-2">
        <div>{run.model}</div>
        <div className="text-fg-subtle/70 text-xs">{run.provider}</div>
      </td>
      <td className="px-4 py-2">
        <Badge tone={runTone(run)}>{runStatusLabel(run)}</Badge>
        {runTone(run) === 'danger' && runFailureDetail(run) && (
          <div
            className="text-danger mt-0.5 max-w-72 truncate text-xs"
            title={runFailureDetail(run) ?? undefined}
          >
            {runFailureDetail(run)}
          </div>
        )}
      </td>
      <td className="text-fg-subtle px-4 py-2">
        {run.workflow.workflowId
          ? `${run.workflow.completedSteps}/${run.workflow.totalSteps}`
          : '—'}
      </td>
      <td className="px-4 py-2">
        {run.scores.length > 0 ? (
          <div className="flex flex-col gap-1">
            <Badge tone={run.scoreMean !== null && run.scoreMean >= 0.8 ? 'success' : 'warn'}>
              {run.scoreMean !== null ? formatNumber(run.scoreMean) : '—'}
            </Badge>
            <span className="text-fg-subtle text-xs">
              {run.scores.map((score) => score.scorerId).join(', ')}
            </span>
          </div>
        ) : (
          <span className="text-fg-subtle">—</span>
        )}
      </td>
      <td className="text-fg-subtle px-4 py-2">${run.estCostUsd.toFixed(4)}</td>
      <td className="text-fg-subtle px-4 py-2">{formatNumber(run.ms)} ms</td>
      <td className="text-fg-subtle px-4 py-2">
        <span title={formatAbsoluteTime(run.createdAt)}>{formatRelativeTime(run.createdAt)}</span>
      </td>
    </tr>
  );
}

export function MastraRunsTable({ runs }: { runs: MastraRun[] }) {
  return (
    <>
      <div className="border-border overflow-hidden overflow-x-auto rounded-sm border">
        <table className="w-full text-sm">
          <thead className="bg-bg-elev-2 text-fg-subtle">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Run</th>
              <th className="px-4 py-2 text-left font-medium">Kind</th>
              <th className="px-4 py-2 text-left font-medium">Model</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2 text-left font-medium">Steps</th>
              <th className="px-4 py-2 text-left font-medium">Scores</th>
              <th className="px-4 py-2 text-left font-medium">Cost</th>
              <th className="px-4 py-2 text-left font-medium">Latency</th>
              <th className="px-4 py-2 text-left font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-6">
                  <EmptyState
                    icon={<IconStethoscope className="size-6" />}
                    title="No Mastra runs found"
                    description="Runs with a runId recorded in telemetry will appear here."
                    bare
                  />
                </td>
              </tr>
            ) : (
              runs.map((run) => <MastraRunRow key={run.runId} run={run} />)
            )}
          </tbody>
        </table>
      </div>
      {runs.length > 0 && (
        <p className="text-fg-subtle pt-2 text-xs">
          {runs.length} runs · {runs.filter((run) => run.scores.length > 0).length} scored ·{' '}
          {runs.filter((run) => runTone(run) === 'danger').length} failed
        </p>
      )}
    </>
  );
}
