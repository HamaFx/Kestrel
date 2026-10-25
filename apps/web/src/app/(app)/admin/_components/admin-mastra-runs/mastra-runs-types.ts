// SPDX-License-Identifier: Apache-2.0

// Wire shapes returned by /api/admin/mastra-runs.
export interface MastraRunScore {
  scorerId: string;
  score: number;
  source: 'LIVE' | 'TEST';
  reason?: string;
}

export interface MastraRunWorkflow {
  workflowId: string | null;
  status: string | null;
  failedSteps: string[];
  completedSteps: number;
  totalSteps: number;
  /** Phase 5.2 — failure detail recovered from the workflow snapshot. */
  error?: string | null;
}

export interface MastraRun {
  runId: string;
  kind: string | null;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  ms: number;
  estCostUsd: number;
  createdAt: string;
  traceId: string | null;
  langfuseUrl: string | null;
  workflow: MastraRunWorkflow;
  scores: MastraRunScore[];
  scoreMean: number | null;
  /** Phase 5.2 — why the run failed (strict failure / verifier findings). */
  error?: string | null;
}

export interface MastraRunsResponse {
  hours: number;
  count: number;
  failed: number;
  scored: number;
  runs: MastraRun[];
}
