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

// Public plugin contract — guided setup steps, the plugin manifest and the
// `KestrelPlugin` capability bundle.

import type { z } from 'zod';

import type { PluginStandaloneAgentRegistration, PluginUserAgentCatalog } from './agents';
import type { PluginAlertChannelRegistration } from './alert-channels';
import type { PluginApiRouteHandler, PluginPublicApiRouteHandler } from './api-routes';
import type { PluginCategory, PluginExecutionContext, PluginId, PluginInstallMode } from './core';
import type { PluginJobRegistration } from './jobs';
import type { PluginIndicatorRegistration, PluginPacketEnricher } from './market-data';
import type { PluginTickSubscriber } from './ticks';
import type { PluginSkillInput, PluginToolRegistration } from './tools';

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
