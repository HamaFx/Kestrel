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

// Execution-plan route validation for mode runs.

import type { MastraAnalysisMode } from '@ai/committee/types';

import type { ExecutionPlan } from '../execution-plan';

/**
 * Map the requested analysis mode to the execution-plan route the runner is
 * allowed to consume. Durable Full jobs are enqueued with `full-analysis`,
 * while mode/symbol runs use the symbol-research routes.
 */
export function expectedModeExecutionPlanRoute(
  mode: MastraAnalysisMode,
  comparison: boolean,
): ExecutionPlan['route'] {
  if (mode === 'full') return 'full-analysis';
  return comparison ? 'multi-symbol-research' : 'symbol-research';
}
