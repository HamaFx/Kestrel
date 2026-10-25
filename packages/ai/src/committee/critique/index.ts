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

// Critique/debate barrel (DEC-05 split of critique.ts).
//
// Cross-critique round (audit plan §3.2, Q6 decision: ON by default for
// `full`). After the parallel specialists, each desk reads the *other*
// desks' {bias, confidence, reasoning} — never raw packet data — and returns
// a structured critique. Fusion then receives both opinions and critiques so
// it can surface the committee's splits instead of silently picking a side.

export {
  CritiqueStepOutputSchema,
  CritiqueStepResultSchema,
  DebateStepOutputSchema,
  DebateStepResultSchema,
  type CritiqueStepOutput,
  type CritiqueStepResult,
  type DebateStepOutput,
  type DebateStepResult,
} from './schemas';
export { runCritiqueGeneration } from './run-critique';
export { runDebateRevision } from './run-debate';
export { readCritiqueStepResult, readDebateStepResult } from './readers';
export type { CritiqueRunnerDeps, RunCritiqueGenerationArgs, RunDebateRevisionArgs } from './types';
