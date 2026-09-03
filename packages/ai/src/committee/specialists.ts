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
 * Specialist agent definitions and the shared committee agent factory
 * (Phase 6). Specialist definitions are extracted from the workflow file so
 * the committee, Studio registration, and future capabilities all reference
 * the same agent identities.
 */

import { Agent } from '@mastra/core/agent';
import type { MastraScorers } from '@mastra/core/evals';
import type { MastraMemory } from '@mastra/core/memory';
import type { InputProcessorOrWorkflow } from '@mastra/core/processors';
import type { LanguageModel } from 'ai';

import { REQUEST_CONTEXT_SCHEMA, type MastraSpecialistName } from './types';

export interface SpecialistDefinition {
  readonly name: MastraSpecialistName;
  /** Stable Mastra agent id (snapshot/telemetry identity). */
  readonly agentId: string;
  /** Specialists are read-only researchers; they never receive write tools. */
  readonly readOnly: true;
}

export const SPECIALIST_DEFINITIONS: Record<MastraSpecialistName, SpecialistDefinition> = {
  technical: { name: 'technical', agentId: 'kestrel-mastra-technical', readOnly: true },
  fundamental: { name: 'fundamental', agentId: 'kestrel-mastra-fundamental', readOnly: true },
  risk: { name: 'risk', agentId: 'kestrel-mastra-risk', readOnly: true },
  sentiment: { name: 'sentiment', agentId: 'kestrel-mastra-sentiment', readOnly: true },
};

/** Sole write-capable committee layer: the decision synthesizer. */
export const FUSION_AGENT_ID = 'kestrel-mastra-decision';

export function createCommitteeAgent(
  model: LanguageModel,
  id: string,
  instructions: string,
  memory?: MastraMemory,
  inputProcessors?: Array<InputProcessorOrWorkflow>,
  scorers?: MastraScorers,
) {
  return new Agent({
    id,
    name: id,
    description: 'Read-only Mastra market research agent.',
    model,
    instructions,
    requestContextSchema: REQUEST_CONTEXT_SCHEMA,
    ...(inputProcessors && inputProcessors.length > 0 ? { inputProcessors } : {}),
    ...(memory ? { memory } : {}),
    ...(scorers && Object.keys(scorers).length > 0 ? { scorers } : {}),
  });
}
