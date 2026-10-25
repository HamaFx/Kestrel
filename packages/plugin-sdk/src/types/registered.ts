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

// Public plugin contract — registered (host-normalised) shapes.
//
// The host adds `pluginId` and resolves defaults so consumers never have to
// infer which package a capability came from.

import type { PluginStandaloneAgentRegistration, PluginUserAgentCatalog } from './agents';
import type { PluginAlertChannelRegistration } from './alert-channels';
import type { PluginAgentTarget, PluginId } from './core';
import type { PluginJobRegistration } from './jobs';
import type { PluginIndicatorRegistration, PluginPacketEnricher } from './market-data';
import type { PluginTickSubscriber } from './ticks';
import type { PluginSkillInput, PluginToolRegistration } from './tools';

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
