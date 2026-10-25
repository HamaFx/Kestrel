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

// XAUUSD verified-report workflow IO contracts (DEC-05 split of
// xauusd-report.ts).

import type { Mastra } from '@mastra/core';
import type { Agent, AgentMemoryOption } from '@mastra/core/agent';
import { z } from 'zod';

import { XauusdResearchReportSchema } from '../../agents/xauusd/report/report-types';
import type { xauusdMastraTools } from '../../agents/xauusd/tools';
import { XauusdResearchPacketSchema } from '../../packets/research-types';
import type { MastraGenerationStats } from '../../shared/stats';
import type { XauusdRequestContext } from '../../shared/types';

export const StatsSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  toolCalls: z.number(),
  steps: z.number(),
});

export const zeroStats = (): MastraGenerationStats => ({
  inputTokens: 0,
  outputTokens: 0,
  toolCalls: 0,
  steps: 0,
});

export const XauusdReportWorkflowInputSchema = z.object({
  prompt: z.string().min(1),
});

export const CollectPacketOutputSchema = z.object({
  packet: XauusdResearchPacketSchema,
  prompt: z.string().min(1),
});

export const GenerationStepOutputSchema = z.object({
  verified: z.boolean(),
  report: XauusdResearchReportSchema.nullable(),
  result: z.unknown(),
  findings: z.array(z.string()),
  attempt: z.int().positive(),
  stats: StatsSchema,
});

export const XauusdReportWorkflowOutputSchema = z.object({
  status: z.enum(['ready', 'blocked']),
  blockedText: z.string().optional(),
  report: XauusdResearchReportSchema.nullable().optional(),
  result: z.unknown().optional(),
  packet: XauusdResearchPacketSchema,
  attempts: z.int().nonnegative().optional(),
  stats: StatsSchema,
});

export interface XauusdReportWorkflowDeps {
  /** The XAUUSD research agent (BYOK model + memory already bound). */
  agent: Agent<string, typeof xauusdMastraTools, undefined, XauusdRequestContext>;
  /** P-01 (audit 2026-10-18): optional so view-only registrations (Studio) can build the graph without BYOK memory. */
  callOptions?: AgentMemoryOption;
  providerId: string;
  signal?: AbortSignal;
  /** Shared Mastra instance for run-snapshot persistence (optional; in-memory when absent). */
  mastra?: Mastra;
  /**
   * Output verification policy (Phase 7). `verified` (default) runs the
   * deterministic grounding/safety/temporal checks and the bounded repair
   * loop before a report is emitted. `schema` accepts any schema-valid
   * structured output without the deterministic checks — intended for
   * generic research composition where the stronger report verifier is not
   * required. The output contract (status/report/packet/stats) is identical.
   */
  outputPolicy?: XauusdReportOutputPolicy;
}

export type XauusdReportOutputPolicy = 'verified' | 'schema';

export const XAUUSD_REPORT_OUTPUT_POLICIES: readonly XauusdReportOutputPolicy[] = [
  'verified',
  'schema',
];

export function resolveXauusdReportOutputPolicy(
  policy: XauusdReportOutputPolicy | undefined,
): XauusdReportOutputPolicy {
  return policy === 'schema' ? 'schema' : 'verified';
}
