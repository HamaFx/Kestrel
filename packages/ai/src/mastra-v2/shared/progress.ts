// SPDX-License-Identifier: Apache-2.0

import {
  committeeProgressStages,
  type MastraAnalysisMode,
  type MastraSpecialistName,
} from '../../committee/types';

export interface CommitteeAgentOpinionSummary {
  agentName: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reasoning: string;
  summary?: string;
}

export interface CommitteeAgentProgress {
  agentName: string;
  status: 'pending' | 'running' | 'done' | 'error';
  opinion?: CommitteeAgentOpinionSummary;
}

/** The `data-agent-progress` payload the chat transport and deliberation panel consume. */
export interface CommitteeProgressSnapshot {
  agents: CommitteeAgentProgress[];
  mode: string;
  status?: 'complete' | 'failed' | 'retrying';
}

/**
 * Build the `AgentProgress` snapshot from a committee stage event. Stages fire in
 * `committeeProgressStages` order, so every specialist before the current
 * stage is done, the current one is running, and the rest are pending.
 * When `opinions` are provided (e.g., on completion), each finished specialist
 * entry carries its structured opinion so `AgentDeliberation` can render
 * Desk Confidence, bias distribution, and specialist breakdowns.
 * Shared by the sync web path and the durable worker path so they cannot drift.
 */
export function committeeProgressSnapshot(
  mode: MastraAnalysisMode,
  step: string,
  terminalStatus?: 'complete' | 'failed',
  opinions?: ReadonlyArray<{
    agentName: string;
    bias: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    reasoning: string;
  }>,
): CommitteeProgressSnapshot {
  const specialists = committeeProgressStages(mode).filter(
    (stage): stage is MastraSpecialistName =>
      stage !== 'collect-packet' &&
      stage !== 'critique' &&
      stage !== 'debate' &&
      stage !== 'verify' &&
      stage !== 'fusion',
  );
  const current = specialists.indexOf(step as MastraSpecialistName);
  const isBeforeSpecialists = step === 'collect-packet' && !terminalStatus;
  const opinionByAgent = new Map<string, CommitteeAgentOpinionSummary>(
    (opinions ?? []).map((op) => [
      op.agentName,
      {
        agentName: op.agentName,
        bias: op.bias,
        confidence: op.confidence,
        reasoning: op.reasoning,
        summary: op.reasoning,
      },
    ]),
  );

  return {
    agents: specialists.map((name, index) => {
      const status: CommitteeAgentProgress['status'] =
        terminalStatus === 'failed' && index === current
          ? 'error'
          : isBeforeSpecialists
            ? 'pending'
            : terminalStatus === 'complete' || current === -1 || index < current
              ? 'done'
              : index === current
                ? 'running'
                : 'pending';
      const opinion = opinionByAgent.get(name);
      return {
        agentName: name,
        status,
        ...(opinion && status === 'done' ? { opinion } : {}),
      };
    }),
    mode,
    ...(terminalStatus ? { status: terminalStatus } : {}),
  };
}
