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
 * Mode runner (Phase 2) — delegates Quick/Standard/Full committee analysis
 * to the shared committee workflow (see `../committee/workflow.ts`). This
 * barrel re-exports the pieces Kestrel must keep: BYOK model resolution,
 * telemetry, per-call memory, the result contract (opinions + packet + stats),
 * and the strict Full-mode failure mapping. The committee itself (specialist
 * steps, per-step retries, verify, fusion) lives in the workflow so
 * repair/verification behavior is observable as workflow run snapshots.
 *
 *   - types.ts            — settings slice, run args, result contract
 *   - model-resolution.ts — primary + per-agent BYOK model resolution
 *   - route.ts            — execution-plan route validation
 *   - run-context.ts      — RequestContext + tool-context assembly
 *   - committee-run.ts    — workflow construction, resume, strict failure map
 *   - results.ts          — raw workflow output → mode result
 *   - run.ts              — run orchestration + telemetry
 */

export type {
  MastraAnalysisMode,
  MastraModeOpinion,
  MastraSpecialistName,
} from '@ai/committee/types';
export {
  MastraModeStrictFailureError,
  SPECIALISTS_BY_MODE,
  REQUEST_CONTEXT_SCHEMA,
  COMMITTEE_DEADLINE_MS,
} from '@ai/committee/types';

export type { MastraModeSettings, MastraModeResult, RunMastraModeArgs } from './types';
export { committeeModelResolver, resolveMastraModeModel } from './model-resolution';
export { expectedModeExecutionPlanRoute } from './route';
export { runMastraMode } from './run';
