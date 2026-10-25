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

// Per-user standalone-agent catalogs: descriptor discovery and sanitization.

import {
  pluginHost,
  type PluginInlineSkill,
  type PluginUserAgentDefinition,
  type RegisteredPluginUserAgentCatalog,
} from '@kestrel/plugin-sdk';

import {
  CANONICAL_PUBLIC_READ_ONLY_TOOL_NAMES,
  SENSITIVE_USER_READ_TOOL_NAMES,
} from '../mastra-v2/capabilities/tool-names';
import { alog } from './agent-log';
import {
  createPluginExecutionContext,
  pluginSettingsFor,
  type InstalledPluginRuntime,
} from './runtime';

const SLUG_RE = /^[a-z][a-z0-9-]{1,31}$/;
const RESERVED_SLUGS = new Set([
  'agent',
  'assistant',
  'committee',
  'core',
  'kestrel',
  'system',
  'custom-agent',
  'custom-agents',
]);
const MENTION_RE = /^\s*@([a-z][a-z0-9-]{1,31})(?=\s|$)/;
const MAX_AGENT_TOOLS = 40;
const MAX_INSTRUCTIONS_CHARS = 24_000;
const MAX_SKILLS = 12;
export const MAX_SKILL_CHARS = 24_000;
export const MAX_SUBAGENTS = 10;
export const MCP_TIMEOUT_MS = 15_000;

/**
 * Tools a user-authored agent may ever select (lazy: the capability manifest
 * imports this package, so computing it at module init creates a cycle).
 */
let customAgentCoreToolSet: Set<string> | null = null;
export function customAgentCoreTools(): Set<string> {
  customAgentCoreToolSet ??= new Set<string>([
    ...CANONICAL_PUBLIC_READ_ONLY_TOOL_NAMES,
    ...SENSITIVE_USER_READ_TOOL_NAMES,
  ]);
  return customAgentCoreToolSet;
}

export interface CustomAgentDescriptor {
  pluginId: string;
  catalogId: string;
  catalog: RegisteredPluginUserAgentCatalog;
  agent: PluginUserAgentDefinition;
}

export interface CustomAgentMention {
  slug: string;
  /** Text with the leading `@handle` removed. */
  prompt: string;
}

/** Parse a leading `@handle` and return the prompt without it. */
export function parseCustomAgentMention(text: string): CustomAgentMention | null {
  const match = MENTION_RE.exec(text);
  if (!match) return null;
  const slug = match[1];
  if (!slug || RESERVED_SLUGS.has(slug)) return null;
  return { slug, prompt: text.slice(match[0].length).trim() };
}

/** True when the text begins with the given handle; strips it when present. */
export function stripCustomAgentMention(text: string, slug: string): string {
  const mention = parseCustomAgentMention(text);
  if (mention?.slug === slug) return mention.prompt;
  return text.trim();
}

export function buildCatalogContext(runtime: InstalledPluginRuntime, pluginId: string) {
  return {
    ...createPluginExecutionContext({
      userId: runtime.userId,
      tenantId: runtime.tenantId ?? '',
      pluginId,
      settings: pluginSettingsFor(runtime, pluginId),
    }),
    installedPluginIds: runtime.installedPluginIds,
  };
}

function sanitizeDefinition(raw: PluginUserAgentDefinition): PluginUserAgentDefinition | null {
  if (!raw || typeof raw !== 'object') return null;
  const slug = typeof raw.slug === 'string' ? raw.slug.trim().toLowerCase() : '';
  if (!SLUG_RE.test(slug) || RESERVED_SLUGS.has(slug)) return null;
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 120) : '';
  const instructions = typeof raw.instructions === 'string' ? raw.instructions.trim() : '';
  if (!name || !instructions) return null;
  const tools = Array.isArray(raw.tools)
    ? [...new Set(raw.tools.filter((tool): tool is string => typeof tool === 'string'))].slice(
        0,
        MAX_AGENT_TOOLS,
      )
    : [];
  const skills = Array.isArray(raw.skills)
    ? raw.skills.filter((skill): skill is PluginInlineSkill | string => {
        if (typeof skill === 'string') return skill.trim().length > 0;
        return Boolean(
          skill &&
          typeof skill === 'object' &&
          typeof skill.name === 'string' &&
          typeof skill.description === 'string' &&
          typeof skill.instructions === 'string',
        );
      })
    : [];
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim().slice(0, 128) : slug,
    slug,
    name,
    description: typeof raw.description === 'string' ? raw.description.trim().slice(0, 1_000) : '',
    instructions: instructions.slice(0, MAX_INSTRUCTIONS_CHARS),
    tools,
    ...(skills.length > 0 ? { skills: skills.slice(0, MAX_SKILLS) } : {}),
    model:
      typeof raw.model === 'string' && raw.model.trim() ? raw.model.trim().slice(0, 160) : null,
    ...(Array.isArray(raw.mcpServers)
      ? {
          mcpServers: raw.mcpServers
            .filter(
              (server) => server && typeof server === 'object' && typeof server.url === 'string',
            )
            .slice(0, 5),
        }
      : {}),
    delegatable: raw.delegatable === true,
    ...(raw.metadata && typeof raw.metadata === 'object' ? { metadata: raw.metadata } : {}),
  };
}

/** True when an installed plugin exposes at least one user-agent catalog. */
export function hasUserAgentCatalogs(runtime: InstalledPluginRuntime): boolean {
  if (!runtime.tenantId || runtime.installedPluginIds.length === 0) return false;
  return pluginHost.resolveAgentCatalogsForUser(runtime.installedPluginIds).length > 0;
}

/** All user-authored agents across installed plugin catalogs. */
export async function listUserCustomAgents(
  runtime: InstalledPluginRuntime,
): Promise<CustomAgentDescriptor[]> {
  if (!runtime.tenantId || runtime.installedPluginIds.length === 0) return [];
  const catalogs = pluginHost.resolveAgentCatalogsForUser(runtime.installedPluginIds);
  if (catalogs.length === 0) return [];

  const seen = new Set<string>();
  const out: CustomAgentDescriptor[] = [];
  for (const catalog of catalogs) {
    const ctx = buildCatalogContext(runtime, catalog.pluginId);
    let agents: readonly PluginUserAgentDefinition[];
    try {
      agents = await catalog.listAgents(ctx);
    } catch (err) {
      alog.warn('agent catalog failed; skipping its agents', {
        pluginId: catalog.pluginId,
        catalog: catalog.id,
        err: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    for (const raw of agents) {
      const agent = sanitizeDefinition(raw);
      if (!agent || seen.has(agent.slug)) continue;
      seen.add(agent.slug);
      out.push({
        pluginId: catalog.pluginId,
        catalogId: catalog.id,
        catalog,
        agent,
      });
    }
  }
  return out;
}

/** Resolve one user-authored agent by `@handle`. */
export async function resolveUserCustomAgent(
  runtime: InstalledPluginRuntime,
  slug: string,
): Promise<CustomAgentDescriptor | null> {
  const normalized = slug.trim().toLowerCase();
  if (!SLUG_RE.test(normalized)) return null;
  const agents = await listUserCustomAgents(runtime);
  return agents.find((entry) => entry.agent.slug === normalized) ?? null;
}
