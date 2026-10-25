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

// Token-usage aggregation for committee synthesis (DEC-05 split from
// synthesizer.ts).

import type { MastraGenerationStats } from '../../mastra-v2/shared/telemetry';

export function aggregateStats(stats: MastraGenerationStats[]): MastraGenerationStats {
  return {
    inputTokens: stats.reduce((sum, s) => sum + s.inputTokens, 0),
    outputTokens: stats.reduce((sum, s) => sum + s.outputTokens, 0),
    toolCalls: stats.reduce((sum, s) => sum + s.toolCalls, 0),
    steps: stats.reduce((sum, s) => sum + s.steps, 0),
  };
}
