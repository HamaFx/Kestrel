// SPDX-License-Identifier: Apache-2.0

'use client';

// Animated SVG connector drawn toward the consensus node while desks finish.
import { m } from 'motion/react';

import type { AgentProgress } from './agent-meta';

export function ConnectorLines({ agents }: { agents: AgentProgress[] }) {
  const n = agents.length;
  const cx = 50;
  const cy = 12;
  const lines = agents
    .map((a, i) => ({ a, x: n > 0 ? ((i + 0.5) / n) * 100 : 50 }))
    .filter((d) => d.a.status === 'done');

  return (
    <svg viewBox="0 0 100 12" preserveAspectRatio="none" className="h-3 w-full" aria-hidden="true">
      {lines.map((d, i) => (
        <m.line
          key={i}
          x1={d.x}
          y1={0}
          x2={cx}
          y2={cy}
          stroke="var(--color-border)"
          strokeWidth={0.8}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.3, delay: i * 0.05 }}
        />
      ))}
    </svg>
  );
}
