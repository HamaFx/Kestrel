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

// Synthesizer dependency/argument/result shapes (DEC-05 split from
// synthesizer.ts) — shared by the full-mode fusion and the cross-symbol
// comparison fusion.

import type { AgentMemoryOption } from '@mastra/core/agent';
import type { MastraScorers } from '@mastra/core/evals';
import type { MastraMemory } from '@mastra/core/memory';
import type { InputProcessorOrWorkflow } from '@mastra/core/processors';
import type { RequestContext } from '@mastra/core/request-context';
import type { LanguageModel } from 'ai';

import type { SymbolResearchPacket } from '../../mastra-v2/packets/symbol-research';
import type { MastraGenerationStats } from '../../mastra-v2/shared/telemetry';
import type { GenerationLedger } from '../../persistence/generation-ledger';
import type {
  CommitteeCritique,
  MastraAnalysisMode,
  MastraModeOpinion,
  ModeRequestContext,
} from '../types';

export interface CommitteeSynthesisDeps {
  model: LanguageModel;
  modelId: string;
  providerId: string;
  /**
   * Audit plan §3.1 — optional per-agent model resolution; the fusion agent
   * requests itself by the `fusion` id. Returns null to fall back to the
   * primary run model. Never a cheaper tier (Q1).
   */
  resolveModelForAgent?: (agent: 'fusion') => {
    model: LanguageModel;
    modelId: string;
    providerId: string;
  } | null;
  /** P-01: optional so view-only canonical registrations (Studio) can run without BYOK memory. */
  memory?: MastraMemory | undefined;
  /** The fusion agent owns writes to the conversation thread. */
  fusionCallOptions?: AgentMemoryOption | undefined;
  inputProcessors?: Array<InputProcessorOrWorkflow>;
  scorers?: MastraScorers;
  ledger: GenerationLedger;
  /** Bounded single-step limit for the fusion LLM call. */
  maxSteps: number;
}

export interface CommitteeSynthesisArgs {
  mode: MastraAnalysisMode;
  prompt: string;
  packet: SymbolResearchPacket;
  opinions: MastraModeOpinion[];
  /** §3.2: peer reviews from the cross-critique round, when it ran. */
  critiques?: CommitteeCritique[];
  executionStats: MastraGenerationStats[];
  requestContext: RequestContext<ModeRequestContext>;
  signal?: AbortSignal;
  deps: CommitteeSynthesisDeps;
}

export interface CommitteeSynthesisResult {
  finalText: string;
  stats: MastraGenerationStats;
  /**
   * Audit plan §3.1 — the model the fusion pass actually used. With
   * `PHASE3_MODEL_DIVERSITY` off this equals the run's primary model id.
   */
  fusionModelId?: string;
  fusionProviderId?: string;
}

export interface CommitteeComparisonSynthesisArgs {
  prompt: string;
  /** One ready packet per compared symbol (prompt order). */
  packets: SymbolResearchPacket[];
  opinions: MastraModeOpinion[];
  executionStats: MastraGenerationStats[];
  /**
   * F-01: symbols excluded from the comparison because their packet was
   * blocked. The fusion prompt discloses them and compares the healthy
   * subset instead of failing the whole turn.
   */
  blockedSymbols?: readonly string[];
  /** F-01: the blocked packets' `missingData` lines for the disclosure. */
  blockedMissingData?: readonly string[];
  requestContext: RequestContext<ModeRequestContext>;
  signal?: AbortSignal;
  deps: CommitteeSynthesisDeps;
}
