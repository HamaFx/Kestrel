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

// Alert evaluator barrel (DEC-05 split of evaluator.ts). Re-exports the
// former module surface: the spec-pattern decision helpers, indicator-spec
// parsing, closed-bar selection, and the cron orchestrator.
//
// PF-08 — Alert rule specification evaluation. The decision logic
// (decideMatch / decideCross) lives in the specification pattern in
// `../spec`; the `specFromRule()` factory converts a persisted AlertRule
// into a composable AlertSpec, and the spec decides whether the reading
// satisfies the trigger. The legacy `decideMatch` and `decideCross`
// exports are re-exported for backward compatibility.

export { decideMatch, decideCross } from '../spec';
export type { RuleReading, CrossContext } from '../spec';
export { parseIndicatorSpec } from './indicator-spec';
export { lastClosedBar } from './bars';
export type { EvaluatorEnv } from './env';
export { type EvaluationResult, evaluateAlerts, describeRule } from './evaluate';
