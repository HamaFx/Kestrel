// SPDX-License-Identifier: Apache-2.0

import {
  committeeProgressStages,
  type MastraAnalysisMode,
  type MastraSpecialistName,
} from '../../committee/types';

export interface CommitteeAgentProgress {
  agentName: string;
  status: 'pending' | 'running' | 'done' | 'error';
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
 * Shared by the sync web path and the durable worker path so they cannot drift.
 */
export function committeeProgressSnapshot(
  mode: MastraAnalysisMode,
  step: string,
  terminalStatus?: 'complete' | 'failed',
): CommitteeProgressSnapshot {
  const specialists = committeeProgressStages(mode).filter(
    (stage): stage is MastraSpecialistName =>
      stage !== 'collect-packet' &&
      stage !== 'critique' &&
      stage !== 'verify' &&
      stage !== 'fusion',
  );
  const current = specialists.indexOf(step as MastraSpecialistName);
  return {
    agents: specialists.map((name, index) => ({
      agentName: name,
      status:
        terminalStatus === 'failed' && index === current
          ? 'error'
          : terminalStatus === 'complete' || current === -1 || index < current
            ? 'done'
            : index === current
              ? 'running'
              : 'pending',
    })),
    mode,
    ...(terminalStatus ? { status: terminalStatus } : {}),
  };
}
