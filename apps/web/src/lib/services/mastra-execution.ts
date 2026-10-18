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

import 'server-only';

import type { ExecutionPlan, XauusdResearchReport } from '@kestrel/ai/mastra';
import type { UIMessage } from 'ai';

import { runMastraCanonicalChatStreamService } from './mastra-canonical-chat-stream';
import { runMastraXauusdChat } from './mastra-chat';
import { mastraChatResponse } from './mastra-chat-response';
import { runMastraXauusdConversationStreamChat } from './mastra-chat-stream';
import { runMastraModeChatStream } from './mastra-mode';

export interface PlannedExecutionInput {
  plan: ExecutionPlan;
  userId: string;
  threadId: string;
  userMessage: UIMessage;
  prompt: string;
  modelOverride?: string | null;
  signal?: AbortSignal;
  priorReport?: XauusdResearchReport | null;
  backfillExcludeMessageIdempotencyKey?: string;
}

export interface ConversationalTurnInput extends PlannedExecutionInput {
  customInstructions?: string;
  responseStyle?: 'default' | 'concise' | 'technical' | 'risk-first';
  citeSources?: boolean;
}

export interface ResearchWorkflowInput extends PlannedExecutionInput {
  symbol: string;
  /** A-01 — bounded comparison symbols (2–3) for `multi-symbol-research` plans. */
  symbols?: string[];
}

/**
 * C-05 (audit 2026-10-18) — one conditional-signal spread for every runner
 * call instead of repeating `...(signal ? { signal } : {})` at each site.
 */
function withSignal(signal: AbortSignal | undefined): { signal?: AbortSignal } {
  return signal ? { signal } : {};
}

/** Execute a planned conversational turn and return the established stream response. */
export function runConversationalTurn(input: ConversationalTurnInput): Promise<Response> {
  switch (input.plan.route) {
    case 'canonical-chat':
      return runMastraCanonicalChatStreamService({
        executionPlan: input.plan,
        userId: input.userId,
        threadId: input.threadId,
        userMessage: input.userMessage,
        ...(input.customInstructions ? { customInstructions: input.customInstructions } : {}),
        ...(input.responseStyle ? { responseStyle: input.responseStyle } : {}),
        ...(input.citeSources !== undefined ? { citeSources: input.citeSources } : {}),
        ...(input.modelOverride !== undefined ? { modelOverride: input.modelOverride } : {}),
        ...withSignal(input.signal),
      });
    case 'xauusd-conversation':
      if (input.plan.xauusdChatKind !== 'conversation' || input.plan.reportFollowup) {
        throw new Error('Conversational runner received an incompatible XAUUSD execution plan.');
      }
      return runMastraXauusdConversationStreamChat({
        executionPlan: input.plan,
        userId: input.userId,
        threadId: input.threadId,
        userMessage: input.userMessage,
        prompt: input.prompt,
        turnMode: 'conversation',
        ...(input.modelOverride !== undefined ? { modelOverride: input.modelOverride } : {}),
        ...withSignal(input.signal),
        ...(input.backfillExcludeMessageIdempotencyKey
          ? { backfillExcludeMessageIdempotencyKey: input.backfillExcludeMessageIdempotencyKey }
          : {}),
      });
    default:
      throw new Error(`Conversational runner cannot execute ${input.plan.route}.`);
  }
}

/** Execute a planned buffered research workflow and format its response. */
export async function runResearchWorkflow(input: ResearchWorkflowInput): Promise<Response> {
  if (input.plan.route === 'xauusd-research') {
    const run = await runMastraXauusdChat({
      executionPlan: input.plan,
      userId: input.userId,
      threadId: input.threadId,
      userMessage: input.userMessage,
      prompt: input.prompt,
      kind: 'research',
      turnMode: input.plan.reportFollowup ? 'followup' : 'research',
      ...(input.modelOverride !== undefined ? { modelOverride: input.modelOverride } : {}),
      ...withSignal(input.signal),
      ...(input.priorReport ? { priorReport: input.priorReport } : {}),
      ...(input.backfillExcludeMessageIdempotencyKey
        ? { backfillExcludeMessageIdempotencyKey: input.backfillExcludeMessageIdempotencyKey }
        : {}),
    });
    return mastraChatResponse({
      messageId: crypto.randomUUID(),
      text: run.result.text,
      runId: run.runId,
      modelId: run.modelId,
      providerId: run.providerId,
      report: run.report,
      researchStatus: run.packet.status,
      dataQuality: run.packet.dataQuality,
      packetId: run.packet.packetId,
      observedCost: run.observedCost,
      answerOutcome: run.answerOutcome,
      modelSnapshot: run.modelSnapshot,
      memoryMode: run.memoryMode,
      memoryBackfill: run.memoryBackfill,
    });
  }

  if (input.plan.route !== 'symbol-research' && input.plan.route !== 'multi-symbol-research') {
    throw new Error(`Research runner cannot execute ${input.plan.route}.`);
  }

  // A-01 (B-01/B-08): a bounded cross-symbol comparison executes the
  // comparison graph — one cached packet and per-symbol desk passes
  // (technical + risk by default, P1-04; `ENABLE_COMPARISON_RISK_DESK=0`
  // keeps technical only) — then a cross-symbol fusion. The durable queue
  // never carries a comparison, so `mode` is pinned to `single` here.
  if (input.plan.route === 'multi-symbol-research') {
    const symbols = input.plan.symbols.length >= 2 ? input.plan.symbols : (input.symbols ?? []);
    if (symbols.length < 2) {
      throw new Error('Comparison runner requires at least two symbols.');
    }
    return runMastraModeChatStream({
      executionPlan: input.plan,
      userId: input.userId,
      threadId: input.threadId,
      userMessage: input.userMessage,
      prompt: input.prompt,
      symbol: symbols[0]!,
      symbols,
      mode: 'single',
      ...(input.modelOverride !== undefined ? { modelOverride: input.modelOverride } : {}),
      ...withSignal(input.signal),
      ...(input.backfillExcludeMessageIdempotencyKey
        ? { backfillExcludeMessageIdempotencyKey: input.backfillExcludeMessageIdempotencyKey }
        : {}),
    });
  }
  // §2.3: synchronous committee runs stream live desk progress
  // (data-agent-progress) to the browser while the workflow advances.
  return runMastraModeChatStream({
    executionPlan: input.plan,
    userId: input.userId,
    threadId: input.threadId,
    userMessage: input.userMessage,
    prompt: input.prompt,
    symbol: input.symbol,
    // Q2: plan.mode is already one of `single` | `full`; the symbol-research
    // route only carries `single` (full goes through the durable queue).
    mode: input.plan.mode === 'full' ? 'full' : 'single',
    ...(input.modelOverride !== undefined ? { modelOverride: input.modelOverride } : {}),
    ...withSignal(input.signal),
    ...(input.backfillExcludeMessageIdempotencyKey
      ? { backfillExcludeMessageIdempotencyKey: input.backfillExcludeMessageIdempotencyKey }
      : {}),
  });
}
