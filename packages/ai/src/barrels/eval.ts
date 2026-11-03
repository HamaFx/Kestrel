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

// Eval sub-barrel: offline eval runners and metrics plus the UI
// message-stream parser. Re-exported by `src/index.ts`.

export type { PromptResult, PromptDef, RunEvalsResult, EvaluationScore } from '../eval/runner';
export { computeDrift, type DriftReport, type DriftBucket } from '../eval/drift';
export { emitEvalMetrics, isEvalCaseOk } from '../eval/eval-metrics';
export { consumeUIMessageStream, type ParsedStreamResult } from '../eval/parse-stream';
