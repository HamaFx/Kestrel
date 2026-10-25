// SPDX-License-Identifier: Apache-2.0

'use client';

// Compact live committee progress trace while desks are still running.
import { IconTerminal2 } from '@tabler/icons-react';
import { useMemo } from 'react';

import { AGENT_META, FALLBACK_META, type AgentProgress } from './agent-meta';

export function TelemetryLog({ agents }: { agents: AgentProgress[] }) {
  const lines = useMemo(() => {
    const result: Array<{ line: string; tone: string }> = [];

    for (let i = 0; i < agents.length; i++) {
      const a = agents[i]!;
      const meta = AGENT_META[a.agentName] ?? FALLBACK_META;

      let statusTag: string;
      let statusTone: string;
      switch (a.status) {
        case 'pending':
          statusTag = '[ QUEUED ]';
          statusTone = 'text-fg-subtle';
          break;
        case 'running':
          statusTag = '[ ANALYZING ]';
          statusTone = 'text-fg';
          break;
        case 'done':
          statusTag = '[ READY ]';
          statusTone = 'text-bull';
          break;
        case 'error':
          statusTag = '[ UNAVAILABLE ]';
          statusTone = 'text-danger';
          break;
      }

      const label = `${meta.label} Desk`.padEnd(16, ' ');
      result.push({
        line: `${label} ${statusTag}`,
        tone: statusTone,
      });
    }

    const hasRunning = agents.some((a) => a.status === 'running');
    const doneCount = agents.filter((a) => a.status === 'done').length;
    if (hasRunning) {
      result.push({
        line: `trade plan synthesis  [ ACTIVE ]`,
        tone: 'text-brand',
      });
    } else if (doneCount > 0 && agents.some((a) => a.status !== 'done' && a.status !== 'error')) {
      result.push({
        line: `trade plan synthesis  [ STANDBY ]`,
        tone: 'text-fg-subtle',
      });
    }

    return result;
  }, [agents]);

  return (
    <div className="bg-bg-elev-2/50 border-border/70 overflow-hidden rounded-lg border">
      <div className="border-border/60 flex items-center gap-2 border-b px-3 py-1.5">
        <IconTerminal2 className="text-fg-subtle size-3" />
        <span className="text-fg-subtle font-mono text-xs">Live Committee Progress</span>
      </div>
      <div className="grid grid-cols-1 gap-1 px-3 py-2 font-mono text-xs sm:grid-cols-2">
        {lines.map((l, i) => (
          <div key={i} className={l.tone || 'text-fg-subtle'}>
            {l.line}
          </div>
        ))}
      </div>
    </div>
  );
}
