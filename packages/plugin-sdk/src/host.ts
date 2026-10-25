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

import { TOOL_NAMES } from '@kestrel/shared';

import type {
  KestrelPlugin,
  KestrelPluginManifest,
  PluginAgentTarget,
  PluginApiRouteHandler,
  PluginCoreToolInfo,
  PluginId,
  PluginPublicApiRouteHandler,
  PluginSkillInput,
  PluginToolRegistration,
  RegisteredPluginAgent,
  RegisteredPluginAlertChannel,
  RegisteredPluginIndicator,
  RegisteredPluginJob,
  RegisteredPluginPacketEnricher,
  RegisteredPluginSkill,
  RegisteredPluginTickSubscriber,
  RegisteredPluginTool,
  RegisteredPluginUserAgentCatalog,
} from './types';

const PLUGIN_ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const TOOL_NAME_RE = /^[a-z][a-z0-9_]{0,63}$/;
const JOB_ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const INDICATOR_KIND_RE = /^[a-z][a-z0-9_]{0,47}$/;

const AGENT_TARGETS: ReadonlySet<PluginAgentTarget> = new Set([
  'canonical-chat',
  'technical',
  'fundamental',
  'risk',
  'sentiment',
]);

/** Tool ids owned by the core. A plugin may never shadow one. */
const RESERVED_TOOL_NAMES = new Set<string>(TOOL_NAMES);

/**
 * Notification channels implemented by the core delivery registry. Plugin
 * channels must use a distinct id so ordering/fallback remains predictable.
 */
const RESERVED_ALERT_CHANNELS = new Set(['email', 'telegram', 'web-push']);

/** Core indicator kinds; plugins add new kinds instead of shadowing these. */
const RESERVED_INDICATOR_KINDS = new Set([
  'sma',
  'ema',
  'rsi',
  'macd',
  'atr',
  'bollinger',
  'pivots',
]);

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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[plugin-sdk] ${message}`);
}

function assertKebabId(value: string, label: string): void {
  assert(PLUGIN_ID_RE.test(value), `${label} must be kebab-case, got "${value}"`);
}

function assertUniqueId(seen: Set<string>, id: string, label: string): void {
  assert(!seen.has(id), `duplicate ${label} "${id}"`);
  seen.add(id);
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

    const tools: RegisteredPluginTool[] = [];
    const seenWithinPlugin = new Set<string>();
    for (const tool of plugin.tools ?? []) {
      assertTool(tool, manifest.id);
      assertUniqueId(seenWithinPlugin, tool.name, `tool in plugin "${manifest.id}"`);
      assert(
        !RESERVED_TOOL_NAMES.has(tool.name),
        `plugin "${manifest.id}" tool "${tool.name}" collides with a core tool`,
      );
      assert(
        !this.tools.has(tool.name),
        `tool "${tool.name}" is already registered by plugin "${this.tools.get(tool.name)?.pluginId}"`,
      );
      const requiresConfirmation =
        tool.requiresConfirmation ?? (tool.access === 'write' ? true : undefined);
      tools.push({
        ...tool,
        pluginId: manifest.id,
        attachTo:
          tool.attachTo && tool.attachTo.length > 0 ? [...tool.attachTo] : ['canonical-chat'],
        // Fail safe: a write tool must be explicit about autonomous execution.
        ...(requiresConfirmation !== undefined ? { requiresConfirmation } : {}),
      });
    }

    const skills: PluginSkillInput[] = [];
    for (const skill of plugin.skills ?? []) {
      if (typeof skill === 'string') {
        assert(skill.trim().length > 0, `plugin "${manifest.id}" has an empty skill path`);
      } else {
        assert(
          skill && typeof skill.name === 'string' && skill.name.trim().length > 0,
          `plugin "${manifest.id}" inline skills require a name`,
        );
        assert(
          /^[a-z0-9][a-z0-9-]{0,63}$/.test(skill.name),
          `plugin "${manifest.id}" skill name "${skill.name}" must be lowercase letters/numbers/hyphens (max 64 chars)`,
        );
        assert(
          typeof skill.description === 'string' && skill.description.trim().length > 0,
          `plugin "${manifest.id}" skill "${skill.name}" requires a description`,
        );
        assert(
          typeof skill.instructions === 'string' && skill.instructions.trim().length > 0,
          `plugin "${manifest.id}" skill "${skill.name}" requires instructions`,
        );
      }
      skills.push(skill);
    }

    const agents: RegisteredPluginAgent[] = [];
    const seenAgents = new Set<string>();
    for (const agent of plugin.agents ?? []) {
      assertKebabId(agent.id, `agent id in plugin "${manifest.id}"`);
      assertUniqueId(seenAgents, agent.id, `agent in plugin "${manifest.id}"`);
      assert(
        !this.agents.has(agent.id),
        `agent "${agent.id}" is already registered by plugin "${this.agents.get(agent.id)?.pluginId}"`,
      );
      assert(agent.instructions !== undefined, `agent "${agent.id}" requires instructions`);
      agents.push({ ...agent, pluginId: manifest.id });
    }

    const agentCatalogs: RegisteredPluginUserAgentCatalog[] = [];
    const seenCatalogs = new Set<string>();
    for (const catalog of plugin.agentCatalogs ?? []) {
      assert(
        catalog && typeof catalog === 'object',
        `plugin "${manifest.id}" has an invalid agent catalog`,
      );
      assertKebabId(catalog.id, `agent catalog id in plugin "${manifest.id}"`);
      assertUniqueId(seenCatalogs, catalog.id, `agent catalog in plugin "${manifest.id}"`);
      assert(
        typeof catalog.listAgents === 'function',
        `agent catalog "${catalog.id}" requires listAgents()`,
      );
      assert(
        typeof catalog.getAgent === 'function',
        `agent catalog "${catalog.id}" requires getAgent()`,
      );
      agentCatalogs.push({ ...catalog, pluginId: manifest.id });
    }

    const jobs: RegisteredPluginJob[] = [];
    const seenJobs = new Set<string>();
    for (const job of plugin.jobs ?? []) {
      assert(JOB_ID_RE.test(job.id), `job id "${job.id}" must be kebab-case`);
      assertUniqueId(seenJobs, job.id, `job in plugin "${manifest.id}"`);
      const key = `${manifest.id}:${job.id}`;
      assert(!this.jobs.has(key), `job "${key}" is already registered`);
      jobs.push({ ...job, pluginId: manifest.id });
    }

    const tickSubscribers: RegisteredPluginTickSubscriber[] = [];
    const seenTicks = new Set<string>();
    for (const subscriber of plugin.tickSubscribers ?? []) {
      assert(
        JOB_ID_RE.test(subscriber.id),
        `tick subscriber id "${subscriber.id}" must be kebab-case`,
      );
      const key = `${manifest.id}:${subscriber.id}`;
      assertUniqueId(seenTicks, key, 'tick subscriber');
      assert(!this.tickSubscribers.has(key), `tick subscriber "${key}" is already registered`);
      tickSubscribers.push({ ...subscriber, pluginId: manifest.id });
    }

    const alertChannels: RegisteredPluginAlertChannel[] = [];
    const seenChannels = new Set<string>();
    for (const channel of plugin.alertChannels ?? []) {
      assertKebabId(channel.id, `alert channel id in plugin "${manifest.id}"`);
      assertUniqueId(seenChannels, channel.id, `alert channel in plugin "${manifest.id}"`);
      assert(
        !RESERVED_ALERT_CHANNELS.has(channel.id),
        `alert channel "${channel.id}" is reserved by the core`,
      );
      assert(
        !this.alertChannels.has(channel.id),
        `alert channel "${channel.id}" is already registered by plugin "${this.alertChannels.get(channel.id)?.pluginId}"`,
      );
      alertChannels.push({ ...channel, pluginId: manifest.id });
    }

    const indicators: RegisteredPluginIndicator[] = [];
    const seenIndicators = new Set<string>();
    for (const indicator of plugin.indicators ?? []) {
      assert(
        INDICATOR_KIND_RE.test(indicator.kind),
        `indicator kind "${indicator.kind}" must be snake_case`,
      );
      assertUniqueId(seenIndicators, indicator.kind, `indicator in plugin "${manifest.id}"`);
      assert(
        !RESERVED_INDICATOR_KINDS.has(indicator.kind),
        `indicator kind "${indicator.kind}" is reserved by the core`,
      );
      assert(
        !this.indicators.has(indicator.kind),
        `indicator kind "${indicator.kind}" is already registered by plugin "${this.indicators.get(indicator.kind)?.pluginId}"`,
      );
      indicators.push({ ...indicator, pluginId: manifest.id });
    }

    const packetEnrichers: RegisteredPluginPacketEnricher[] = [];
    const seenEnrichers = new Set<string>();
    for (const enricher of plugin.packetEnrichers ?? []) {
      assert(JOB_ID_RE.test(enricher.id), `packet enricher id "${enricher.id}" must be kebab-case`);
      const key = `${manifest.id}:${enricher.id}`;
      assertUniqueId(seenEnrichers, key, 'packet enricher');
      packetEnrichers.push({ ...enricher, pluginId: manifest.id });
    }

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
      tools,
      skills,
      agents,
      agentCatalogs,
      jobs,
      tickSubscribers,
      alertChannels,
      indicators,
      packetEnrichers,
    };
    this.plugins.set(manifest.id, registered);

    for (const tool of tools) this.tools.set(tool.name, tool);
    for (const job of jobs) this.jobs.set(`${job.pluginId}:${job.id}`, job);
    for (const subscriber of tickSubscribers) {
      this.tickSubscribers.set(`${subscriber.pluginId}:${subscriber.id}`, subscriber);
    }
    for (const channel of alertChannels) this.alertChannels.set(channel.id, channel);
    for (const indicator of indicators) this.indicators.set(indicator.kind, indicator);
    for (const agent of agents) this.agents.set(agent.id, agent);
    for (const catalog of agentCatalogs) {
      this.agentCatalogs.set(`${catalog.pluginId}:${catalog.id}`, catalog);
    }
    for (const enricher of packetEnrichers) {
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
    const seen = new Set<string>();
    const result: RegisteredPlugin[] = [];
    for (const id of installedPluginIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const plugin = this.plugins.get(id);
      if (plugin) result.push(plugin);
    }
    return result;
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
    const installed = new Set(installedPluginIds);
    if (installed.size === 0) return [];
    const disabled = new Set(options.disabledTools ?? []);
    const target = options.target;
    return [...this.tools.values()].filter((tool) => {
      if (!installed.has(tool.pluginId)) return false;
      if (disabled.has(tool.name)) return false;
      if (target && !tool.attachTo.includes(target)) return false;
      return true;
    });
  }

  resolveSkillsForUser(installedPluginIds: readonly string[]): readonly RegisteredPluginSkill[] {
    const result: RegisteredPluginSkill[] = [];
    for (const plugin of this.getInstalledPlugins(installedPluginIds)) {
      for (const skill of plugin.skills) {
        result.push({ pluginId: plugin.manifest.id, skill });
      }
    }
    return result;
  }

  resolveAgentsForUser(installedPluginIds: readonly string[]): readonly RegisteredPluginAgent[] {
    const installed = new Set(installedPluginIds);
    if (installed.size === 0) return [];
    return [...this.agents.values()].filter((agent) => installed.has(agent.pluginId));
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
    const installed = new Set(installedPluginIds);
    if (installed.size === 0) return [];
    return [...this.agentCatalogs.values()].filter((catalog) => installed.has(catalog.pluginId));
  }

  resolveJobsForUser(installedPluginIds: readonly string[]): readonly RegisteredPluginJob[] {
    const installed = new Set(installedPluginIds);
    if (installed.size === 0) return [];
    return [...this.jobs.values()].filter((job) => installed.has(job.pluginId));
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

function assertTool(tool: PluginToolRegistration, pluginId: PluginId): void {
  assert(tool && typeof tool === 'object', `plugin "${pluginId}" has an invalid tool`);
  assert(
    TOOL_NAME_RE.test(tool.name),
    `plugin "${pluginId}" tool name "${tool.name}" must be snake_case (max 64 chars)`,
  );
  assert(
    typeof tool.description === 'string' && tool.description.trim().length > 0,
    `plugin "${pluginId}" tool "${tool.name}" requires a description`,
  );
  assert(
    tool.inputSchema !== undefined && tool.outputSchema !== undefined,
    `plugin "${pluginId}" tool "${tool.name}" requires input and output schemas`,
  );
  assert(
    tool.access === 'read-only' || tool.access === 'sensitive-read' || tool.access === 'write',
    `plugin "${pluginId}" tool "${tool.name}" has an invalid access level`,
  );
  assert(
    typeof tool.execute === 'function',
    `plugin "${pluginId}" tool "${tool.name}" requires an execute function`,
  );
  for (const target of tool.attachTo ?? []) {
    assert(
      AGENT_TARGETS.has(target),
      `plugin "${pluginId}" tool "${tool.name}" has an invalid attachTo target "${String(target)}"`,
    );
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
