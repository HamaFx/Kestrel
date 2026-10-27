'use client';

// SPDX-License-Identifier: Apache-2.0

// Per-prompt results table for the AI eval sweep.
import { IconCheck, IconLoader2, IconX } from '@tabler/icons-react';

import type { EvalRow } from './eval-runner';

export function EvalResultsTable({ rows }: { rows: EvalRow[] }) {
  return (
    <div className="border-border mt-4 overflow-x-auto rounded-sm border">
      <table className="table-stack w-full min-w-[640px] text-sm">
        <thead className="bg-bg-elev-2 text-fg-subtle">
          <tr>
            <th className="px-3 py-2 text-left">Case</th>
            <th className="px-3 py-2 text-left">Prompt</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-left">Time</th>
            <th className="px-3 py-2 text-left">Chars</th>
            <th className="px-3 py-2 text-left">Detail</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="row-primary border-border border-t">
              <td className="text-fg-subtle px-3 py-2 font-mono text-xs">{row.id}</td>
              <td data-label="Prompt" className="text-fg-subtle px-3 py-2 text-xs">
                {row.prompt}
              </td>
              <td data-label="Status" className="px-3 py-2">
                {row.status === 'ok' ? (
                  <span className="text-bull inline-flex items-center gap-1 text-xs font-semibold">
                    <IconCheck className="size-3.5" aria-hidden="true" /> ok
                  </span>
                ) : row.status === 'failed' ? (
                  <span className="text-danger inline-flex items-center gap-1 text-xs font-semibold">
                    <IconX className="size-3.5" aria-hidden="true" /> failed
                  </span>
                ) : row.status === 'running' ? (
                  <span className="text-fg-subtle inline-flex items-center gap-1 text-xs font-semibold">
                    <IconLoader2 className="size-3.5 animate-spin" aria-hidden="true" /> running…
                  </span>
                ) : (
                  <span className="text-fg-subtle text-xs">pending</span>
                )}
              </td>
              <td data-label="Time" className="text-fg-subtle px-3 py-2 text-xs tabular-nums">
                {row.totalMs === undefined ? '—' : `${Math.round(row.totalMs / 1000)}s`}
              </td>
              <td data-label="Chars" className="text-fg-subtle px-3 py-2 text-xs tabular-nums">
                {row.chars === undefined ? '—' : row.chars}
              </td>
              <td data-label="Detail" className="text-fg-subtle px-3 py-2 text-xs">
                {row.error ?? (row.status === 'ok' ? 'Mastra report generated' : '')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
