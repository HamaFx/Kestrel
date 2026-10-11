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
 * Lightweight plan-then-act step (audit plan §5.1).
 *
 * Complex fundamental-domain prompts ("compare XAUUSD to DXY and calendar
 * risk") are decomposed into subtasks before packet collection so the
 * committee can fetch evidence in parallel instead of overloading one
 * desk. The planner is a single structured LLM call on the user's
 * top-tier model (Q1: quality always — never a cheap tier); prompts that
 * don't need decomposition return a single trivial subtask, so the step is
 * always safe to run and strictly additive.
 */

import { Agent } from '@mastra/core/agent';
import type { LanguageModel } from 'ai';
import { z } from 'zod';

import { estimateCostUsd } from '../../cost';
import type { GenerationLedger } from '../../generation-ledger';

export const PlannerSubtaskSchema = z.object({
  kind: z.enum(['packet', 'news', 'calendar', 'correlation', 'journal']),
  symbol: z.string().min(1),
  timeframe: z.enum(['1d', '4h', '1h', '15m']).optional(),
  focus: z.string().min(1).max(200),
});

export const PlannerOutputSchema = z.object({
  planRequired: z.boolean(),
  subtasks: z.array(PlannerSubtaskSchema).min(1).max(6),
  rationale: z.string().min(1).max(500),
});

export type PlannerSubtask = z.infer<typeof PlannerSubtaskSchema>;
export type PlannerOutput = z.infer<typeof PlannerOutputSchema>;

export interface RunPlannerArgs {
  prompt: string;
  model: LanguageModel;
  modelId: string;
  signal?: AbortSignal;
  ledger?: GenerationLedger;
}

export interface PlannerResult {
  plan: PlannerOutput;
  costUsd: number;
}

/**
 * Heuristic gate: only complex multi-aspect fundamental prompts pay the
 * planner call. Short or single-symbol analysis prompts skip it entirely.
 */
export function plannerRequired(prompt: string): boolean {
  if (prompt.trim().length < 40) return false;
  const comparisons = /\b(?:compare|versus|vs\.?|against|relative to)\b/i.test(prompt);
  const multiAspect =
    /\b(?:and|with|plus)\b.{0,40}\b(?:calendar|news|dxy|dollar index|yields|sentiment|journal)\b/i.test(
      prompt,
    );
  return comparisons || multiAspect;
}

/**
 * Decompose a complex research prompt into bounded subtasks. The planner is
 * optional quality machinery: any failure falls back to a trivial plan
 * (packet for the detected symbol), so the committee never blocks on it.
 */
export async function runPlanner(args: RunPlannerArgs): Promise<PlannerResult> {
  const fallback: PlannerOutput = {
    planRequired: false,
    subtasks: [{ kind: 'packet', symbol: 'XAUUSD', focus: 'single-desk default read' }],
    rationale: 'Planner skipped: prompt does not require decomposition.',
  };
  if (!plannerRequired(args.prompt)) {
    return { plan: fallback, costUsd: 0 };
  }
  try {
    const agent = new Agent({
      id: 'kestrel-mastra-planner',
      name: 'Kestrel Research Planner',
      description: 'Decomposes complex research prompts into bounded evidence subtasks.',
      model: args.model,
      instructions: `You are Kestrel's research planner. Decompose the user's research request into 1-6 bounded evidence subtasks for the committee desks.

Rules:
- Each subtask names exactly one kind: packet (market evidence), news, calendar, correlation, or journal.
- Use canonical symbols (XAUUSD, EURUSD, ...). One subtask per symbol.
- The "focus" is a short evidence question the desk should answer.
- Never plan trades, mutations, or external actions; this is read-only research.
- Return only the structured plan.`,
    });
    const result = await agent.generate(args.prompt, {
      toolChoice: 'none',
      maxSteps: 1,
      structuredOutput: {
        schema: PlannerOutputSchema,
        jsonPromptInjection: 'auto',
        instructions: 'Return the complete structured plan.',
      },
      ...(args.signal ? { abortSignal: args.signal } : {}),
    });
    const plan = PlannerOutputSchema.parse(result.object);
    const usage = (result.usage ?? { inputTokens: 0, outputTokens: 0 }) as {
      inputTokens?: number;
      outputTokens?: number;
    };
    const costUsd = estimateCostUsd(
      args.modelId,
      usage.inputTokens ?? 0,
      usage.outputTokens ?? 0,
    );
    args.ledger?.recordCost('planner', 'auxiliary', costUsd);
    return { plan, costUsd };
  } catch {
    // The planner is strictly additive quality machinery (§5.1): a planner
    // failure must never fail the research run — degrade to the trivial plan.
    return { plan: fallback, costUsd: 0 };
  }
}
