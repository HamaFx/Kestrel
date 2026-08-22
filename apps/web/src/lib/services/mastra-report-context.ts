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

import type { DbMessage } from '@kestrel/ai';
import { XauusdResearchReportSchema, type XauusdResearchReport } from '@kestrel/ai/mastra';

const FOLLOWUP_TERMS =
  /\b(?:why|explain|how|what\s+changed|based\s+on|according\s+to|invalidation|trigger|scenario|risk|report|analysis|you\s+said)\b/i;
const FORBIDDEN_FOLLOWUP_TERMS =
  /\b(?:buy|sell|enter|exit|execute|place|open|close|trade|position|portfolio|journal|alert|notify|schedule|automate)\b/i;

/** Avoid an extra history query for ordinary conversation. */
export function mayReferToMastraReport(prompt: string): boolean {
  return FOLLOWUP_TERMS.test(prompt) && !FORBIDDEN_FOLLOWUP_TERMS.test(prompt);
}

/**
 * Find the newest persisted Mastra report without trusting arbitrary client
 * parts. Only a schema-valid report inside the known metadata part is used.
 */
export function extractLatestMastraReport(
  messages: readonly DbMessage[],
): XauusdResearchReport | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== 'assistant' || !Array.isArray(message.parts)) continue;
    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.parts[partIndex];
      if (!isRecord(part) || part.type !== 'data-multi-agent-meta' || !isRecord(part.data))
        continue;
      const report = part.data.report;
      const parsed = XauusdResearchReportSchema.safeParse(report);
      if (parsed.success) return parsed.data;
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
