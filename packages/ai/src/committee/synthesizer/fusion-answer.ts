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

// Structured fusion answer and its deterministic markdown rendering (DEC-05
// split from synthesizer.ts).
//
// Audit plan §3.3 + Audit v3 Q12 — structured fusion answer (enabled by
// default via `PHASE3_STRUCTURED_FUSION`, full mode only). Deterministic
// fields let the UI render scenario tables via the report parts instead of
// parsing free-form markdown.

import { readFeatureFlag } from '@kestrel/shared';
import { z } from 'zod';

export const FusionAnswerSchema = z.object({
  bottomLine: z.string().min(1),
  reasoning: z.string().min(1),
  risks: z.array(z.string().min(1)).min(1),
  invalidation: z.string().min(1),
  scenarioTable: z
    .array(
      z.object({
        scenario: z.string().min(1),
        bias: z.enum(['bullish', 'bearish', 'neutral']),
        trigger: z.string().min(1),
      }),
    )
    .min(1),
});
export type FusionAnswer = z.infer<typeof FusionAnswerSchema>;

/** Deterministic markdown rendering for the structured fusion answer. */
export function renderFusionAnswer(answer: FusionAnswer): string {
  const scenarioRows = answer.scenarioTable
    .map((row) => `| ${row.scenario} | ${row.bias} | ${row.trigger} |`)
    .join('\n');
  return [
    `**Bottom line:** ${answer.bottomLine}`,
    '',
    answer.reasoning,
    '',
    '**Scenarios**',
    '',
    '| Scenario | Bias | Trigger |',
    '| --- | --- | --- |',
    scenarioRows,
    '',
    `**Invalidation:** ${answer.invalidation}`,
    '',
    `**Risks:** ${answer.risks.map((risk) => `- ${risk}`).join('\n')}`,
  ].join('\n');
}

/** Q12: structured fusion is enabled by default (disable with PHASE3_STRUCTURED_FUSION=0). */
export function structuredFusionEnabled(): boolean {
  return readFeatureFlag('PHASE3_STRUCTURED_FUSION');
}
