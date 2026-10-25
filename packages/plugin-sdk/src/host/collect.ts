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

// Capability collection for one plugin: validates every declared tool, skill,
// agent, catalog, job, tick subscriber, alert channel, indicator and packet
// enricher, then returns the stamped records the host will store.
//
// Validation order and error messages are part of the contract — keep them
// byte-identical when editing.

import type {
  KestrelPlugin,
  PluginSkillInput,
  RegisteredPluginAgent,
  RegisteredPluginAlertChannel,
  RegisteredPluginIndicator,
  RegisteredPluginJob,
  RegisteredPluginPacketEnricher,
  RegisteredPluginTickSubscriber,
  RegisteredPluginTool,
  RegisteredPluginUserAgentCatalog,
} from '../types';
import {
  assert,
  assertKebabId,
  assertTool,
  assertUniqueId,
  INDICATOR_KIND_RE,
  JOB_ID_RE,
  RESERVED_ALERT_CHANNELS,
  RESERVED_INDICATOR_KINDS,
  RESERVED_TOOL_NAMES,
} from './validation';

/** Capabilities already stored by the host, consulted for id collisions. */
export interface ExistingRegistrations {
  tools: ReadonlyMap<string, RegisteredPluginTool>;
  jobs: ReadonlyMap<string, RegisteredPluginJob>;
  tickSubscribers: ReadonlyMap<string, RegisteredPluginTickSubscriber>;
  alertChannels: ReadonlyMap<string, RegisteredPluginAlertChannel>;
  indicators: ReadonlyMap<string, RegisteredPluginIndicator>;
  agents: ReadonlyMap<string, RegisteredPluginAgent>;
}

export interface CollectedCapabilities {
  tools: RegisteredPluginTool[];
  skills: PluginSkillInput[];
  agents: RegisteredPluginAgent[];
  agentCatalogs: RegisteredPluginUserAgentCatalog[];
  jobs: RegisteredPluginJob[];
  tickSubscribers: RegisteredPluginTickSubscriber[];
  alertChannels: RegisteredPluginAlertChannel[];
  indicators: RegisteredPluginIndicator[];
  packetEnrichers: RegisteredPluginPacketEnricher[];
}

export function collectCapabilities(
  plugin: KestrelPlugin,
  existing: ExistingRegistrations,
): CollectedCapabilities {
  const manifest = plugin.manifest;

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
      !existing.tools.has(tool.name),
      `tool "${tool.name}" is already registered by plugin "${existing.tools.get(tool.name)?.pluginId}"`,
    );
    const requiresConfirmation =
      tool.requiresConfirmation ?? (tool.access === 'write' ? true : undefined);
    tools.push({
      ...tool,
      pluginId: manifest.id,
      attachTo: tool.attachTo && tool.attachTo.length > 0 ? [...tool.attachTo] : ['canonical-chat'],
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
      !existing.agents.has(agent.id),
      `agent "${agent.id}" is already registered by plugin "${existing.agents.get(agent.id)?.pluginId}"`,
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
    assert(!existing.jobs.has(key), `job "${key}" is already registered`);
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
    assert(!existing.tickSubscribers.has(key), `tick subscriber "${key}" is already registered`);
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
      !existing.alertChannels.has(channel.id),
      `alert channel "${channel.id}" is already registered by plugin "${existing.alertChannels.get(channel.id)?.pluginId}"`,
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
      !existing.indicators.has(indicator.kind),
      `indicator kind "${indicator.kind}" is already registered by plugin "${existing.indicators.get(indicator.kind)?.pluginId}"`,
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

  return {
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
}
