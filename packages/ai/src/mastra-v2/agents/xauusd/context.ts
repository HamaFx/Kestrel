// context imports
import type { RunXauusdMastraArgs, XauusdMastraSettings } from './run';
import { resolveMastraExecutionModel, type ChatModelResolution } from '../../../model';

import {
  requireExecutionPlanModel,
  type ExecutionPlan,
} from '../../planning/execution-plan';

import type { ResolveModelEnv } from '../../../env-model-factory';

import { RequestContext } from '@mastra/core/request-context';

import { XauusdRequestContextSchema, type XauusdRequestContext } from '../../shared/types';

import { XauusdResearchPacketSchema, type XauusdResearchPacket } from '../../packets/research-types';

import type { XauusdResearchReport } from './report/report-types';

import type { MastraGenerationStats } from '../../shared/stats';

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
 * Audit plan §4.5 — the XAUUSD run context extracted from the former
 * `mastra/run.ts` god module (P2-1): model pinning
 * (`MASTRA_XAUUSD_MODEL`), request-context construction, blocked-run stats,
 * and the saved-report follow-up packet. Each piece is independently
 * testable and `run.ts` keeps only turn orchestration.
 */

export function resolveXauusdMastraModel(
  settings: XauusdMastraSettings,
  env: ResolveModelEnv,
  modelOverride?: string | null,
  executionPlan?: ExecutionPlan,
): ChatModelResolution {
  // The same resolver used by production chat provides the user's encrypted
  // BYOK key, provider choice, circuit-breaker behavior, and model catalog
  // validation. Mastra receives only the resulting LanguageModel object.
  //
  // M6 fix — the verified-report pipeline is a structured, latency-sensitive
  // multi-step generation. It intentionally does NOT honor the user's
  // heavyweight chat model pick (e.g. mistral-large-latest): flagship
  // reasoning models routinely blow past the 55s route budget for this flow
  // (measured >120s locally). The provider's fast technical tier (e.g.
  // mistral-small-latest, ~20s per verified report) is used instead.
  // Operators can pin an exact model with MASTRA_XAUUSD_MODEL="provider:model".
  const pinned = process.env.MASTRA_XAUUSD_MODEL;
  const selectedModel = modelOverride ?? (pinned && pinned.length > 0 ? pinned : null);
  const mastraSettings: XauusdMastraSettings = {
    aiApiKeys: settings.aiApiKeys,
    chatModel: selectedModel,
  };
  const snapshot = executionPlan ? requireExecutionPlanModel(executionPlan) : undefined;
  return resolveMastraExecutionModel({
    purpose: 'xauusd',
    settings: mastraSettings,
    env,
    domain: 'technical',
    ...(modelOverride !== undefined ? { modelOverride } : {}),
    ...(snapshot ? { snapshot } : {}),
  });
}

export function baseContextForRun(args: RunXauusdMastraArgs): RequestContext<XauusdRequestContext> {
  const values = { userId: args.userId, runId: args.runId, threadId: args.threadId };
  XauusdRequestContextSchema.parse(values);
  return new RequestContext<XauusdRequestContext>([
    ['userId', args.userId],
    ['runId', args.runId],
    ['threadId', args.threadId],
  ]);
}

export function contextForRun(
  args: RunXauusdMastraArgs,
  researchPacket: XauusdResearchPacket,
): RequestContext<XauusdRequestContext> {
  const values = {
    userId: args.userId,
    runId: args.runId,
    threadId: args.threadId,
    researchPacket,
    ...(args.priorReport ? { priorReport: args.priorReport } : {}),
  };
  XauusdRequestContextSchema.parse(values);
  const entries: Array<
    | ['userId', string]
    | ['runId', string]
    | ['threadId', string]
    | ['researchPacket', XauusdResearchPacket]
    | ['priorReport', XauusdResearchReport]
  > = [
    ['userId', args.userId],
    ['runId', args.runId],
    ['threadId', args.threadId],
    ['researchPacket', researchPacket],
  ];
  if (args.priorReport) entries.push(['priorReport', args.priorReport]);
  return new RequestContext(entries);
}

export function blockedStats(): MastraGenerationStats {
  return { inputTokens: 0, outputTokens: 0, toolCalls: 0, steps: 0 };
}

/**
 * Build a minimal research packet from a saved report for follow-up questions.
 * Follow-ups answer from the report's own data, NOT from fresh market data —
 * this prevents stale-report answers from mixing in today's prices.
 */
export function followupPacketFromReport(report: XauusdResearchReport): XauusdResearchPacket {
  return XauusdResearchPacketSchema.parse({
    packetId: `followup:${report.asOf}`,
    kind: 'research_packet' as const,
    symbol: 'XAUUSD' as const,
    generatedAt: report.asOf,
    status: 'ready' as const,
    dataQuality: report.dataQuality,
    timeframes: [],
    price: null,
    candles: [],
    indicators: [],
    macro: null,
    missingData: ['follow-up context — no fresh market data'],
    warnings: [
      'Answering from the saved report only. Request a fresh analysis for current market data.',
    ],
  });
}
