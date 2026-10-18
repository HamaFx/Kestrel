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
 * Specialist agent definitions, dedicated desk toolsets (Audit v3 Q8), and the
 * shared committee agent factory (Phase 6). Specialist definitions are
 * extracted from the workflow file so the committee, Studio registration, and
 * future capabilities all reference the same agent identities.
 */

import { Agent } from '@mastra/core/agent';
import type { MastraScorers } from '@mastra/core/evals';
import type { MastraModelConfig } from '@mastra/core/llm';
import type { MastraMemory } from '@mastra/core/memory';
import type { InputProcessorOrWorkflow } from '@mastra/core/processors';
import type { RequestContext } from '@mastra/core/request-context';
import type { LanguageModel } from 'ai';

import { adaptLegacyReadOnlyTool } from '../mastra-v2/agents/xauusd/legacy-tool-adapter';
import { resolveNativeCanonicalTool } from '../mastra-v2/tools/canonical';
import { registerAllTools, toolRegistry } from '../tools';
import {
  SPECIALIST_DESK_TOOL_NAMES,
  SPECIALIST_GOALS,
  SPECIALIST_SKILL_PLAYBOOKS,
} from './prompts';
import {
  REQUEST_CONTEXT_SCHEMA,
  type MastraSpecialistName,
  type ModeRequestContext,
} from './types';

export interface SpecialistDefinition {
  readonly name: MastraSpecialistName;
  /** Stable Mastra agent id (snapshot/telemetry identity). */
  readonly agentId: string;
  /** Specialists are read-only researchers; they never receive write tools. */
  readonly readOnly: true;
  /** Specific analytical goal for this specialist desk (Q8). */
  readonly goal: string;
  /** Domain skill playbook for this specialist desk (Q8). */
  readonly skillPlaybook: string;
  /** Dedicated read-only tool names assigned to this specialist desk (Q8). */
  readonly toolNames: readonly string[];
}

export const SPECIALIST_DEFINITIONS: Record<MastraSpecialistName, SpecialistDefinition> = {
  technical: {
    name: 'technical',
    agentId: 'kestrel-mastra-technical',
    readOnly: true,
    goal: SPECIALIST_GOALS.technical,
    skillPlaybook: SPECIALIST_SKILL_PLAYBOOKS.technical,
    toolNames: SPECIALIST_DESK_TOOL_NAMES.technical,
  },
  fundamental: {
    name: 'fundamental',
    agentId: 'kestrel-mastra-fundamental',
    readOnly: true,
    goal: SPECIALIST_GOALS.fundamental,
    skillPlaybook: SPECIALIST_SKILL_PLAYBOOKS.fundamental,
    toolNames: SPECIALIST_DESK_TOOL_NAMES.fundamental,
  },
  risk: {
    name: 'risk',
    agentId: 'kestrel-mastra-risk',
    readOnly: true,
    goal: SPECIALIST_GOALS.risk,
    skillPlaybook: SPECIALIST_SKILL_PLAYBOOKS.risk,
    toolNames: SPECIALIST_DESK_TOOL_NAMES.risk,
  },
  sentiment: {
    name: 'sentiment',
    agentId: 'kestrel-mastra-sentiment',
    readOnly: true,
    goal: SPECIALIST_GOALS.sentiment,
    skillPlaybook: SPECIALIST_SKILL_PLAYBOOKS.sentiment,
    toolNames: SPECIALIST_DESK_TOOL_NAMES.sentiment,
  },
};

export { SPECIALIST_DESK_TOOL_NAMES };

/**
 * Resolve and adapt the dedicated read-only Mastra toolset for a specialist
 * desk (Audit v3 Phase 4, Owner Decision Q8).
 *
 * P2-01 (audit 2026-10-18) — each name prefers its native Mastra
 * registration; unmigrated names keep the legacy registry + adapter path.
 * This keeps the desks intact when the legacy shims are disabled
 * (`PHASE_TOOLS_SHIMS=0`) and matches how canonical-chat resolves tools.
 */
export function resolveSpecialistDeskTools(
  name: MastraSpecialistName,
  disabledTools?: readonly string[] | null,
): Record<string, unknown> {
  registerAllTools(toolRegistry);
  const disabled = new Set(disabledTools ?? []);
  const toolNames = SPECIALIST_DESK_TOOL_NAMES[name].filter((t) => !disabled.has(t));
  const legacyTools = toolRegistry.resolve([...toolNames]);
  const resolved: Record<string, unknown> = {};
  for (const toolName of toolNames) {
    const native = resolveNativeCanonicalTool(toolName);
    if (native) {
      resolved[toolName] = native;
      continue;
    }
    const legacyTool = legacyTools[toolName];
    if (legacyTool) resolved[toolName] = adaptLegacyReadOnlyTool(toolName, legacyTool);
  }
  return resolved;
}

/** Sole write-capable committee layer: the decision synthesizer. */
export const FUSION_AGENT_ID = 'kestrel-mastra-decision';

/**
 * Committee agent instructions. §2.2: a function form reads the packet (and
 * opinions) from the request context so prompts are built per call from the
 * single injected context instead of pre-serialized strings.
 */
export type CommitteeInstructions =
  string | ((args: { requestContext: RequestContext<ModeRequestContext> }) => string);

/**
 * P-01 (audit 2026-10-18) — Mastra's Agent generics cannot infer the runtime
 * tool record; this helper is the single documented cast for that slot.
 */
function agentToolsArg(tools: Record<string, unknown>): never {
  return tools as never;
}

export function createCommitteeAgent(
  model: LanguageModel,
  id: string,
  instructions: CommitteeInstructions,
  memory?: MastraMemory,
  inputProcessors?: Array<InputProcessorOrWorkflow>,
  scorers?: MastraScorers,
  tools?: Record<string, unknown>,
) {
  return new Agent({
    id,
    name: id,
    description: 'Read-only Mastra market research agent.',
    model: model as unknown as MastraModelConfig,
    instructions,
    requestContextSchema: REQUEST_CONTEXT_SCHEMA,
    ...(tools && Object.keys(tools).length > 0 ? { tools: agentToolsArg(tools) } : {}),
    ...(inputProcessors && inputProcessors.length > 0 ? { inputProcessors } : {}),
    ...(memory ? { memory } : {}),
    ...(scorers && Object.keys(scorers).length > 0 ? { scorers } : {}),
  });
}
