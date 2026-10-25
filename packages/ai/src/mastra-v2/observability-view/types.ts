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

// SPDX-License-Identifier: Apache-2.0

// Phase 8 unified Mastra run view contracts (DEC-05 split of
// observability-view.ts).

import type { ScoreRecord } from '../evals/scores';

/** Minimal projection of a `chat_telemetry` row used by the runs viewer. */
export interface RunTelemetryRow {
  runId: string | null;
  traceId: string | null;
  threadId: string | null;
  userId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  ms: number;
  estCostUsd: number;
  kind: string | null;
  createdAt: Date;
}

export interface WorkflowRunStatusView {
  workflowId: string | null;
  status: string | null;
  failedSteps: string[];
  completedSteps: number;
  totalSteps: number;
  /**
   * Phase 5.2 — why the run failed, recovered from the snapshot: failed-step
   * error messages (committee strict failures, verifier findings live in the
   * message/cause chain) with the workflow-level error as fallback. `null`
   * when the run succeeded or nothing was persisted.
   */
  error?: string | null;
}

export interface MastraRunScoreView {
  scorerId: string;
  score: number;
  source: ScoreRecord['source'];
  reason?: string;
}

export interface MastraRunView {
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
  workflow: WorkflowRunStatusView;
  scores: MastraRunScoreView[];
  /** Best summary score (mean of available scores), for quick sorting. */
  scoreMean: number | null;
  /**
   * Phase 5.2 — failure detail for failed runs (committee strict failure,
   * verifier findings), recovered from the workflow snapshot. `null` when the
   * run succeeded or no workflow state was persisted.
   */
  error?: string | null;
}
