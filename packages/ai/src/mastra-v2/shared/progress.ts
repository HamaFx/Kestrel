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

/**
 * One cross-examination outcome surfaced to the UI: the desk that audited its
 * peers, whether it confirmed their assumptions, its revised confidence, and
 * the critique text.
 */
export interface CommitteeCritiqueSummary {
  agentName: string;
  confirms: boolean;
  revisedConfidence: number;
  critique: string;
}

/** The `data-agent-progress` payload the chat transport and deliberation panel consume. */
export interface CommitteeProgressSnapshot {
  agents: CommitteeAgentProgress[];
  mode: string;
  /**
   * The `CommitteeStepId` currently executing — `collect-packet`,
   * `technical`/`fundamental`/`risk`/`sentiment`, `critique`, `debate`,
   * `verify`, or `fusion` — so the UI can illuminate the correct circuit
   * stage (`SyndicateCircuitLive`) instead of guessing from desk statuses.
   */
  stage?: string;
  status?: 'complete' | 'failed' | 'retrying';
  /** Cross-examination critiques (full mode, after the critique round). */
  critiques?: CommitteeCritiqueSummary[];
  /**
   * M-01 (audit 2026-10-18) — for a multi-symbol comparison this carries the
   * requested symbols so the UI labels the run honestly: "one desk per
   * symbol + cross-symbol synthesis", never "N committees". Absent for
   * ordinary single-symbol runs.
   */
  comparisonSymbols?: string[];
}

/**
 * Build the `AgentProgress` snapshot from a committee stage event. Stages fire in
 * `committeeProgressStages` order, so every specialist before the current
 * stage is done, the current one is running, and the rest are pending.
 * When `opinions` are provided (e.g., on completion), each finished specialist
 * entry carries its structured opinion so `AgentDeliberation` can render
 * Desk Confidence, bias distribution, and specialist breakdowns.
 * `critiques` (full mode) carry the cross-examination ledger the War Room
 * renders; both fields default off so older emitters stay valid.
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
  comparisonSymbols?: readonly string[],
  critiques?: ReadonlyArray<CommitteeCritiqueSummary>,
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
    stage: step,
    ...(terminalStatus ? { status: terminalStatus } : {}),
    ...(critiques && critiques.length > 0 ? { critiques: [...critiques] } : {}),
    ...(comparisonSymbols && comparisonSymbols.length >= 2
      ? { comparisonSymbols: [...comparisonSymbols] }
      : {}),
  };
}

/** Structured extras a progress update can carry forward to the next stage. */
export interface CommitteeProgressExtras {
  opinions?: CommitteeAgentOpinionSummary[];
  critiques?: CommitteeCritiqueSummary[];
}

/**
 * Durable worker path: a late stage update (`critique` → `verify` → `fusion`)
 * is built from the stage id alone, so opinions/critiques delivered by an
 * earlier update must be carried forward instead of being dropped. Scans the
 * persisted progress log newest-first and returns the first non-empty set.
 */
export function extractCommitteeProgressExtras(
  progress: ReadonlyArray<{ data?: unknown } | null | undefined> | null | undefined,
): CommitteeProgressExtras {
  const extras: CommitteeProgressExtras = {};
  for (let i = (progress?.length ?? 0) - 1; i >= 0; i--) {
    const data = progress?.[i]?.data as Partial<CommitteeProgressSnapshot> | undefined;
    if (!data || typeof data !== 'object') continue;
    if (!extras.critiques && Array.isArray(data.critiques) && data.critiques.length > 0) {
      extras.critiques = data.critiques;
    }
    if (!extras.opinions && Array.isArray(data.agents)) {
      const opinions = data.agents
        .map((agent) => agent?.opinion)
        .filter((opinion): opinion is CommitteeAgentOpinionSummary => Boolean(opinion));
      if (opinions.length > 0) extras.opinions = opinions;
    }
    if (extras.opinions && extras.critiques) break;
  }
  return extras;
}
