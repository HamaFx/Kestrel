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
import { IconAlertTriangle, IconLoader2, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import type { AgentRunView, AgentView } from '../schemas';
import { errorMessage, fmtDate, pluginFetch } from './api';

export function AgentRunsDialog({ agent, onClose }: { agent: AgentView; onClose: () => void }) {
  const [runs, setRuns] = useState<AgentRunView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Escape closes the run history dialog.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    pluginFetch<{ runs: AgentRunView[] }>(`/agents/${encodeURIComponent(agent.id)}/runs?limit=30`)
      .then((data) => {
        if (!cancelled) setRuns(data.runs);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [agent.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-runs-title"
        className="bg-bg-elev-1 border-border flex max-h-[85svh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border shadow-2xl"
      >
        <header className="border-border/60 flex items-start justify-between gap-3 border-b px-4 py-3">
          <div>
            <h2 id="agent-runs-title" className="text-fg text-sm font-semibold">
              @{agent.slug} runs
            </h2>
            <p className="text-fg-subtle text-[11px]">
              Last 30 standalone turns · {agent.runCount} total
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close run history"
            className="text-fg-subtle hover:text-fg inline-flex size-8 items-center justify-center rounded-md"
          >
            <IconX className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {error ? (
            <div className="border-danger/30 bg-danger/5 text-danger flex items-start gap-2 rounded-md border p-2.5 text-[11px]">
              <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : !runs ? (
            <div className="text-fg-subtle flex items-center gap-2 text-xs">
              <IconLoader2 className="text-brand size-3.5 animate-spin" />
              Loading runs…
            </div>
          ) : runs.length === 0 ? (
            <p className="text-fg-subtle text-xs">No runs recorded yet.</p>
          ) : (
            <table className="w-full border-collapse text-left text-[11px]">
              <thead className="text-fg-subtle text-[10px] uppercase">
                <tr className="border-border/60 border-b">
                  <th className="py-1.5 pr-2 font-semibold">When</th>
                  <th className="py-1.5 pr-2 font-semibold">Status</th>
                  <th className="py-1.5 pr-2 font-semibold">Model</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">Latency</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">Cost</th>
                  <th className="py-1.5 text-right font-semibold">Tools</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-border/40 border-b align-top">
                    <td className="text-fg-muted py-1.5 pr-2 whitespace-nowrap">
                      {fmtDate(run.createdAt)}
                    </td>
                    <td className="py-1.5 pr-2">
                      <span
                        className={
                          run.status === 'succeeded'
                            ? 'text-bull'
                            : run.status === 'cancelled'
                              ? 'text-fg-subtle'
                              : 'text-danger'
                        }
                      >
                        {run.status}
                      </span>
                      {run.error ? (
                        <span className="text-danger block max-w-56 truncate text-[10px]">
                          {run.error}
                        </span>
                      ) : null}
                    </td>
                    <td className="text-fg-subtle max-w-40 truncate py-1.5 pr-2 font-mono">
                      {run.model ?? 'chat model'}
                    </td>
                    <td className="text-fg-muted py-1.5 pr-2 text-right tabular-nums">
                      {(run.latencyMs / 1000).toFixed(1)}s
                    </td>
                    <td className="text-fg-muted py-1.5 pr-2 text-right tabular-nums">
                      ${run.costUsd.toFixed(4)}
                    </td>
                    <td className="text-fg-muted py-1.5 text-right tabular-nums">
                      {run.toolCalls}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
