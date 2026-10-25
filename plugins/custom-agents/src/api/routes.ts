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

// Authenticated Custom Agents HTTP routes.
//
// Mounted at /api/plugins/custom-agents/<path> by the core dispatcher.

import { getInstalledPluginIdsForUser } from '@kestrel/db';
import {
  pluginHost,
  type PluginApiRouteContext,
  type PluginApiRouteHandler,
} from '@kestrel/plugin-sdk';
import type { z } from 'zod';

import { AgentSlugTakenError } from '../db/queries';
import {
  CatalogOutputSchema,
  CreateAgentInputSchema,
  ImportAgentMarkdownInputSchema,
  ListAgentsOutputSchema,
  UpdateAgentInputSchema,
  ValidateSkillInputSchema,
} from '../schemas';
import {
  AgentConfigError,
  createAgentForUser,
  deleteAgentForUser,
  getAgentView,
  listAgentViews,
  updateAgentForUser,
} from '../services/agents';
import { McpConfigError } from '../services/mcp';
import {
  listAvailablePluginSkills,
  parseAgentMarkdown,
  validateSkillMarkdown,
} from '../services/skills';
import { normaliseSettings } from '../settings';
import { AGENT_TEMPLATES, findAgentTemplate } from '../templates';

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = 'CUSTOM_AGENTS_ERROR',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

function errorResponse(err: unknown, ctx: PluginApiRouteContext): Response {
  if (err instanceof ApiError) {
    return json({ error: { code: err.code, message: err.message } }, err.status);
  }
  if (err instanceof AgentSlugTakenError) {
    return json({ error: { code: err.code, message: err.message } }, 409);
  }
  if (err instanceof AgentConfigError || err instanceof McpConfigError) {
    return json({ error: { code: err.code, message: err.message } }, 400);
  }
  ctx.log.error('custom agents api route failed', {
    err: err instanceof Error ? err.message : String(err),
  });
  return json(
    {
      error: {
        code: 'CUSTOM_AGENTS_FAILED',
        message: 'The Agent Studio could not complete this request.',
      },
    },
    500,
  );
}

function wrap(handler: (ctx: PluginApiRouteContext) => Promise<Response>): PluginApiRouteHandler {
  return async (ctx) => {
    try {
      return await handler(ctx);
    } catch (err) {
      return errorResponse(err, ctx);
    }
  };
}

function byMethod(handlers: Partial<Record<string, PluginApiRouteHandler>>): PluginApiRouteHandler {
  return async (ctx) => {
    const handler = handlers[ctx.request.method.toUpperCase()];
    if (!handler) {
      return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } }, 405);
    }
    return handler(ctx);
  };
}

async function parseBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(400, 'Request body must be valid JSON.', 'INVALID_JSON');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; ');
    throw new ApiError(400, message, 'INVALID_INPUT');
  }
  return parsed.data;
}

function query(request: Request): URLSearchParams {
  return new URL(request.url).searchParams;
}

async function installedIds(userId: string): Promise<string[]> {
  return getInstalledPluginIdsForUser(userId, { enabledOnly: true });
}

// ── Agents ───────────────────────────────────────────────────────────────

const listAgents = wrap(async (ctx) => {
  const params = query(ctx.request);
  const agents = await listAgentViews(ctx.userId, {
    ...(params.get('q') ? { query: params.get('q')! } : {}),
    delegatableOnly: params.get('delegatable') === '1',
  });
  return json(ListAgentsOutputSchema.parse({ agents, count: agents.length }));
});

const createAgent = wrap(async (ctx) => {
  const input = await parseBody(ctx.request, CreateAgentInputSchema);
  const settings = normaliseSettings(ctx.settings);
  const agent = await createAgentForUser({
    userId: ctx.userId,
    installedPluginIds: await installedIds(ctx.userId),
    settings: ctx.settings,
    input,
  });
  return json(
    {
      ok: true,
      message: `Created @${agent.slug}.`,
      agent,
      limits: { maxAgents: settings.maxAgents },
    },
    201,
  );
});

const getAgent = wrap(async (ctx) => {
  const ref = ctx.params['agentId'];
  if (!ref) throw new ApiError(400, 'An agent id or handle is required.', 'MISSING_AGENT');
  const agent = await getAgentView(ctx.userId, ref);
  if (!agent) throw new ApiError(404, 'Agent not found.', 'AGENT_NOT_FOUND');
  return json({ agent });
});

const updateAgent = wrap(async (ctx) => {
  const ref = ctx.params['agentId'];
  if (!ref) throw new ApiError(400, 'An agent id or handle is required.', 'MISSING_AGENT');
  const existing = await getAgentView(ctx.userId, ref);
  if (!existing) throw new ApiError(404, 'Agent not found.', 'AGENT_NOT_FOUND');
  const input = await parseBody(ctx.request, UpdateAgentInputSchema);
  const agent = await updateAgentForUser({
    userId: ctx.userId,
    agentId: existing.id,
    installedPluginIds: await installedIds(ctx.userId),
    settings: ctx.settings,
    input,
  });
  if (!agent) throw new ApiError(404, 'Agent not found.', 'AGENT_NOT_FOUND');
  return json({ ok: true, message: `Updated @${agent.slug}.`, agent });
});

const deleteAgent = wrap(async (ctx) => {
  const ref = ctx.params['agentId'];
  if (!ref) throw new ApiError(400, 'An agent id or handle is required.', 'MISSING_AGENT');
  const existing = await getAgentView(ctx.userId, ref);
  if (!existing) throw new ApiError(404, 'Agent not found.', 'AGENT_NOT_FOUND');
  const deleted = await deleteAgentForUser(ctx.userId, existing.id);
  if (!deleted) throw new ApiError(404, 'Agent not found.', 'AGENT_NOT_FOUND');
  return json({ ok: true, message: `Deleted @${existing.slug}.` });
});

// ── Catalog / knowledge ──────────────────────────────────────────────────

const catalog = wrap(async (ctx) => {
  const settings = normaliseSettings(ctx.settings);
  const ids = await installedIds(ctx.userId);
  const pluginTools = pluginHost.resolveToolsForUser(ids).map((tool) => ({
    name: tool.name,
    description: tool.description,
    access: tool.access,
    group: 'plugins' as const,
    source: 'plugin' as const,
    pluginId: tool.pluginId,
  }));
  const coreTools = pluginHost.getCoreTools().map((tool) => ({
    name: tool.name,
    description: tool.description,
    access: tool.access,
    group: tool.group,
    source: 'core' as const,
  }));
  const pluginSkills = listAvailablePluginSkills(ids).map((skill) => ({
    pluginId: skill.pluginId,
    pluginName: skill.pluginName,
    name: skill.name,
    description: skill.description,
  }));
  const payload = CatalogOutputSchema.parse({
    coreTools,
    pluginTools,
    pluginSkills,
    templates: AGENT_TEMPLATES.map((template) => ({
      id: template.id,
      name: template.name,
      slug: template.slug,
      description: template.description,
      instructions: template.instructions,
      model: template.model,
      tools: [...template.tools],
      delegatable: template.delegatable,
    })),
    settings: {
      allowWriteTools: settings.allowWriteTools,
      allowMcp: settings.allowMcp,
      maxMcpServers: settings.maxMcpServers,
      maxAgents: settings.maxAgents,
      defaultModel: settings.defaultModel,
    },
  });
  return json(payload);
});

const validateSkill = wrap(async (ctx) => {
  const input = await parseBody(ctx.request, ValidateSkillInputSchema);
  const result = validateSkillMarkdown(input.content, input.name);
  return json(result);
});

const importAgentMarkdown = wrap(async (ctx) => {
  const input = await parseBody(ctx.request, ImportAgentMarkdownInputSchema);
  const parsed = parseAgentMarkdown(input.content);
  if (!parsed) throw new ApiError(400, 'The file is empty or not Markdown.', 'INVALID_AGENT_MD');
  return json(parsed);
});

const installTemplate = wrap(async (ctx) => {
  const templateId = ctx.params['templateId'];
  const template = templateId ? findAgentTemplate(templateId) : undefined;
  if (!template) throw new ApiError(404, 'Template not found.', 'TEMPLATE_NOT_FOUND');
  const agent = await createAgentForUser({
    userId: ctx.userId,
    installedPluginIds: await installedIds(ctx.userId),
    settings: ctx.settings,
    input: {
      name: template.name,
      slug: template.slug,
      description: template.description,
      instructions: template.instructions,
      model: template.model,
      tools: [...template.tools],
      skills: [],
      skillRefs: [...template.skillRefs],
      mcpServers: [],
      delegatable: template.delegatable,
    },
  });
  return json({ ok: true, message: `Added @${agent.slug}.`, agent }, 201);
});

export const customAgentsApiRoutes: Readonly<Record<string, PluginApiRouteHandler>> = {
  '/agents': byMethod({ GET: listAgents, POST: createAgent }),
  '/agents/:agentId': byMethod({ GET: getAgent, PATCH: updateAgent, DELETE: deleteAgent }),
  '/catalog': byMethod({ GET: catalog }),
  '/skills/validate': byMethod({ POST: validateSkill }),
  '/import-agent-md': byMethod({ POST: importAgentMarkdown }),
  '/templates/:templateId': byMethod({ POST: installTemplate }),
};
