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

// Public plugin contract.
//
// A Kestrel plugin is a *declarative capability bundle*: it never reaches
// into core tables or app internals directly. The host gives it a per-user
// execution context (settings, storage, logger) and the core resolves only
// the tools / skills / jobs / UI slots belonging to plugins the user has
// installed.
//
// This file intentionally has no runtime dependency on Mastra or React so it
// can be imported from the web app, the worker, and plugin packages alike.
// Mastra `Skill` objects are structurally compatible with
// `PluginInlineSkill`; the AI package adapts them at the agent boundary.

import type { z } from 'zod';

/** Stable kebab-case plugin identity, e.g. `paper-trading`. */
export type PluginId = string & {};

export type PluginCategory =
  'trading-execution' | 'quant-research' | 'channels-automation' | 'agents-skills' | 'market-data';

export type PluginInstallMode = 'instant' | 'wizard';

/** Core agents a plugin tool may be attached to. */
export type PluginAgentTarget =
  'canonical-chat' | 'technical' | 'fundamental' | 'risk' | 'sentiment';

export type PluginToolAccess = 'read-only' | 'sensitive-read' | 'write';

export interface PluginLogger {
  debug?(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export interface PluginStorageEntry<T = unknown> {
  key: string;
  value: T;
  updatedAt: Date;
}

/**
 * Zero-migration persistence scoped to (tenant, user, plugin).
 *
 * Backed by `plugin_storage`; a plugin never needs a SQL migration for small
 * JSON documents.
 */
export interface PluginStorage {
  get<T = unknown>(collection: string, key: string): Promise<T | null>;
  set(collection: string, key: string, value: unknown): Promise<void>;
  list<T = unknown>(collection: string): Promise<PluginStorageEntry<T>[]>;
  delete(collection: string, key: string): Promise<void>;
  clear(collection?: string): Promise<void>;
}

export interface PluginExecutionContext {
  pluginId: PluginId;
  userId: string;
  tenantId: string;
  /** Decrypted plugin settings for this user (secret fields already unwrapped). */
  settings: Readonly<Record<string, unknown>>;
  storage: PluginStorage;
  log: PluginLogger;
  signal?: AbortSignal;
  /** Opaque Mastra RequestContext, when the caller has one. */
  requestContext?: unknown;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- Plugin authoring
 * defaults must stay permissive: `any` lets a plugin register a concretely
 * typed tool in a `readonly PluginToolRegistration[]` array without
 * contravariance errors on `execute` / `toModelOutput`. The host validates
 * schemas at runtime, and each tool's own generics still constrain its
 * implementation. */
export interface PluginToolRegistration<TInput = any, TOutput = any> {
  /** Snake-case tool id exposed to the model, e.g. `run_backtest`. */
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  /**
   * Optional Mastra `toModelOutput` transformer. Lets a plugin stream a large
   * chart/equity dataset to the UI while returning a compact summary to the
   * model.
   */
  toModelOutput?: (output: TOutput) => unknown;
  access: PluginToolAccess;
  /**
   * `true` always requires approval; a function is evaluated per call so a
   * paper-trading plugin can require confirmation for the Personal account
   * but run autonomously in the Agent Sandbox account.
   */
  requiresConfirmation?:
    boolean | ((input: TInput, ctx: PluginExecutionContext) => boolean | Promise<boolean>);
  /**
   * Which core agents receive this tool when the plugin is installed.
   * Defaults to `['canonical-chat']`.
   */
  attachTo?: readonly PluginAgentTarget[];
  execute: (input: TInput, ctx: PluginExecutionContext) => TOutput | Promise<TOutput>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Minimal structural shape of a Mastra inline skill. Mastra's `createSkill()`
 * output is assignable to this without importing `@mastra/core` here.
 */
export interface PluginInlineSkill {
  name: string;
  description: string;
  instructions: string;
  references?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

/**
 * Skills may be inline objects or filesystem paths to a `SKILL.md`
 * directory (resolved by Mastra at agent construction time).
 */
export type PluginSkillInput = string | PluginInlineSkill;

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

export interface PluginInstalledUser {
  userId: string;
  tenantId: string;
  /** Decrypted plugin settings. */
  settings: Readonly<Record<string, unknown>>;
  /** Storage scoped to this user + plugin (zero-migration data). */
  storage?: PluginStorage;
}

export interface PluginJobContext {
  pluginId: PluginId;
  jobId: string;
  log: PluginLogger;
  signal: AbortSignal;
  /**
   * Users who currently have this plugin installed and enabled. A plugin job
   * must only process this set — it can never fan out to every tenant.
   */
  getInstalledUsers(): Promise<readonly PluginInstalledUser[]>;
}

export interface PluginJobRegistration {
  /** Stable job id within the plugin, e.g. `daily-briefing`. */
  id: string;
  description: string;
  /** Cron expression, or `null` for an event-driven/manual job. */
  schedule: string | null;
  /** IANA timezone. Defaults to UTC. */
  timezone?: string;
  /**
   * `daily` uses the shared cron idempotency ledger (at most once per UTC
   * day). `none` leaves idempotency to the plugin (minute-level jobs).
   * Defaults to `none`.
   */
  lock?: 'daily' | 'none';
  run: (ctx: PluginJobContext) => Promise<{ processed: number; note?: string }>;
}

export interface PluginTick {
  symbol: string;
  bid: number;
  ask: number;
  mid: number;
  /** Milliseconds since epoch (UTC). */
  ts: number;
  source: string;
  high?: number;
  low?: number;
  volume?: number;
}

export interface PluginTickContext {
  pluginId: PluginId;
  log: PluginLogger;
  signal: AbortSignal;
  getInstalledUsers(): Promise<readonly PluginInstalledUser[]>;
}

export interface PluginTickSubscriber {
  /** Stable subscriber id within the plugin. */
  id: string;
  /** Optional symbol allow-list. Empty/omitted = every symbol. */
  symbols?: readonly string[];
  handler: (tick: PluginTick, ctx: PluginTickContext) => void | Promise<void>;
}

export interface PluginAlertDeliveryArgs {
  alert: {
    id: string;
    userId: string;
    note: string | null;
    channels: readonly string[];
  };
  reading: { value: number; source: string };
  settings: Readonly<Record<string, unknown>>;
  log: PluginLogger;
  signal?: AbortSignal;
}

export interface PluginAlertChannelRegistration {
  /** Channel id persisted on `alerts.channels`, e.g. `telegram`. */
  id: string;
  label: string;
  deliver: (args: PluginAlertDeliveryArgs) => Promise<{ ok: boolean; message?: string }>;
}

export interface PluginIndicatorRegistration {
  /** Indicator kind accepted in alert specs, e.g. `supertrend`. */
  kind: string;
  description: string;
  paramsSchema: z.ZodType<Record<string, number>>;
  compute: (candles: readonly unknown[], params: Record<string, number>) => unknown[];
}

export interface PluginPacketEnricher {
  id: string;
  /** Cheap capability gate (e.g. only enrich FX symbols). */
  supportsSymbol?: (symbol: string) => boolean;
  enrich: (args: {
    userId: string;
    tenantId: string;
    symbol: string;
    settings: Readonly<Record<string, unknown>>;
    log: PluginLogger;
    signal?: AbortSignal;
  }) => Promise<Record<string, unknown> | null>;
}

export interface PluginApiRouteContext {
  request: Request;
  params: Readonly<Record<string, string>>;
  pluginId: PluginId;
  userId: string;
  tenantId: string;
  settings: Readonly<Record<string, unknown>>;
  storage: PluginStorage;
  log: PluginLogger;
}

export type PluginApiRouteHandler = (ctx: PluginApiRouteContext) => Promise<Response> | Response;

/** Install state resolved for a public (unauthenticated) plugin route. */
export interface PluginPublicInstall {
  userId: string;
  tenantId: string;
  /** Decrypted settings for that user's install. */
  settings: Readonly<Record<string, unknown>>;
  storage: PluginStorage;
}

export interface PluginPublicApiRouteContext {
  request: Request;
  params: Readonly<Record<string, string>>;
  pluginId: PluginId;
  log: PluginLogger;
  /**
   * Resolve an install by user id. Returns null when the user has not
   * installed or enabled this plugin. Public handlers MUST validate their own
   * transport secret (Telegram's `X-Telegram-Bot-Api-Secret-Token`, HMAC, …)
   * before trusting the caller.
   */
  getInstall(userId: string): Promise<PluginPublicInstall | null>;
}

export type PluginPublicApiRouteHandler = (
  ctx: PluginPublicApiRouteContext,
) => Promise<Response> | Response;

export interface PluginSetupStepAction {
  id: string;
  label: string;
}

export interface PluginSetupStepLink {
  label: string;
  /** May contain `{botUsername}` / `{token}` placeholders the UI expands. */
  urlTemplate: string;
}

/** Declarative step rendered by the Phase 2 guided setup drawer. */
export interface PluginSetupStep {
  id: string;
  title: string;
  description: string;
  kind: 'instructions' | 'credentials' | 'action' | 'link';
  optional?: boolean;
  /** Settings keys this step collects (credentials/instructions). */
  fields?: readonly string[];
  action?: PluginSetupStepAction;
  link?: PluginSetupStepLink;
}

export interface KestrelPluginManifest {
  /** Unique kebab-case id, e.g. `backtesting`, `paper-trading`. */
  id: PluginId;
  name: string;
  version: string;
  tagline: string;
  description: string;
  category: PluginCategory;
  /** Tabler icon name rendered by the plugin store. */
  iconName: string;
  /** `instant` installs in one click; `wizard` opens the guided drawer. */
  installMode: PluginInstallMode;
  /** Per-user settings schema. Fields with `.meta({ secret: true })` are encrypted at rest. */
  settingsSchema?: z.ZodObject<z.ZodRawShape>;
  defaultSettings?: Readonly<Record<string, unknown>>;
  /** Guided onboarding steps for `installMode: 'wizard'`. */
  setupSteps?: readonly PluginSetupStep[];
  /** Feature badges shown in the store, e.g. `Adds 3 AI tools`. */
  badges?: readonly string[];
}

export interface PluginUserLifecycleContext extends PluginExecutionContext {
  onboardingCompleted: boolean;
}

export interface KestrelPlugin {
  manifest: KestrelPluginManifest;
  /** Mastra skills: inline objects or paths to `SKILL.md` directories. */
  skills?: readonly PluginSkillInput[];
  tools?: readonly PluginToolRegistration[];
  agents?: readonly PluginStandaloneAgentRegistration[];
  /**
   * Per-user standalone agent catalogs. The core exposes these agents in the
   * chat agent selector / `@mention` router and optionally as Mastra
   * subagents of the canonical chat agent.
   */
  agentCatalogs?: readonly PluginUserAgentCatalog[];
  jobs?: readonly PluginJobRegistration[];
  tickSubscribers?: readonly PluginTickSubscriber[];
  alertChannels?: readonly PluginAlertChannelRegistration[];
  indicators?: readonly PluginIndicatorRegistration[];
  packetEnrichers?: readonly PluginPacketEnricher[];
  /** HTTP handlers mounted below `/api/plugins/<pluginId>/<path>`. */
  apiRoutes?: Readonly<Record<string, PluginApiRouteHandler>>;
  /**
   * Public HTTP handlers mounted below `/api/plugins/public/<pluginId>/<path>`.
   * Use only for transport webhooks (Telegram, Stripe, …); each handler must
   * validate its own signature/secret and resolve the owning user itself.
   */
  publicApiRoutes?: Readonly<Record<string, PluginPublicApiRouteHandler>>;
  /** Runs when a user clicks Install (seed accounts, defaults, …). */
  onUserInstall?: (ctx: PluginUserLifecycleContext) => Promise<void>;
  /** Runs when a user clicks Uninstall. */
  onUserUninstall?: (ctx: PluginUserLifecycleContext & { wipeData?: boolean }) => Promise<void>;
}

// ── Registered (host-normalised) shapes ──────────────────────────────────
// The host adds `pluginId` and resolves defaults so consumers never have to
// infer which package a capability came from.

export interface RegisteredPluginTool extends PluginToolRegistration {
  readonly pluginId: PluginId;
  readonly attachTo: readonly PluginAgentTarget[];
}

export interface RegisteredPluginSkill {
  readonly pluginId: PluginId;
  readonly skill: PluginSkillInput;
}

export interface RegisteredPluginAgent extends PluginStandaloneAgentRegistration {
  readonly pluginId: PluginId;
}

export interface RegisteredPluginUserAgentCatalog extends PluginUserAgentCatalog {
  readonly pluginId: PluginId;
}

/**
 * Safe core tool metadata exposed to plugins that let users compose agents
 * (the custom-agents studio). The AI package registers it at boot; the plugin
 * never imports the core tool registry directly.
 */
export interface PluginCoreToolInfo {
  name: string;
  description: string;
  access: PluginToolAccess;
  /** Category hint for the studio picker. */
  group: 'market-data' | 'analysis' | 'research' | 'journal' | 'portfolio' | 'system' | 'other';
}

export interface RegisteredPluginJob extends PluginJobRegistration {
  readonly pluginId: PluginId;
}

export interface RegisteredPluginTickSubscriber extends PluginTickSubscriber {
  readonly pluginId: PluginId;
}

export interface RegisteredPluginAlertChannel extends PluginAlertChannelRegistration {
  readonly pluginId: PluginId;
}

export interface RegisteredPluginIndicator extends PluginIndicatorRegistration {
  readonly pluginId: PluginId;
}

export interface RegisteredPluginPacketEnricher extends PluginPacketEnricher {
  readonly pluginId: PluginId;
}
