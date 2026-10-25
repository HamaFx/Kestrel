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

// Critique/debate dependency and argument shapes (DEC-05 split from
// critique.ts).

import type { AgentMemoryOption } from '@mastra/core/agent';
import type { MastraScorers } from '@mastra/core/evals';
import type { MastraMemory } from '@mastra/core/memory';
import type { InputProcessorOrWorkflow } from '@mastra/core/processors';
import type { RequestContext } from '@mastra/core/request-context';
import type { LanguageModel } from 'ai';

import type { SymbolResearchPacket } from '../../mastra-v2/packets/symbol-research';
import type { GenerationLedger } from '../../persistence/generation-ledger';
import type {
  CommitteeAgentId,
  CommitteeCritique,
  MastraModeOpinion,
  MastraSpecialistName,
  ModeRequestContext,
} from '../types';

export interface CritiqueRunnerDeps {
  model: LanguageModel;
  modelId: string;
  providerId: string;
  /** §3.1: optional per-agent top-tier model resolution. */
  resolveModelForAgent?: (agent: CommitteeAgentId) => {
    model: LanguageModel;
    modelId: string;
    providerId: string;
  } | null;
  /** P-01: optional so view-only canonical registrations (Studio) can run without BYOK memory. */
  memory?: MastraMemory | undefined;
  specialistCallOptions?: AgentMemoryOption | undefined;
  inputProcessors?: Array<InputProcessorOrWorkflow>;
  scorers?: MastraScorers;
  ledger: GenerationLedger;
  maxSteps: number;
}

export interface RunCritiqueGenerationArgs {
  name: MastraSpecialistName;
  prompt: string;
  packet: SymbolResearchPacket;
  /** The desk's own verified opinion, restated in the prompt (§1.7 P1-1). */
  ownOpinion: MastraModeOpinion;
  /** The other desks' verified opinions (never raw packet data). */
  peerOpinions: MastraModeOpinion[];
  requestContext: RequestContext<ModeRequestContext>;
  signal?: AbortSignal;
  startedAt: number;
  deps: CritiqueRunnerDeps;
}

export interface RunDebateRevisionArgs {
  name: MastraSpecialistName;
  prompt: string;
  packet: SymbolResearchPacket;
  /** The desk's own verified first-round opinion. */
  ownOpinion: MastraModeOpinion;
  /** Every critique from the cross-critique round (own + peers). */
  critiques: CommitteeCritique[];
  requestContext: RequestContext<ModeRequestContext>;
  signal?: AbortSignal;
  startedAt: number;
  deps: CritiqueRunnerDeps;
}
