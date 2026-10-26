'use client';

// SPDX-License-Identifier: Apache-2.0

// Unified Committee Deliberation / Consensus Ledger.
// Reuses the canonical AgentDeliberation component to guarantee design and behavioral parity
// across both live streaming turns and persisted historical sessions under the Hoplite Design System.
import type { AgentProgress } from '../agent-deliberation/agent-meta';
import { AgentDeliberation } from '../agent-deliberation';
import type { PixelAgentOpinion } from './character-profiles';

interface PixelDeskDeliberationProps {
  opinions: PixelAgentOpinion[];
  mode?: string;
  className?: string;
}

/**
 * PixelDeskDeliberation
 * Unified consensus ledger rendering settled specialist opinions.
 * Reuses the canonical AgentDeliberation component to guarantee design and behavioral parity.
 */
export function PixelDeskDeliberation({
  opinions,
  mode = 'full',
  className,
}: PixelDeskDeliberationProps) {
  if (!opinions || opinions.length === 0) return null;

  const agents: AgentProgress[] = opinions.map((o) => ({
    agentName: o.agentName,
    status: 'done',
    opinion: {
      agentName: o.agentName,
      bias: o.bias,
      confidence: o.confidence,
      reasoning: o.reasoning,
    },
  }));

  return (
    <div className={className}>
      <AgentDeliberation agents={agents} mode={mode} status="complete" />
    </div>
  );
}
