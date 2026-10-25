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

// Public plugin contract — standalone agents and per-user agent catalogs.

import type { PluginExecutionContext } from './core';
import type { PluginSkillInput } from './tools';

export interface PluginStandaloneAgentRegistration {
  /** Stable agent id, e.g. `ict-sniper`. */
  id: string;
  name: string;
  description: string;
  instructions: string | ((ctx: PluginExecutionContext) => string | Promise<string>);
  /** Tool ids (core or plugin) the standalone agent may call. */
  tools?: readonly string[];
  skills?: readonly PluginSkillInput[];
  /** Optional model pin (`provider/model`). */
  model?: string;
}

/**
 * Remote Model Context Protocol server attached to a user-defined agent.
 *
 * `authorization` is already decrypted by the owning catalog before it is
 * returned to the core runtime; it is never persisted in plaintext.
 */
export interface PluginUserAgentMcpServer {
  /** Stable id within the agent, used as the MCP tool namespace. */
  id: string;
  /** `https://…` endpoint (http is allowed only for local/dev hosts). */
  url: string;
  /** Optional `Authorization` header value, e.g. `Bearer …`. */
  authorization?: string;
}

/**
 * A user-authored standalone agent exposed by a plugin catalog.
 *
 * Unlike `PluginStandaloneAgentRegistration` (which is a static, code-defined
 * agent bundled with a plugin), these definitions are per-user data: the core
 * resolves them on demand, builds a real Mastra `Agent`, and never adds them
 * to the 4-Desk Committee.
 */
export interface PluginUserAgentDefinition {
  /** Stable catalog-local id (usually a UUID). */
  id: string;
  /** `@handle` used in chat and Telegram, e.g. `ict-mentor`. */
  slug: string;
  name: string;
  description: string;
  instructions: string;
  /** Selected core and/or installed-plugin tool ids. */
  tools: readonly string[];
  /** Skills already resolved to inline objects or `SKILL.md` paths. */
  skills?: readonly PluginSkillInput[];
  /** Optional pinned model (`provider:model`). */
  model?: string | null;
  mcpServers?: readonly PluginUserAgentMcpServer[];
  /** Allow the canonical chat agent to delegate work to this agent. */
  delegatable: boolean;
  /** Opaque catalog metadata (template id, run count, timestamps, …). */
  metadata?: Readonly<Record<string, unknown>>;
}

/** Context passed to a catalog for one user. Mirrors a plugin execution context. */
export interface PluginUserAgentCatalogContext extends PluginExecutionContext {
  /** Enabled plugin ids for this user, so the catalog can resolve plugin skills/tools. */
  installedPluginIds: readonly string[];
}

export interface PluginUserAgentRunRecord {
  ctx: PluginUserAgentCatalogContext;
  agent: PluginUserAgentDefinition;
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
}

/**
 * Server-side catalog that lets a plugin expose per-user standalone agents.
 *
 * The core never imports a plugin package directly: it asks every installed
 * plugin's catalogs for the user's agents, then builds Mastra agents from the
 * returned definitions. A catalog owns its persistence and its own secrets.
 */
export interface PluginUserAgentCatalog {
  /** Stable kebab-case catalog id within the plugin. */
  id: string;
  listAgents(ctx: PluginUserAgentCatalogContext): Promise<readonly PluginUserAgentDefinition[]>;
  getAgent(
    ctx: PluginUserAgentCatalogContext,
    slug: string,
  ): Promise<PluginUserAgentDefinition | null>;
  /**
   * Resolve tools from the definition's MCP servers. Implemented by the
   * catalog so the core never depends on an MCP client package.
   */
  resolveMcpTools?(args: {
    ctx: PluginUserAgentCatalogContext;
    agent: PluginUserAgentDefinition;
    signal?: AbortSignal;
  }): Promise<Record<string, unknown> | null>;
  /** Best-effort run ledger hook, called once a standalone run terminates. */
  recordRun?(record: PluginUserAgentRunRecord): Promise<void>;
}
