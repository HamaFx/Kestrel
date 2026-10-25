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

// Specialist runner dependency and argument shapes (DEC-05 split from
// specialist-runner.ts).

import type { AgentMemoryOption } from '@mastra/core/agent';
import type { MastraScorers } from '@mastra/core/evals';
import type { MastraMemory } from '@mastra/core/memory';
import type { InputProcessorOrWorkflow } from '@mastra/core/processors';
import type { RequestContext } from '@mastra/core/request-context';
import type { LanguageModel } from 'ai';

import type { SymbolResearchPacket } from '../../mastra-v2/packets/symbol-research';
import type { GenerationLedger } from '../../persistence/generation-ledger';
import type { ToolContext } from '../../runtime/tool-context';
import type { MastraSpecialistName, ModeRequestContext } from '../types';

export interface SpecialistRunnerDeps {
  model: LanguageModel;
  modelId: string;
  providerId: string;
  /**
   * Audit plan §3.1 (Q1: quality always) — optional per-specialist top-tier
   * model. Returns null to fall back to the primary run model.
   */
  resolveModelForAgent?: (agent: MastraSpecialistName) => {
    model: LanguageModel;
    modelId: string;
    providerId: string;
  } | null;
  /** P-01: optional so view-only canonical registrations (Studio) can run without BYOK memory. */
  memory?: MastraMemory | undefined;
  /** Read thread context; read-only is enforced by default inside the runner. */
  specialistCallOptions?: AgentMemoryOption | undefined;
  inputProcessors?: Array<InputProcessorOrWorkflow>;
  researchInputProcessors?: Array<InputProcessorOrWorkflow>;
  scorers?: MastraScorers;
  ledger: GenerationLedger;
  /** Bounded step limit for the specialist LLM + tool loop (defaults to 3 per Q8). */
  maxSteps: number;
  toolContext?: ToolContext;
  disabledTools?: readonly string[] | null;
}

export interface RunSpecialistGenerationArgs {
  name: MastraSpecialistName;
  prompt: string;
  packet: SymbolResearchPacket;
  requestContext: RequestContext<ModeRequestContext>;
  signal?: AbortSignal;
  /** Step start time; reused so failure markers report the full step latency. */
  startedAt: number;
  /**
   * A-01 — symbol label for comparison runs. When set, the emitted opinion
   * carries the symbol so fusion and persistence can attribute the desk read.
   */
  symbol?: string;
  deps: SpecialistRunnerDeps;
}
