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

// Create / update / delete services for custom agents, plus starter seeding
// and run counters.

import {
  countCustomAgents,
  createCustomAgent,
  deleteAllCustomAgents,
  deleteCustomAgent,
  getCustomAgentById,
  getCustomAgentBySlug,
  insertCustomAgentRun,
  markCustomAgentRun,
  seedCustomAgent,
  updateCustomAgent,
  type CustomAgentPatch,
} from '../../db/queries';
import type { AgentView, CreateAgentInput, UpdateAgentInput } from '../../schemas';
import { normaliseSettings } from '../../settings';
import { slugifyAgentName, validateAgentSlug } from '../../slugs';
import { AGENT_TEMPLATES, templateToAgentInput } from '../../templates';
import { AgentConfigError } from './errors';
import {
  normaliseModel,
  sanitizeMcpServers,
  sanitizeSkillRefs,
  sanitizeSkills,
  sanitizeTools,
} from './sanitizers';
import { agentView } from './views';

export interface CreateAgentArgs {
  userId: string;
  installedPluginIds: readonly string[];
  settings: Readonly<Record<string, unknown>>;
  input: CreateAgentInput;
}

export async function createAgentForUser(args: CreateAgentArgs): Promise<AgentView> {
  const settings = normaliseSettings(args.settings);
  const existingCount = await countCustomAgents(args.userId);
  if (existingCount >= settings.maxAgents) {
    throw new AgentConfigError(
      `You have reached the ${settings.maxAgents}-agent limit. Delete an agent or raise the limit in settings.`,
    );
  }
  const slug = (args.input.slug ?? slugifyAgentName(args.input.name)).trim().toLowerCase();
  const slugError = validateAgentSlug(slug);
  if (slugError) throw new AgentConfigError(slugError, 'AGENT_SLUG_INVALID');

  const row = await createCustomAgent({
    userId: args.userId,
    slug,
    name: args.input.name.trim(),
    description: args.input.description.trim(),
    instructions: args.input.instructions.trim(),
    model: normaliseModel(args.input.model ?? null, settings, args.input.model === undefined),
    tools: sanitizeTools(args.input.tools, settings, args.installedPluginIds),
    skills: sanitizeSkills(args.input.skills),
    skillRefs: sanitizeSkillRefs(args.input.skillRefs, args.installedPluginIds),
    mcpServers: sanitizeMcpServers(args.input.mcpServers, settings),
    delegatable: args.input.delegatable,
    starterTemplate: null,
  });
  return agentView(row);
}

export interface UpdateAgentArgs {
  userId: string;
  agentId: string;
  installedPluginIds: readonly string[];
  settings: Readonly<Record<string, unknown>>;
  input: UpdateAgentInput;
}

export async function updateAgentForUser(args: UpdateAgentArgs): Promise<AgentView | null> {
  const settings = normaliseSettings(args.settings);
  const existing = await getCustomAgentById(args.userId, args.agentId);
  if (!existing) return null;

  const patch: CustomAgentPatch = {};
  if (args.input.name !== undefined) patch.name = args.input.name.trim();
  if (args.input.slug !== undefined) {
    const slug = args.input.slug.trim().toLowerCase();
    const slugError = validateAgentSlug(slug);
    if (slugError) throw new AgentConfigError(slugError, 'AGENT_SLUG_INVALID');
    patch.slug = slug;
  }
  if (args.input.description !== undefined) patch.description = args.input.description.trim();
  if (args.input.instructions !== undefined) patch.instructions = args.input.instructions.trim();
  if (args.input.model !== undefined) {
    patch.model = normaliseModel(args.input.model, settings, false);
  }
  if (args.input.tools !== undefined) {
    patch.tools = sanitizeTools(args.input.tools, settings, args.installedPluginIds);
  }
  if (args.input.skills !== undefined) patch.skills = sanitizeSkills(args.input.skills);
  if (args.input.skillRefs !== undefined) {
    patch.skillRefs = sanitizeSkillRefs(args.input.skillRefs, args.installedPluginIds);
  }
  if (args.input.mcpServers !== undefined) {
    patch.mcpServers = sanitizeMcpServers(args.input.mcpServers, settings, existing.mcpServers);
  }
  if (args.input.delegatable !== undefined) patch.delegatable = args.input.delegatable;

  const updated = await updateCustomAgent(args.userId, args.agentId, patch);
  return updated ? agentView(updated) : null;
}

export async function deleteAgentForUser(userId: string, agentId: string): Promise<boolean> {
  return deleteCustomAgent(userId, agentId);
}

/** Seed the optional starter templates. Idempotent per handle. */
export async function seedStarterAgents(
  userId: string,
  rawSettings: Readonly<Record<string, unknown>>,
): Promise<number> {
  const settings = normaliseSettings(rawSettings);
  if (!settings.seedStarterAgents) return 0;
  let created = 0;
  for (const template of AGENT_TEMPLATES) {
    const existing = await getCustomAgentBySlug(userId, template.slug);
    if (existing) continue;
    await seedCustomAgent(templateToAgentInput(template, userId));
    created++;
  }
  return created;
}

/** Delete every agent for a user (uninstall with wipeData). */
export async function deleteAllAgentsForUser(userId: string): Promise<void> {
  await deleteAllCustomAgents(userId);
}

export async function recordAgentRun(
  userId: string,
  agentId: string,
  record: {
    runId: string;
    threadId: string;
    status: 'succeeded' | 'failed' | 'cancelled';
    model: string | null;
    latencyMs: number;
    costUsd: number;
    toolCalls: number;
    inputChars: number;
    outputChars: number;
    error?: string | null;
  },
): Promise<void> {
  await Promise.all([
    insertCustomAgentRun({
      userId,
      agentId,
      runId: record.runId,
      threadId: record.threadId,
      status: record.status,
      model: record.model,
      latencyMs: Math.max(0, Math.round(record.latencyMs)),
      costUsd: record.costUsd,
      toolCalls: Math.max(0, Math.round(record.toolCalls)),
      inputChars: Math.max(0, Math.round(record.inputChars)),
      outputChars: Math.max(0, Math.round(record.outputChars)),
      error: record.error ?? null,
    }),
    markCustomAgentRun(userId, agentId, record.status),
  ]);
}
