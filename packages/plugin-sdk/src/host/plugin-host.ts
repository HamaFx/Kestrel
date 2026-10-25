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

// PluginHost — the single registry the core resolves capabilities from.
//
// The host is deliberately framework-free. The AI package adapts plugin tool
// registrations into Mastra tools, the worker adapts jobs/tick subscribers,
// and the web app adapts UI slots. This keeps the contract testable without a
// database, Mastra, Next.js, or React.
//
// Registration-time validation lives in `./validation` + `./collect`; the
// per-user resolvers live in `./resolution` and read the maps owned here.

import type {
  KestrelPlugin,
  KestrelPluginManifest,
  PluginAgentTarget,
  PluginApiRouteHandler,
  PluginCoreToolInfo,
  PluginId,
  PluginPublicApiRouteHandler,
  PluginSkillInput,
  RegisteredPluginAgent,
  RegisteredPluginAlertChannel,
  RegisteredPluginIndicator,
  RegisteredPluginJob,
  RegisteredPluginPacketEnricher,
  RegisteredPluginSkill,
  RegisteredPluginTickSubscriber,
  RegisteredPluginTool,
  RegisteredPluginUserAgentCatalog,
} from '../types';
import { collectCapabilities } from './collect';
import {
  installedPlugins,
  resolveAgentCatalogs,
  resolveAgents,
  resolveJobs,
  resolveSkills,
  resolveTools,
} from './resolution';
import { assert, assertKebabId } from './validation';

export interface RegisteredPlugin {
  readonly plugin: KestrelPlugin;
  readonly manifest: KestrelPluginManifest;
  readonly tools: readonly RegisteredPluginTool[];
  readonly skills: readonly PluginSkillInput[];
  readonly agents: readonly RegisteredPluginAgent[];
  readonly agentCatalogs: readonly RegisteredPluginUserAgentCatalog[];
  readonly jobs: readonly RegisteredPluginJob[];
  readonly tickSubscribers: readonly RegisteredPluginTickSubscriber[];
  readonly alertChannels: readonly RegisteredPluginAlertChannel[];
  readonly indicators: readonly RegisteredPluginIndicator[];
  readonly packetEnrichers: readonly RegisteredPluginPacketEnricher[];
}

export interface ResolveToolsOptions {
  /** User-disabled tool ids. */
  disabledTools?: readonly string[] | undefined;
  /** Only return tools attached to this core agent. Omit for every target. */
  target?: PluginAgentTarget | undefined;
}

/**
 * Registry of available plugins and resolver of per-user capabilities.
 *
 * Registration is process-global (the host is a singleton) because plugin
 * packages are bundled at build time. Per-user visibility is decided by the
 * installed-id list passed by the caller; the host never caches user state.
 */
export class PluginHost {
  private readonly plugins = new Map<PluginId, RegisteredPlugin>();
  private readonly tools = new Map<string, RegisteredPluginTool>();
  private readonly jobs = new Map<string, RegisteredPluginJob>();
  private readonly tickSubscribers = new Map<string, RegisteredPluginTickSubscriber>();
  private readonly alertChannels = new Map<string, RegisteredPluginAlertChannel>();
  private readonly indicators = new Map<string, RegisteredPluginIndicator>();
  private readonly agents = new Map<string, RegisteredPluginAgent>();
  private readonly agentCatalogs = new Map<string, RegisteredPluginUserAgentCatalog>();
  private readonly packetEnrichers = new Map<string, RegisteredPluginPacketEnricher>();
  private coreTools: readonly PluginCoreToolInfo[] = [];
  private readonly apiRoutes = new Map<string, Readonly<Record<string, PluginApiRouteHandler>>>();
  private readonly publicApiRoutes = new Map<
    string,
    Readonly<Record<string, PluginPublicApiRouteHandler>>
  >();

  /** Register a plugin. Throws on duplicate ids or reserved capability ids. */
  register(plugin: KestrelPlugin): void {
    assert(plugin && typeof plugin === 'object', 'plugin must be an object');
    const manifest = plugin.manifest;
    assert(manifest && typeof manifest === 'object', 'plugin.manifest is required');
    assertKebabId(manifest.id, 'plugin id');
    assert(manifest.name.trim().length > 0, `plugin "${manifest.id}" requires a name`);
    assert(manifest.version.trim().length > 0, `plugin "${manifest.id}" requires a version`);
    assert(!this.plugins.has(manifest.id), `plugin "${manifest.id}" is already registered`);

    const capabilities = collectCapabilities(plugin, {
      tools: this.tools,
      jobs: this.jobs,
      tickSubscribers: this.tickSubscribers,
      alertChannels: this.alertChannels,
      indicators: this.indicators,
      agents: this.agents,
    });

    if (plugin.apiRoutes) {
      for (const route of Object.keys(plugin.apiRoutes)) {
        assert(
          route.startsWith('/'),
          `api route "${route}" in plugin "${manifest.id}" must start with "/"`,
        );
      }
      this.apiRoutes.set(manifest.id, plugin.apiRoutes);
    }

    if (plugin.publicApiRoutes) {
      for (const route of Object.keys(plugin.publicApiRoutes)) {
        assert(
          route.startsWith('/'),
          `public api route "${route}" in plugin "${manifest.id}" must start with "/"`,
        );
      }
      this.publicApiRoutes.set(manifest.id, plugin.publicApiRoutes);
    }

    const registered: RegisteredPlugin = {
      plugin,
      manifest,
      tools: capabilities.tools,
      skills: capabilities.skills,
      agents: capabilities.agents,
      agentCatalogs: capabilities.agentCatalogs,
      jobs: capabilities.jobs,
      tickSubscribers: capabilities.tickSubscribers,
      alertChannels: capabilities.alertChannels,
      indicators: capabilities.indicators,
      packetEnrichers: capabilities.packetEnrichers,
    };
    this.plugins.set(manifest.id, registered);

    for (const tool of capabilities.tools) this.tools.set(tool.name, tool);
    for (const job of capabilities.jobs) this.jobs.set(`${job.pluginId}:${job.id}`, job);
    for (const subscriber of capabilities.tickSubscribers) {
      this.tickSubscribers.set(`${subscriber.pluginId}:${subscriber.id}`, subscriber);
    }
    for (const channel of capabilities.alertChannels) this.alertChannels.set(channel.id, channel);
    for (const indicator of capabilities.indicators) this.indicators.set(indicator.kind, indicator);
    for (const agent of capabilities.agents) this.agents.set(agent.id, agent);
    for (const catalog of capabilities.agentCatalogs) {
      this.agentCatalogs.set(`${catalog.pluginId}:${catalog.id}`, catalog);
    }
    for (const enricher of capabilities.packetEnrichers) {
      this.packetEnrichers.set(`${enricher.pluginId}:${enricher.id}`, enricher);
    }
  }

  /** Every available plugin manifest, sorted by display name. */
  listAvailablePlugins(): readonly KestrelPluginManifest[] {
    return [...this.plugins.values()]
      .map((entry) => entry.manifest)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getPlugin(id: string): RegisteredPlugin | undefined {
    return this.plugins.get(id);
  }

  hasPlugin(id: string): boolean {
    return this.plugins.has(id);
  }

  /** Installed manifests in the order supplied, ignoring unknown ids. */
  getInstalledPlugins(installedPluginIds: readonly string[]): readonly RegisteredPlugin[] {
    return installedPlugins(this.plugins, installedPluginIds);
  }

  /**
   * Resolve the plugin tools a user may see.
   *
   * The result is fail-closed: tools from plugins not in `installedPluginIds`
   * are never returned, even if every plugin is registered in the process.
   */
  resolveToolsForUser(
    installedPluginIds: readonly string[],
    options: ResolveToolsOptions = {},
  ): readonly RegisteredPluginTool[] {
    return resolveTools(this.tools, installedPluginIds, options);
  }

  resolveSkillsForUser(installedPluginIds: readonly string[]): readonly RegisteredPluginSkill[] {
    return resolveSkills(this.plugins, installedPluginIds);
  }

  resolveAgentsForUser(installedPluginIds: readonly string[]): readonly RegisteredPluginAgent[] {
    return resolveAgents(this.agents, installedPluginIds);
  }

  /**
   * Per-user agent catalogs belonging to installed plugins.
   *
   * The core asks each catalog for its user's agents; a catalog from an
   * uninstalled plugin is never returned.
   */
  resolveAgentCatalogsForUser(
    installedPluginIds: readonly string[],
  ): readonly RegisteredPluginUserAgentCatalog[] {
    return resolveAgentCatalogs(this.agentCatalogs, installedPluginIds);
  }

  resolveJobsForUser(installedPluginIds: readonly string[]): readonly RegisteredPluginJob[] {
    return resolveJobs(this.jobs, installedPluginIds);
  }

  /**
   * Register the safe core tool catalog used by user-agent studios.
   *
   * Host-injected so plugin packages never import the core tool registry.
   * Idempotent; the latest registration wins (boot + tests).
   */
  setCoreTools(tools: readonly PluginCoreToolInfo[]): void {
    this.coreTools = [...tools];
  }

  getCoreTools(): readonly PluginCoreToolInfo[] {
    return this.coreTools;
  }

  getTool(name: string): RegisteredPluginTool | undefined {
    return this.tools.get(name);
  }

  isWriteTool(name: string): boolean {
    return this.tools.get(name)?.access === 'write';
  }

  /**
   * Conservative static approval check. A dynamic `requiresConfirmation`
   * function is reported as `true` here; the Mastra adapter evaluates it
   * per call with the real input.
   */
  requiresConfirmationForTool(name: string): boolean {
    const tool = this.tools.get(name);
    if (!tool) return false;
    return tool.requiresConfirmation === true || typeof tool.requiresConfirmation === 'function';
  }

  getJobs(): readonly RegisteredPluginJob[] {
    return [...this.jobs.values()];
  }

  getTickSubscribers(): readonly RegisteredPluginTickSubscriber[] {
    return [...this.tickSubscribers.values()];
  }

  getAlertChannels(): readonly RegisteredPluginAlertChannel[] {
    return [...this.alertChannels.values()];
  }

  getAlertChannel(id: string): RegisteredPluginAlertChannel | undefined {
    return this.alertChannels.get(id);
  }

  getIndicators(): readonly RegisteredPluginIndicator[] {
    return [...this.indicators.values()];
  }

  getPacketEnrichers(): readonly RegisteredPluginPacketEnricher[] {
    return [...this.packetEnrichers.values()];
  }

  getApiRoutes(pluginId: string): Readonly<Record<string, PluginApiRouteHandler>> | undefined {
    return this.apiRoutes.get(pluginId);
  }

  getPublicApiRoutes(
    pluginId: string,
  ): Readonly<Record<string, PluginPublicApiRouteHandler>> | undefined {
    return this.publicApiRoutes.get(pluginId);
  }

  /** Number of registered plugins (diagnostics / tests). */
  get size(): number {
    return this.plugins.size;
  }

  /** Remove every registration. Tests only — production registers once at boot. */
  clear(): void {
    this.plugins.clear();
    this.tools.clear();
    this.jobs.clear();
    this.tickSubscribers.clear();
    this.alertChannels.clear();
    this.indicators.clear();
    this.agents.clear();
    this.agentCatalogs.clear();
    this.packetEnrichers.clear();
    this.apiRoutes.clear();
    this.publicApiRoutes.clear();
    this.coreTools = [];
  }
}

/**
 * Process-wide host. Plugins are registered once at application boot.
 *
 * Anchored on `globalThis` because Next.js can evaluate this module in more
 * than one server bundle (instrumentation vs. route chunks); a per-bundle
 * singleton would leave the route handler with an empty host.
 */
const globalForPlugins = globalThis as unknown as { __kestrelPluginHost?: PluginHost };

export const pluginHost = (globalForPlugins.__kestrelPluginHost ??= new PluginHost());
