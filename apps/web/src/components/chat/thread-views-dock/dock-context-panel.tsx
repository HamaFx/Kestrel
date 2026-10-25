'use client';

// SPDX-License-Identifier: Apache-2.0

// Context tab: session metadata, live analysis status, and the chart link.
import type { Symbol, Timeframe } from '@kestrel/shared';
import { Link } from 'next-view-transitions';

import type { AgentProgress } from '@/lib/chat-transport';

export function DockContextPanel({
  symbol,
  activeTf,
  agentProgress,
}: {
  symbol: Symbol;
  activeTf: Timeframe;
  agentProgress?: AgentProgress | null;
}) {
  return (
    <div className="scrollbar-hide h-full overflow-y-auto p-4 font-mono text-xs">
      <div className="border-border bg-bg-elev-1 rounded-xl border p-4">
        <div className="border-border/70 text-fg-subtle mb-3 flex items-center justify-between border-b pb-2.5 text-xs">
          <span className="flex items-center gap-2">
            <span className="bg-bull size-2 rounded-full" />
            <span className="text-fg font-semibold">Session Context</span>
          </span>
          <span>{agentProgress ? 'ANALYZING' : 'READY'}</span>
        </div>
        <div className="text-fg-muted space-y-2">
          <div className="flex items-center justify-between">
            <span>Active Symbol</span>
            <span className="text-fg font-semibold">{symbol}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Chart Timeframe</span>
            <span className="text-fg uppercase">{activeTf}</span>
          </div>
        </div>

        {agentProgress && (
          <div className="border-border/70 mt-3 border-t pt-3">
            <div className="text-fg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-fg-muted">Analysis Mode</span>
                <span className="font-semibold">
                  {agentProgress.mode === 'full' ? 'Full Committee' : 'Quick Read'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-fg-muted">Status</span>
                <span className="capitalize">{agentProgress.status}</span>
              </div>
              {agentProgress.error && <p className="text-danger">Note: {agentProgress.error}</p>}
            </div>
          </div>
        )}

        <div className="border-border/70 mt-4 border-t pt-3">
          <Link
            href={`/chart/${symbol}?tf=${activeTf}`}
            className="text-brand inline-flex items-center gap-1 text-xs font-semibold hover:underline"
          >
            Open full-screen {symbol} Pro Chart
          </Link>
        </div>
      </div>
    </div>
  );
}
