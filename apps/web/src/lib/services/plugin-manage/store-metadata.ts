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

// SPDX-License-Identifier: Apache-2.0

// Plugin Store metadata: capabilities, badges, settings masking and the
// Store/shell snapshots consumed by server components and the manage route.

import {
  listInstalledPlugins,
  requireTenantIdForUser,
  withTenantDb,
  type InstalledPluginRow,
} from '@kestrel/db';
import {
  describePluginSettingsSchema,
  pluginHost,
  type KestrelPluginManifest,
  type RegisteredPlugin,
} from '@kestrel/plugin-sdk';
import { decryptPluginSettings, maskPluginSettings } from '@kestrel/plugin-sdk/settings';
import { pluginUiRegistry } from '@kestrel/plugin-sdk/ui';

import type {
  PluginCapabilitySummary,
  PluginStoreEntry,
  PluginStoreSnapshot,
} from '../../plugins/types';
import { plog } from './runtime';

function skillName(skill: RegisteredPlugin['skills'][number]): {
  name: string;
  description?: string;
  path?: string;
} {
  if (typeof skill === 'string') {
    const normalized = skill.replaceAll('\\', '/').replace(/\/+$/, '');
    const name = normalized.split('/').filter(Boolean).at(-1) ?? normalized;
    return { name, path: skill };
  }
  return {
    name: skill.name,
    ...(skill.description ? { description: skill.description } : {}),
  };
}

function capabilitiesFor(registered: RegisteredPlugin): PluginCapabilitySummary {
  const ui = pluginUiRegistry.get(registered.manifest.id);
  return {
    tools: registered.tools.length,
    skills: registered.skills.length,
    jobs: registered.jobs.length,
    tickSubscribers: registered.tickSubscribers.length,
    alertChannels: registered.alertChannels.length,
    indicators: registered.indicators.length,
    agents: registered.agents.length,
    packetEnrichers: registered.packetEnrichers.length,
    apiRoutes: Object.keys(pluginHost.getApiRoutes(registered.manifest.id) ?? {}).length,
    navItems: ui?.navItems?.length ?? 0,
    dashboardWidgets: ui?.dashboardWidgets?.length ?? 0,
    slashCommands: ui?.slashCommands?.length ?? 0,
  };
}

function computedBadges(capabilities: PluginCapabilitySummary): string[] {
  const badges: string[] = [];
  if (capabilities.tools > 0) {
    badges.push(`${capabilities.tools} AI tool${capabilities.tools === 1 ? '' : 's'}`);
  }
  if (capabilities.skills > 0) {
    badges.push(`${capabilities.skills} skill${capabilities.skills === 1 ? '' : 's'}`);
  }
  if (capabilities.navItems > 0) {
    badges.push(`${capabilities.navItems} sidebar tab${capabilities.navItems === 1 ? '' : 's'}`);
  }
  if (capabilities.dashboardWidgets > 0) {
    badges.push(
      `${capabilities.dashboardWidgets} dashboard widget${
        capabilities.dashboardWidgets === 1 ? '' : 's'
      }`,
    );
  }
  if (capabilities.jobs > 0) {
    badges.push(`${capabilities.jobs} scheduled job${capabilities.jobs === 1 ? '' : 's'}`);
  }
  return badges;
}

export function decryptedRowSettings(
  manifest: KestrelPluginManifest,
  row: InstalledPluginRow | undefined,
): Record<string, unknown> {
  if (!row) return {};
  return decryptPluginSettings(
    manifest.settingsSchema,
    row.settings && typeof row.settings === 'object' ? row.settings : {},
  );
}

/**
 * Run a plugin-table read inside the caller's tenant transaction.
 *
 * API routes already have one from `withAuth`; server components do not, so
 * this wrapper resolves the tenant and sets the RLS GUC either way.
 */
export async function withUserTenant<T>(userId: string, work: () => Promise<T>): Promise<T> {
  const tenantId = await requireTenantIdForUser(userId);
  return withTenantDb(tenantId, work, { userId });
}

export function buildPluginStoreEntry(
  registered: RegisteredPlugin,
  row: InstalledPluginRow | undefined,
): PluginStoreEntry {
  const manifest = registered.manifest;
  const capabilities = capabilitiesFor(registered);
  const plain = decryptedRowSettings(manifest, row);
  const description = describePluginSettingsSchema(manifest.settingsSchema);
  const ui = pluginUiRegistry.get(manifest.id);
  const primaryHref = ui?.navItems?.[0]?.href ?? null;

  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    tagline: manifest.tagline,
    description: manifest.description,
    category: manifest.category,
    iconName: manifest.iconName,
    installMode: manifest.installMode,
    badges:
      manifest.badges && manifest.badges.length > 0
        ? [...manifest.badges]
        : computedBadges(capabilities),
    capabilities,
    tools: registered.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      access: tool.access,
    })),
    skills: registered.skills.map(skillName),
    installed: row !== undefined,
    enabled: row?.enabled ?? false,
    onboardingCompleted: row?.onboardingCompleted ?? false,
    installedAt: row?.installedAt ? row.installedAt.toISOString() : null,
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    settings: maskPluginSettings(manifest.settingsSchema, plain),
    settingsFields: description.fields,
    setupSteps: manifest.setupSteps ?? [],
    primaryHref,
  };
}

/** Every registered plugin + this user's install state, ready for the Store. */
export async function buildPluginStoreSnapshot(userId: string): Promise<PluginStoreSnapshot> {
  const rows = await withUserTenant(userId, () => listInstalledPlugins(userId));
  const rowByPluginId = new Map(rows.map((row) => [row.pluginId, row]));

  const plugins: PluginStoreEntry[] = [];
  for (const manifest of pluginHost.listAvailablePlugins()) {
    const registered = pluginHost.getPlugin(manifest.id);
    if (!registered) continue;
    plugins.push(buildPluginStoreEntry(registered, rowByPluginId.get(manifest.id)));
  }

  return { plugins, installedCount: rows.length };
}

export interface PluginShellContext {
  /** Enabled plugin ids, in install order. */
  installedPluginIds: string[];
  /** Masked per-plugin settings for client widgets (never contains secrets). */
  pluginSettings: Record<string, Record<string, unknown>>;
}

/**
 * Lightweight install context for the app shell (sidebar, ⌘K, dashboard).
 *
 * Secrets are masked before crossing the server/client boundary; a plugin
 * dashboard widget must render from non-secret settings or fetch its own data
 * through an authenticated plugin API route.
 */
export async function buildPluginShellContext(userId: string): Promise<PluginShellContext> {
  let rows: InstalledPluginRow[];
  try {
    rows = await withUserTenant(userId, () => listInstalledPlugins(userId));
  } catch (err) {
    plog.warn('plugin shell context unavailable; continuing core-only', {
      userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { installedPluginIds: [], pluginSettings: {} };
  }

  const pluginSettings: Record<string, Record<string, unknown>> = {};
  const installedPluginIds: string[] = [];

  for (const row of rows) {
    const manifest = pluginHost.getPlugin(row.pluginId)?.manifest;
    const plain = decryptPluginSettings(
      manifest?.settingsSchema,
      row.settings && typeof row.settings === 'object' ? row.settings : {},
    );
    pluginSettings[row.pluginId] = manifest
      ? maskPluginSettings(manifest.settingsSchema, plain)
      : plain;
    if (row.enabled) installedPluginIds.push(row.pluginId);
  }

  return { installedPluginIds, pluginSettings };
}
