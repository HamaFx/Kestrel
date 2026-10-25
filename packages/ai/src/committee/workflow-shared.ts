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
 * Committee workflow shared contract (audit 2026-10-18, Phase 4 — workflow
 * split). The god workflow was split into `single-workflow.ts` (one
 * collect → parallel specialists → critique/debate → verify → fusion graph)
 * and `comparison-workflow.ts` (per-symbol packets → per-symbol desk passes →
 * verify → cross-symbol fusion). This module owns everything both graphs
 * share: the workflow input/output schemas, the injected dependency contract,
 * the step IO schemas, the deadline-signal helper, and the one place that
 * copies workflow deps into specialist-runner deps.
 *
 * `workflow.ts` stays the module entry point: it re-exports these symbols and
 * dispatches `createCommitteeWorkflow` to the right graph, so every existing
 * import site and integration test is unchanged.
 */

import type { Symbol } from '@kestrel/shared';
import type { Mastra } from '@mastra/core';
import type { AgentMemoryOption } from '@mastra/core/agent';
import type { MastraScorers } from '@mastra/core/evals';
import type { MastraMemory } from '@mastra/core/memory';
import type { InputProcessorOrWorkflow } from '@mastra/core/processors';
import type { LanguageModel } from 'ai';
import { z } from 'zod';

import { SymbolResearchPacketSchema } from '../mastra-v2/packets/packet-cache';
import type { GenerationLedger } from '../persistence/generation-ledger';
import type { ToolContext } from '../runtime/tool-context';
import { combineRunSignal, deadlineSignalFor, type DeadlineSignals } from '../utils/timeout';
import type { SpecialistRunnerDeps } from './specialist-runner';
import {
  CollectPacketOutputSchema,
  CommitteeCritiqueSchema,
  MastraAnalysisModeSchema,
  MastraModeOpinionSchema,
  MastraSpecialistNameSchema,
  type CollectComparisonPacketsFn,
  type CollectPacketFn,
  type CommitteeAgentId,
  type CommitteeStepId,
} from './types';

export const CommitteeWorkflowInputSchema = z.object({
  prompt: z.string().min(1),
  symbol: SymbolResearchPacketSchema.shape.symbol,
  mode: MastraAnalysisModeSchema,
  /**
   * A-01 — comparison symbols (2–3, prompt order). When present the workflow
   * runs the per-symbol comparison graph instead of the single-symbol
   * committee; `symbol` stays the primary (first) symbol.
   */
  symbols: z.array(SymbolResearchPacketSchema.shape.symbol).min(2).max(3).optional(),
});

export const CommitteeWorkflowOutputSchema = z.object({
  status: z.enum(['ready', 'blocked']),
  blockedText: z.string().optional(),
  finalText: z.string().optional(),
  opinions: z.array(MastraModeOpinionSchema),
  /** §3.2 cross-critique records (Q6: ON by default for full). */
  critiques: z.array(CommitteeCritiqueSchema),
  packet: SymbolResearchPacketSchema,
  /** A-01: per-symbol packets for comparison runs. */
  packets: z.record(z.string(), SymbolResearchPacketSchema).optional(),
  /**
   * F-01: symbols excluded from a comparison because their packet was
   * blocked; the fusion discloses them and compares the healthy subset.
   */
  blockedSymbols: z.array(z.string()).optional(),
  stats: z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    toolCalls: z.number(),
    steps: z.number(),
  }),
  failedAgents: z.array(MastraSpecialistNameSchema),
  totalCostUsd: z.number().nonnegative().default(0),
});

/** Step input for the single-symbol specialist steps. */
export const SpecialistStepInputSchema = z.object({
  packet: SymbolResearchPacketSchema,
  prompt: z.string(),
});

/**
 * A-01 — comparison specialist step input: the collect step's per-symbol
 * packet record plus the primary packet (kept for schema compatibility).
 */
export const ComparisonSpecialistStepInputSchema = z.object({
  packet: SymbolResearchPacketSchema,
  packets: z.record(z.string(), SymbolResearchPacketSchema).optional(),
  prompt: z.string(),
});

export const VerifyOutputSchema = z.object({
  failedAgents: z.array(MastraSpecialistNameSchema),
});

export interface CommitteeWorkflowDeps {
  model: LanguageModel;
  modelId: string;
  providerId: string;
  /**
   * Thread memory. P-01 (audit 2026-10-18): optional so view-only canonical
   * registrations (Studio) can build the graph without a BYOK memory handle.
   */
  memory?: MastraMemory | undefined;
  /** Read thread context; the specialist runner enforces read-only by default. */
  specialistCallOptions?: AgentMemoryOption | undefined;
  /** The fusion/output layer owns writes to the conversation thread. */
  fusionCallOptions?: AgentMemoryOption | undefined;
  signal?: AbortSignal;
  /**
   * Audit plan §3.1 (Q1: quality always) — optional per-agent top-tier model
   * resolution. Returns null to fall back to the run's primary model. The
   * resolver must never downgrade to a cheaper tier for cost.
   */
  resolveModelForAgent?: (agent: CommitteeAgentId) => {
    model: LanguageModel;
    modelId: string;
    providerId: string;
  } | null;
  /** Shared Mastra instance for run-snapshot persistence (optional; in-memory when absent). */
  mastra?: Mastra;
  /** Input processors (Unicode normalizer + prompt-injection detector). */
  inputProcessors?: Array<InputProcessorOrWorkflow>;
  /** Research-specific processors; falls back to inputProcessors for compatibility. */
  researchInputProcessors?: Array<InputProcessorOrWorkflow>;
  /** Sampled live scorers for research agents (from `buildResearchScorers`). */
  scorers?: MastraScorers;
  ledger?: GenerationLedger;
  /** Optional progress sink; each stage is emitted exactly once per run. */
  onProgress?: (step: CommitteeStepId) => void | Promise<void>;
  /** Capability-derived bounded step limit for specialist/fusion LLM calls. */
  maxSteps?: number;
  /** Deterministic evidence packet collector; defaults to symbol-research. */
  collectPacket?: CollectPacketFn;
  /**
   * A-01 (B-01/B-08) — when two or three symbols are present, the workflow
   * runs the comparison graph: one cached packet per symbol (parallel), one
   * desk pass per symbol (parallel), strict verify, then a
   * cross-symbol fusion that compares the packets.
   */
  comparisonSymbols?: readonly Symbol[];
  /** Comparison packet collector; defaults to `collectMultiSymbolPackets`. */
  collectComparisonPackets?: CollectComparisonPacketsFn;
  /**
   * Committee deadline (audit plan §1.7, Q3). When set, a deadline abort is
   * converted into an explicit failure marker / strict error instead of an
   * opaque route abort. Sync web runs pass 45s; durable worker runs omit it.
   */
  deadlineMs?: number;
  toolContext?: ToolContext;
  disabledTools?: readonly string[] | null;
}

/** Progress stage id accepted by `CommitteeWorkflowDeps.onProgress`. */
// (CommitteeStepId is imported above from ./types.)

/**
 * P-01 (audit 2026-10-18) — the single documented cast for Mastra's fluent
 * `.parallel()` builder: it requires a tuple of homogeneous step types that
 * cannot be inferred from mapped step arrays. One helper, one contract.
 */
export function asParallelSteps<T>(steps: readonly T[]): never {
  return steps as never;
}

/**
 * Audit plan §1.7 — one deadline/user signal pair shared by every step in a
 * run. Both graphs build their signals here so the deadline semantics cannot
 * drift between the single and comparison pipelines.
 */
export function runSignalsFor(deps: CommitteeWorkflowDeps): {
  runSignals: DeadlineSignals;
  runSignal: AbortSignal | undefined;
} {
  const deadlineSignal = deadlineSignalFor(deps.deadlineMs);
  const runSignals: DeadlineSignals = {
    ...(deps.signal ? { userSignal: deps.signal } : {}),
    ...(deadlineSignal ? { deadlineSignal } : {}),
  };
  return { runSignals, runSignal: combineRunSignal(runSignals) };
}

/**
 * The one copy point from workflow deps to specialist-runner deps. Both
 * graphs — and the critique/debate factories — call this instead of repeating
 * the 12-field object per step (the copy previously lived inline in the
 * specialist, critique, debate, and comparison steps).
 *
 * The declared return keeps the wider `CommitteeAgentId` resolver signature
 * from the workflow deps, so the same object serves the specialist runner
 * (desk names only) and the critique/debate runners (which also resolve the
 * fusion agent).
 */
export type CommitteeRunnerDeps = Omit<SpecialistRunnerDeps, 'resolveModelForAgent'> &
  Pick<CommitteeWorkflowDeps, 'resolveModelForAgent'>;

export function specialistRunnerDepsFor(
  deps: CommitteeWorkflowDeps,
  ledger: GenerationLedger,
  maxSteps: number,
): CommitteeRunnerDeps {
  return {
    model: deps.model,
    modelId: deps.modelId,
    providerId: deps.providerId,
    ...(deps.resolveModelForAgent ? { resolveModelForAgent: deps.resolveModelForAgent } : {}),
    memory: deps.memory,
    specialistCallOptions: deps.specialistCallOptions,
    ...(deps.researchInputProcessors
      ? { researchInputProcessors: deps.researchInputProcessors }
      : {}),
    ...(deps.inputProcessors ? { inputProcessors: deps.inputProcessors } : {}),
    ...(deps.scorers ? { scorers: deps.scorers } : {}),
    ledger,
    maxSteps,
    ...(deps.toolContext ? { toolContext: deps.toolContext } : {}),
    ...(deps.disabledTools ? { disabledTools: deps.disabledTools } : {}),
  };
}

// Re-export the collect-stage output schema so both graphs import step IO
// from one module (kept out of the type-only import above for runtime use).
export { CollectPacketOutputSchema };
