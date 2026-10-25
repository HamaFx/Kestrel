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

// Domain services for custom agents: validation, views, the plugin-host
// catalog, starter seeding, and run counters.

import { pluginHost } from '@kestrel/plugin-sdk';

import {
  countCustomAgents,
  createCustomAgent,
  deleteAllCustomAgents,
  deleteCustomAgent,
  getCustomAgentById,
  getCustomAgentBySlug,
  insertCustomAgentRun,
  listCustomAgentRuns,
  listCustomAgents,
  markCustomAgentRun,
  seedCustomAgent,
  updateCustomAgent,
  type CustomAgentPatch,
} from '../db/queries';
import type { CustomAgentRow, StoredMcpServer } from '../db/tables';
import type {
  AgentRunView,
  AgentView,
  CreateAgentInput,
  CustomSkill,
  McpServerInput,
  SkillRef,
  UpdateAgentInput,
} from '../schemas';
import type { CustomAgentSettings } from '../settings';
import { normaliseSettings } from '../settings';
import { slugifyAgentName, validateAgentSlug } from '../slugs';
import { AGENT_TEMPLATES, templateToAgentInput } from '../templates';
import {
  decryptMcpServers,
  prepareMcpServers,
  resolveMcpTools,
  validateMcpUrl,
} from './mcp';
import { resolveSkillRefs } from './skills';

export class AgentConfigError extends Error {
  constructor(
    message: string,
    readonly code = 'AGENT_CONFIG_INVALID',
  ) {
    super(message);
    this.name = 'AgentConfigError';
  }
}

const MODEL_RE = /^[a-z0-9][a-z0-9._-]*:[^\s:]+$/i;

function normaliseModel(
  value: string | null,
  settings: CustomAgentSettings,
  useDefault: boolean,
): string | null {
  const raw = value === undefined && useDefault ? settings.defaultModel : value;
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return null;
  if (!MODEL_RE.test(trimmed)) {
    throw new AgentConfigError('Model must use the provider:model format, e.g. deepseek:deepseek-chat.');
  }
  return trimmed;
}

function pluginToolMap(installedPluginIds: readonly string[]) {
  const map = new Map<string, { pluginId: string; access: string }>();
  for (const tool of pluginHost.resolveToolsForUser(installedPluginIds)) {
    map.set(tool.name, { pluginId: tool.pluginId, access: tool.access });
  }
  return map;
}

function coreToolNames(): Set<string> {
  return new Set(pluginHost.getCoreTools().map((tool) => tool.name));
}

function sanitizeTools(
  tools: readonly string[],
  settings: CustomAgentSettings,
  installedPluginIds: readonly string[],
): string[] {
  const core = coreToolNames();
  const plugins = pluginToolMap(installedPluginIds);
  const out: string[] = [];
  for (const name of [...new Set(tools)]) {
    if (core.has(name)) {
      out.push(name);
      continue;
    }
    const plugin = plugins.get(name);
    if (!plugin) {
      throw new AgentConfigError(`Tool "${name}" is not available. Install the owning plugin first.`);
    }
    if (plugin.access === 'write' && !settings.allowWriteTools) {
      throw new AgentConfigError(
        `Tool "${name}" can change data. Enable "Allow write tools" in Custom Agents settings first.`,
      );
    }
    out.push(name);
  }
  return out.slice(0, 40);
}

function sanitizeSkills(skills: readonly CustomSkill[]): CustomSkill[] {
  const seen = new Set<string>();
  const out: CustomSkill[] = [];
  for (const skill of skills) {
    if (seen.has(skill.name)) {
      throw new AgentConfigError(`Skill "${skill.name}" is duplicated.`);
    }
    seen.add(skill.name);
    out.push({
      name: skill.name,
      description: skill.description,
      instructions: skill.instructions,
      ...(skill.references ? { references: skill.references } : {}),
    });
  }
  return out.slice(0, 12);
}

function sanitizeSkillRefs(
  refs: readonly SkillRef[],
  installedPluginIds: readonly string[],
): SkillRef[] {
  const installed = new Set(installedPluginIds);
  const seen = new Set<string>();
  const out: SkillRef[] = [];
  for (const ref of refs) {
    if (!installed.has(ref.pluginId)) continue;
    const key = `${ref.pluginId}:${ref.skill}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ pluginId: ref.pluginId, skill: ref.skill });
  }
  return out.slice(0, 24);
}

function sanitizeMcpServers(
  servers: readonly McpServerInput[],
  settings: CustomAgentSettings,
  existing: readonly StoredMcpServer[] = [],
): StoredMcpServer[] {
  if (servers.length === 0) return [];
  if (!settings.allowMcp) {
    throw new AgentConfigError('Remote MCP servers are disabled in Custom Agents settings.');
  }
  if (servers.length > settings.maxMcpServers) {
    throw new AgentConfigError(
      `At most ${settings.maxMcpServers} MCP servers are allowed per agent.`,
    );
  }
  for (const server of servers) validateMcpUrl(server.url);
  return prepareMcpServers(servers, existing);
}

export function agentView(row: CustomAgentRow): AgentView {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    model: row.model,
    tools: Array.isArray(row.tools) ? row.tools : [],
    skills: Array.isArray(row.skills) ? row.skills : [],
    skillRefs: Array.isArray(row.skillRefs) ? row.skillRefs : [],
    mcpServers: (Array.isArray(row.mcpServers) ? row.mcpServers : []).map((server) => ({
      id: server.id,
      url: server.url,
      hasAuthorization: Boolean(server.authorization),
    })),
    delegatable: row.delegatable,
    starterTemplate: row.starterTemplate,
    runCount: row.runCount,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listAgentViews(
  userId: string,
  options: { query?: string; delegatableOnly?: boolean } = {},
): Promise<AgentView[]> {
  const rows = await listCustomAgents(userId);
  const query = options.query?.trim().toLowerCase();
  return rows
    .filter((row) => (options.delegatableOnly ? row.delegatable : true))
    .filter((row) =>
      query
        ? row.name.toLowerCase().includes(query) ||
          row.slug.includes(query) ||
          row.description.toLowerCase().includes(query)
        : true,
    )
    .map(agentView);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getAgentView(userId: string, ref: string): Promise<AgentView | null> {
  const bySlug = await getCustomAgentBySlug(userId, ref.trim().toLowerCase());
  if (bySlug) return agentView(bySlug);
  if (!UUID_RE.test(ref)) return null;
  const byId = await getCustomAgentById(userId, ref);
  return byId ? agentView(byId) : null;
}

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
    model: normaliseModel(
      args.input.model ?? null,
      settings,
      args.input.model === undefined,
    ),
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
    patch.mcpServers = sanitizeMcpServers(
      args.input.mcpServers,
      settings,
      existing.mcpServers,
    );
  }
  if (args.input.delegatable !== undefined) patch.delegatable = args.input.delegatable;

  const updated = await updateCustomAgent(args.userId, args.agentId, patch);
  return updated ? agentView(updated) : null;
}

export async function deleteAgentForUser(userId: string, agentId: string): Promise<boolean> {
  return deleteCustomAgent(userId, agentId);
}

export async function listAgentRunViews(
  userId: string,
  agentId: string,
  limit = 20,
): Promise<AgentRunView[]> {
  const rows = await listCustomAgentRuns(userId, agentId, limit);
  return rows.map((row) => ({
    id: row.id,
    runId: row.runId,
    threadId: row.threadId,
    status:
      row.status === 'failed' || row.status === 'cancelled'
        ? row.status
        : 'succeeded',
    model: row.model,
    latencyMs: row.latencyMs,
    costUsd: row.costUsd,
    toolCalls: row.toolCalls,
    inputChars: row.inputChars,
    outputChars: row.outputChars,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  }));
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

/**
 * Convert a stored row into the runtime definition the AI package consumes.
 * Missing plugin skills/MCP are dropped rather than failing the whole agent.
 */
export function runtimeDefinition(
  row: CustomAgentRow,
  installedPluginIds: readonly string[],
  rawSettings: Readonly<Record<string, unknown>>,
) {
  const settings = normaliseSettings(rawSettings);
  const pluginTools = pluginToolMap(installedPluginIds);
  const tools = (Array.isArray(row.tools) ? row.tools : []).filter((name) => {
    const plugin = pluginTools.get(name);
    if (!plugin) return true; // core tool (validated by the AI builder)
    if (plugin.access === 'write' && !settings.allowWriteTools) return false;
    return true;
  });
  const mcpServers = settings.allowMcp
    ? decryptMcpServers(row.mcpServers).slice(0, settings.maxMcpServers)
    : [];
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    tools,
    skills: [
      ...(Array.isArray(row.skills) ? row.skills : []).map((skill) => ({
        name: skill.name,
        description: skill.description,
        instructions: skill.instructions,
        ...(skill.references ? { references: skill.references } : {}),
      })),
      ...resolveSkillRefs(row.skillRefs, installedPluginIds),
    ],
    model: row.model,
    mcpServers,
    delegatable: row.delegatable && settings.maxDelegatedAgents > 0,
    metadata: {
      starterTemplate: row.starterTemplate,
      runCount: row.runCount,
      updatedAt: row.updatedAt.toISOString(),
    },
  };
}

/** Resolve MCP tools for a runtime definition. */
export async function resolveRuntimeMcpTools(
  definition: { mcpServers?: readonly { id: string; url: string; authorization?: string }[] },
  signal?: AbortSignal,
  logger?: { warn(message: string, fields?: Record<string, unknown>): void },
): Promise<Record<string, unknown>> {
  return resolveMcpTools({
    servers: definition.mcpServers ?? [],
    ...(signal ? { signal } : {}),
    ...(logger ? { logger } : {}),
  });
}
