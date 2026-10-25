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

/**
 * Phase 8 — unified Mastra run view barrel (DEC-05 split of
 * observability-view.ts).
 *
 * The admin "Mastra Runs" viewer joins three runId-keyed surfaces into one
 * row so a single run id answers "which stage failed, which provider, what
 * did it cost, was it grounded":
 *
 *   - DB telemetry   (`chat_telemetry`, kind `mastra_*`) → provider, model,
 *                     tokens, cost, latency, trace id.
 *   - Workflow state (`storage.workflows.loadWorkflowSnapshot`) → stage,
 *                     step statuses, run status, and (Phase 5.2) the failure
 *                     detail — committee strict-failure messages and verifier
 *                     findings recovered from failed-step errors.
 *   - Scores         (`storage.scores`) → grounding/citation/faithfulness.
 *
 * The projection is pure (no DB access) — the web route supplies the telemetry
 * row and the Mastra instance, so this module is unit-testable without a
 * database.
 *
 *   - types.ts    — telemetry/workflow/score/view contracts
 *   - query.ts    — kind → workflow id and model id → provider helpers
 *   - snapshot.ts — workflow snapshot → status view (+ failure detail)
 *   - view.ts     — the unified projection for one telemetry row
 */

export {
  type MastraRunScoreView,
  type MastraRunView,
  type RunTelemetryRow,
  type WorkflowRunStatusView,
} from './types';
export { MASTRA_WORKFLOW_IDS, providerFromModel, workflowIdForKind } from './query';
export { summarizeWorkflowRunState } from './snapshot';
export { toMastraRunView } from './view';
